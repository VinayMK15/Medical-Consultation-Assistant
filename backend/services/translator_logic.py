import logging
from deep_translator import GoogleTranslator

logger = logging.getLogger(__name__)

# Languages we actively support for reply translation.
# Extend this list as needed.
SUPPORTED_LANGS = {
    "en", "hi", "ta", "te", "kn", "ml", "mr", "bn",  # Indian languages
    "fr", "de", "es", "pt", "ar", "zh-CN", "ja", "ko",  # International
}


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

    try:
        translator = GoogleTranslator(source="auto", target="en")
        translated = translator.translate(text)

        # deep_translator exposes the detected source on the object after translation
        detected = getattr(translator, "source", "en") or "en"

        # If the detected code came back as "auto", treat it as English
        if detected == "auto":
            detected = "en"

        return (translated if translated else text), detected

    except Exception as exc:
        logger.warning("detect_and_translate_to_english failed: %s", exc)
        return text, "en"


def translate_from_english(text: str, target_lang: str) -> str:
    """
    Translate an English `text` back into `target_lang`.

    Falls back to the original English text if:
      - target_lang is 'en' (no-op)
      - target_lang is unsupported
      - the translation API call fails
    """
    if not text or not text.strip():
        return text

    # No translation needed for English or unsupported/unknown codes
    if target_lang == "en" or target_lang not in SUPPORTED_LANGS:
        return text

    try:
        translated = GoogleTranslator(source="en", target=target_lang).translate(text)
        return translated if translated else text

    except Exception as exc:
        logger.warning(
            "translate_from_english failed (target=%s): %s", target_lang, exc
        )
        return text


# ---------------------------------------------------------------------------
# Legacy compatibility shim
# Keeps existing callers of translate_to_english() working unchanged.
# ---------------------------------------------------------------------------

def translate_to_english(text: str) -> str:
    """Translate text to English. Returns original text on failure. (legacy shim)"""
    translated, _ = detect_and_translate_to_english(text)
    return translated
