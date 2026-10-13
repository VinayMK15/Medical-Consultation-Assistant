import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request

from deep_translator import MyMemoryTranslator

logger = logging.getLogger(__name__)

# Languages we actively support for reply translation.
# Extend this list as needed.
SUPPORTED_LANGS = {
    "en", "hi", "ta", "te", "kn", "ml", "mr", "bn", "gu", "pa",  # Indian languages
    "fr", "de", "es", "pt", "ar", "zh-CN", "ja", "ko",  # International
}


def detect_script_lang(text: str) -> str:
    """Detect Indian regional language by Unicode script range."""
    if not text:
        return "en"
    if re.search(r"[\u0900-\u097F]", text):
        return "hi"  # Devanagari (Hindi/Marathi)
    if re.search(r"[\u0B80-\u0BFF]", text):
        return "ta"  # Tamil
    if re.search(r"[\u0C00-\u0C7F]", text):
        return "te"  # Telugu
    if re.search(r"[\u0C80-\u0CFF]", text):
        return "kn"  # Kannada
    if re.search(r"[\u0D00-\u0D7F]", text):
        return "ml"  # Malayalam
    if re.search(r"[\u0980-\u09FF]", text):
        return "bn"  # Bengali
    if re.search(r"[\u0A80-\u0AFF]", text):
        return "gu"  # Gujarati
    if re.search(r"[\u0A00-\u0A7F]", text):
        return "pa"  # Punjabi
    return "en"


# ---------------------------------------------------------------------------
# Translation backends
# ---------------------------------------------------------------------------

_GTX_URL = "https://translate.googleapis.com/translate_a/single"

# MyMemory keys languages by locale, so bare ISO-639-1 codes are rejected.
# Only the languages this app supports need an entry.
_MYMEMORY_LOCALES = {
    # Target English also needs a locale — bare "en" is rejected too.
    "en": "en-GB",
    "hi": "hi-IN", "ta": "ta-IN", "te": "te-IN", "kn": "kn-IN",
    "ml": "ml-IN", "mr": "mr-IN", "bn": "bn-IN", "gu": "gu-IN", "pa": "pa-IN",
}


def _google_translate(text: str, target: str = "en") -> tuple[str, str | None]:
    """
    Translate `text` to `target` using Google's `client=gtx` JSON endpoint.

    Why this exists instead of deep_translator's GoogleTranslator: that class
    scrapes the mobile HTML page at translate.google.com/m and parses
    <div class="t0"> out of it with BeautifulSoup. Google has deprecated and
    rate-limited that route, so it returns HTTP 429 TooManyRequests for
    essentially every call. The JSON endpoint below is what the Google Translate
    web UI itself uses, and it answers reliably.

    Returns (translated_text, detected_source_lang). detected_source_lang is None
    when Google does not report one.

    Raises on any failure so callers can fall through to the next backend.
    """
    url = (
        f"{_GTX_URL}?client=gtx&sl=auto&tl={target}&dt=t&q="
        + urllib.parse.quote(text)
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as response:
        data = json.loads(response.read().decode("utf-8"))
    translated = "".join(seg[0] for seg in data[0] if seg and seg[0])
    detected = data[2] if len(data) > 2 and data[2] else None
    if not translated:
        raise ValueError("Google gtx returned an empty translation")
    return translated, detected


def _translate_with_mymemory(text: str, source: str, target: str) -> str | None:
    """
    Fallback translation via the MyMemory free API.

    deep_translator already ships this engine, so there is no new dependency.
    MyMemory's free tier is anonymous and rate-limited, which is fine for a
    fallback that only runs when Google is unreachable. Returns None on any
    failure so the caller can fall back further.
    """
    # MyMemory identifies languages by locale ("hi-IN"), not bare ISO-639-1
    # ("hi"). Passing the bare code returns HTTP 400 with a 400-line dump of
    # every supported language, so map the codes we actually use.
    src_locale = _MYMEMORY_LOCALES.get(source, source)
    tgt_locale = _MYMEMORY_LOCALES.get(target, target)

    try:
        translated = MyMemoryTranslator(source=src_locale, target=tgt_locale).translate(text)
    except Exception as exc:
        # Truncate: the MyMemory error carries its entire language table,
        # which floods the log with hundreds of lines per failed request.
        logger.warning(
            "MyMemory translation failed (%s -> %s): %s",
            src_locale, tgt_locale, str(exc)[:120],
        )
        return None
    return translated or None


def detect_and_translate_to_english(text: str) -> tuple[str, str]:
    """
    Detect the source language of `text` and translate it to English.

    Returns
    -------
    (translated_text, detected_lang_code)
        - translated_text  : the English version of the input (or original on failure)
        - detected_lang_code : ISO 639-1 code such as 'hi', 'ta', 'en', etc.
                               Falls back to 'en' if detection fails.
    """
    if not text or not text.strip():
        return text, "en"

    # Pre-check regional script. This is the fallback language when the backend
    # does not report a detected source, and it is what the reply-localization
    # path uses to decide whether translation is needed at all.
    script_lang = detect_script_lang(text)

    # Already English (Latin script, no Indic block) — nothing to translate.
    # This is the common case: most patients type in English, and calling the
    # network for them added a round-trip and a failure mode for no benefit.
    # Mixed input like "मुझे Whitefield में बुखार है" still has a Devanagari
    # block, so it correctly routes to the translation path below.
    if script_lang == "en":
        return text, "en"

    # Backend 1: Google gtx JSON endpoint.
    try:
        translated, detected = _google_translate(text, "en")
        if detected and detected != "auto":
            return translated, detected
        return translated, script_lang
    except Exception as exc:
        logger.warning("Google gtx translation failed: %s", exc)

    # Backend 2: MyMemory. It has no auto-detection — it rejects "auto" with
    # "No support for the provided language" — so pass the concrete code that
    # detect_script_lang() already derived from the Unicode block.
    translated = _translate_with_mymemory(text, script_lang, "en")
    if translated:
        return translated, script_lang

    return text, script_lang


def translate_from_english(text: str, target_lang: str) -> str:
    """
    Translate an English `text` back into `target_lang`.

    Falls back to the original English text if:
      - target_lang is 'en' (no-op)
      - target_lang is unsupported
      - every translation backend fails
    """
    if not text or not text.strip():
        return text

    # No translation needed for English or unsupported/unknown codes
    if target_lang == "en" or target_lang not in SUPPORTED_LANGS:
        return text

    # Backend 1: Google gtx JSON endpoint.
    try:
        translated, _ = _google_translate(text, target_lang)
        return translated
    except Exception as exc:
        logger.warning("Google gtx reply translation failed (target=%s): %s", target_lang, exc)

    # Backend 2: MyMemory.
    translated = _translate_with_mymemory(text, "en", target_lang)
    if translated:
        return translated

    return text


# ---------------------------------------------------------------------------
# Legacy compatibility shim
# Keeps existing callers of translate_to_english() working unchanged.
# ---------------------------------------------------------------------------

def translate_to_english(text: str) -> str:
    """Translate text to English. Returns original text on failure. (legacy shim)"""
    translated, _ = detect_and_translate_to_english(text)
    return translated
