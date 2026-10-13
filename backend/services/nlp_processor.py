import json
import logging
import os
import re

import ollama

from services import vocabulary
from services.vocabulary import (
    _CITY_ALIASES,
    _REGIONAL_CITY_ALIASES,
    add_symptom_keyword,
)

logger = logging.getLogger(__name__)


def _match_regional_symptom(text: str) -> str | None:
    """
    Match a symptom from native-script text.

    Tries each supported language's vocabulary and returns the first
    canonical English symptom found. Longest terms are checked first so
    "सीने में दर्द" wins over a shorter overlapping fragment.

    Returns None when nothing matches, which lets the caller fall through
    to its other strategies rather than guessing.
    """
    best: tuple[int, str] | None = None

    for terms in vocabulary.regional_symptom_keywords().values():
        for term, canonical in terms:
            if term and term in text and (best is None or len(term) > best[0]):
                best = (len(term), canonical)
        if best is not None:
            # A confident hit in one language is enough; the input is
            # single-language in practice and mixing scripts is rare.
            return best[1]

    return None


def _match_regional_city(text: str) -> str | None:
    """Return the canonical city name for a native-script city mention."""
    for terms in _REGIONAL_CITY_ALIASES.values():
        for term, canonical in terms:
            if term and term in text:
                return canonical
    return None


def record_learned_symptom(symptom: str):
    """
    If AI (Ollama or Gemini) extracts a new symptom, add to in-memory list
    and persist to SymptomMapping database table.
    """
    if not symptom or not isinstance(symptom, str):
        return

    sym_clean = symptom.strip()
    sym_lower = sym_clean.lower()

    if not sym_lower:
        return

    add_symptom_keyword(sym_lower, sym_clean)

    # Only persist when the symptom is actually recognised. A brand-new
    # symptom matches no keyword, so get_specialist() returns the General
    # Physician default — persisting that locks in a wrong mapping that
    # every later lookup will trust. Unrecognised symptoms are left to the
    # request-time fallback instead.
    if not _is_known_symptom(sym_clean):
        logger.info("Learned symptom matches no known keyword; not persisting: %r", sym_clean)
        return

    try:
        # Imported here rather than at module scope: routing imports the
        # models, and a top-level import would make this module unusable in
        # any context where the database is not yet reachable. Importing
        # `main` instead would be a circular dependency -- the entrypoint
        # imports this module.
        from services.routing import get_specialist, save_learned_symptom

        specialist = get_specialist(sym_clean)
        save_learned_symptom(sym_clean, specialist, added_by="NLP")
    except Exception as exc:
        logger.warning("Failed to persist learned symptom to DB: %s", exc)


# City keywords → canonical (Title-cased) city name
def normalize_city(city: str | None) -> str | None:
    """Canonicalize a raw city string via the alias map in services.vocabulary."""
    if not city:
        return None
    return _CITY_ALIASES.get(city.strip().lower(), city)


def _match_dataset_symptom(text: str) -> str | None:
    """Match against the reference dataset symptom vocabulary."""
    for phrase in vocabulary.dataset_symptoms():
        if phrase in text:
            return phrase
    return None


def _regex_fallback(text: str) -> dict:
    """
    Best-effort symptom + city + area extraction using keyword matching.
    Called when the Ollama LLM is unavailable or returns bad output.
    """
    lower = text.lower()
    normalized_text = re.sub(r"\b([a-z]+)pain\b", r"\1 pain", lower)
    detected_symptom = None
    detected_city    = None
    detected_area    = None

    # Area -> (display name, parent city). Covers Bangalore + Mumbai only;
    # other cities remain city-level-only detection in this fallback.
    AREA_CITY_MAP: dict[str, tuple[str, str]] = {
        # Bangalore areas
        "whitefield":       ("Whitefield", "Bangalore"),
        "koramangala":      ("Koramangala", "Bangalore"),
        "indiranagar":      ("Indiranagar", "Bangalore"),
        "jayanagar":        ("Jayanagar", "Bangalore"),
        "malleswaram":      ("Malleswaram", "Bangalore"),
        "hsr layout":       ("HSR Layout", "Bangalore"),
        "btm layout":       ("BTM Layout", "Bangalore"),
        "electronic city":  ("Electronic City", "Bangalore"),
        "marathahalli":     ("Marathahalli", "Bangalore"),
        "hebbal":           ("Hebbal", "Bangalore"),
        "yelahanka":        ("Yelahanka", "Bangalore"),
        "banashankari":     ("Banashankari", "Bangalore"),
        "bellandur":        ("Bellandur", "Bangalore"),
        "rajajinagar":      ("Rajajinagar", "Bangalore"),
        "jp nagar":         ("JP Nagar", "Bangalore"),
        # Mumbai areas
        "bandra":           ("Bandra", "Mumbai"),
        "andheri":          ("Andheri", "Mumbai"),
        "worli":            ("Worli", "Mumbai"),
        "dadar":            ("Dadar", "Mumbai"),
        "powai":            ("Powai", "Mumbai"),
        "juhu":             ("Juhu", "Mumbai"),
        "malad":            ("Malad", "Mumbai"),
        "vashi":            ("Vashi", "Mumbai"),
    }

    # Symptom detection (longest-match first)
    for keyword, canonical in vocabulary.symptom_keywords():
        if keyword in lower or keyword in normalized_text:
            detected_symptom = canonical
            break

    # No English keyword matched. If the input is in a regional script, try
    # the native vocabulary before giving up. This is the path a voice
    # input takes whenever translation was unavailable, and without it the
    # API answers symptoms=null so no specialists are ever listed.
    if detected_symptom is None:
        detected_symptom = _match_regional_symptom(text)

    # Last resort: the reference dataset vocabulary. Richer than the
    # hand-written list and covers phrasings the keywords never anticipated.
    if detected_symptom is None:
        detected_symptom = _match_dataset_symptom(lower)

    # Area detection — infer city from the matched area's own mapping
    inferred_city = None
    for keyword in sorted(AREA_CITY_MAP, key=len, reverse=True):
        if keyword in lower:
            detected_area, inferred_city = AREA_CITY_MAP[keyword]
            break

    # City detection — an explicitly named city always wins over an
    # area-based inference on conflict. True city names are checked
    # first; neighbourhood aliases (also in the vocabulary alias map)
    # are area-level inference and must not override a named city.
    _NEIGHBOURHOOD_KEYS = set(AREA_CITY_MAP)
    for keyword in sorted(_CITY_ALIASES, key=len, reverse=True):
        if keyword in _NEIGHBOURHOOD_KEYS:
            continue
        if keyword in lower:
            detected_city = _CITY_ALIASES[keyword]
            break

    if not detected_city:
        detected_city = inferred_city

    # Same reasoning as the symptom pass: a native-script city or area
    # mention is only worth looking for once the English aliases missed.
    if not detected_city and not detected_area:
        detected_city = _match_regional_city(text)

    logger.info(
        "regex_fallback: symptoms=%r  city=%r  area=%r  (input=%r)",
        detected_symptom, detected_city, detected_area, text,
    )
    return {"symptoms": detected_symptom, "city": detected_city, "area": detected_area}


def _parse_json_from_response(raw: str) -> dict:
    """Extract a JSON object from LLM response."""
    stripped = re.sub(r"```(?:json)?\s*", "", raw).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*?\}", stripped, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"No valid JSON found in response: {raw!r}")


# Strings a model emits when it means "no value". Compared case-insensitively
# after stripping, so "null", "NULL" and "null." all count.
_EMPTY_SENTINELS = {
    "", "null", "none", "n/a", "na", "nil", "null.", "unknown",
    "not mentioned", "not specified", "not provided",
}


def _coerce_string_field(value) -> str | None:
    """
    Normalise an extracted field to a plain string, or None.

    The extraction prompt asks for a string, but models do not reliably
    comply. llama3 answered {"symptoms": ["chest pain"]} when asked for a
    string, and the Gemini lite models do the same. Downstream code assumes
    a string — get_specialist() calls .lower() on it — so a list raises
    AttributeError and turns a successful extraction into a 500.

    Accepts None, str, list and dict. For a list the first usable entry is
    taken, since a model returning several symptoms is still useful and the
    first is the most likely primary complaint.

    Models frequently answer {"city": "null"} — the literal string, not JSON
    null — when nothing was mentioned. Treated as a real value, "null" becomes
    the city, the profile fallback never runs, and the reply reads "in null".
    """
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.lower() in _EMPTY_SENTINELS:
            return None
        return stripped or None
    if isinstance(value, list):
        for item in value:
            coerced = _coerce_string_field(item)
            if coerced:
                return coerced
        return None
    if isinstance(value, dict):
        # Some models wrap the value, e.g. {"symptoms": {"value": "..."}}.
        for key in ("value", "text", "name", "symptom"):
            if key in value:
                return _coerce_string_field(value[key])
        return None
    return str(value).strip() or None


def _is_known_symptom(symptom: str) -> bool:
    """True when `symptom` contains a keyword from any vocabulary."""
    if not symptom:
        return False
    lower = symptom.lower()
    if any(kw in lower for kw, _ in vocabulary.symptom_keywords()):
        return True
    if any(term and term in lower for terms in vocabulary.regional_symptom_keywords().values() for term, _ in terms):
        return True
    # Reference dataset vocabulary — richest source, loaded lazily.
    return any(phrase in lower for phrase in vocabulary.dataset_symptoms())


def _is_known_city(city: str) -> bool:
    """True when `city` is a recognised city or area alias."""
    if not city:
        return False
    return city.strip().lower() in _CITY_ALIASES


def _discard_echoed_input(text: str, extracted: dict) -> bool:
    """
    Return True when a model echoed its input instead of extracting from it.

    Two failure modes, both of which produce output worse than no output:

    1. A non-Latin value — the model copied Devanagari rather than extracting.
    2. For non-Latin input, a value that is not a recognised term — the model
       transliterated into Latin script, returning "mujhe" as a city. This
       passes a script check but is not an extraction.

    In both cases the value matches no keyword downstream, so the patient is
    routed by garbage. Discarding lets the next tier try instead.
    """
    bad = [k for k, v in extracted.items() if v and not _is_latin_script(v)]
    if bad:
        logger.warning(
            "Discarding LLM output — non-Latin value in %s (model echoed its input): %s",
            ", ".join(bad), extracted,
        )
        return True

    # Regional input must come back as recognised terms. A transliterated
    # value is Latin-script, so only a vocabulary check catches it.
    if not _is_latin_script(text):
        if extracted["symptoms"] and not _is_known_symptom(extracted["symptoms"]):
            logger.warning(
                "Discarding LLM output — symptom %r is not a recognised term: %s",
                extracted["symptoms"], extracted,
            )
            return True
        if extracted["city"] and not _is_known_city(extracted["city"]):
            logger.warning(
                "Discarding LLM output — city %r is not a recognised city: %s",
                extracted["city"], extracted,
            )
            return True

    return False


def _is_latin_script(text: str | None) -> bool:
    """
    True when `text` is empty or contains no Indic-script characters.

    Used to spot a model that echoed its input instead of extracting from
    it. When translation is unavailable, regional text reaches the LLM
    untranslated and it tends to transliterate — llama3 turned
    "सिरदर्द" into "Sir Dard" and returned "मुझे" as a city. Neither is a
    usable extraction, and the first silently matches no symptom keyword,
    so the patient is routed to a General Physician for a headache.
    """
    if not text:
        return True
    # Devanagari and every other Indic block used by the supported
    # languages starts at U+0900; anything below that is Latin, digits or
    # punctuation, all of which are fine in an extracted value.
    return all(ord(ch) < 0x0900 for ch in text)


def extract_medical_info(text: str) -> dict:
    """
    2-Tier Extraction Architecture:
    1. Local Ollama
    2. Deterministic Regex Fallback matcher.
    """
    if not text or not text.strip():
        return {"symptoms": None, "city": None, "area": None}

    # Tier 1: Local Ollama
    ollama_enabled = os.getenv("OLLAMA_ENABLED", "true").lower() not in ("false", "0", "no", "off")

    if ollama_enabled:
        # Try each model in turn. A single model being slow, unloaded or
        # temporarily unavailable should not take the whole tier down.
        primary = os.getenv("OLLAMA_MODEL", "qwen2:0.5b")
        fallbacks = [m.strip() for m in os.getenv("OLLAMA_FALLBACK_MODELS", "").split(",") if m.strip()]
        models = [primary] + [m for m in fallbacks if m != primary]

        for model_name in models:
            try:
                response = ollama.chat(
                    model=model_name,
                    # Force a JSON reply. Without this llama3 returns a list
                    # for "symptoms" even when the prompt asks for a string.
                    format="json",
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a data extraction tool. "
                                "You only speak JSON. No conversation. "
                                "No explanations. No markdown. No code blocks. "
                                "Return raw JSON only."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"Extract medical information from this text: '{text}'. "
                                "Return ONLY a raw JSON object (no markdown, no explanation) "
                                "with exactly these three keys: "
                                "\"symptoms\" (the medical complaint as a short string), "
                                "\"city\" (the major parent city, e.g. if the user says 'Whitefield' return 'Bangalore'), "
                                "\"area\" (the specific neighbourhood or suburb the user mentioned, e.g. 'Whitefield'). "
                                "If any field is not mentioned, use null. "
                                "Example output: {\"symptoms\": \"chest pain\", \"city\": \"Bangalore\", \"area\": \"Whitefield\"}"
                            ),
                        },
                    ],
                )

                raw_content = response["message"]["content"]
                result = _parse_json_from_response(raw_content)
                extracted = {
                    "symptoms": _coerce_string_field(result.get("symptoms")),
                    "city":     _coerce_string_field(result.get("city")),
                    "area":     _coerce_string_field(result.get("area")),
                }

                # No symptom means the model could not read the input —
                # common for regional text it does not understand. Returning
                # that empty result would report "no symptom" without ever
                # reaching the regex tier, which handles those languages.
                if not extracted["symptoms"]:
                    logger.info("Model %r extracted no symptom; trying next", model_name)
                    continue

                if _discard_echoed_input(text, extracted):
                    continue
                if extracted["symptoms"]:
                    record_learned_symptom(extracted["symptoms"])
                return extracted

            except ollama.ResponseError as e:
                # The server answered, so this is a request problem rather
                # than a dead server — most often a model that has not been
                # pulled. The old code reported every failure as "Failed to
                # connect to Ollama", which sent operators to check a server
                # that was running fine.
                logger.warning(
                    "Ollama rejected model %r (status %s): %s. "
                    "If this is a 404, run `ollama pull %s`.",
                    model_name, getattr(e, "status_code", "?"), e, model_name,
                )
            except Exception as e:
                # Connection refused, timeout, or a hung model. Worth
                # trying the next model in the list before giving up.
                logger.warning(
                    "Ollama extraction failed using model %r (%s: %s). Trying next model.",
                    model_name, type(e).__name__, e,
                )

    # Tier 2: Deterministic Regex Matcher Fallback
    return _regex_fallback(text)
