import ollama
import json
import re
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fallback dictionaries (used when Ollama is offline or fails)
# ---------------------------------------------------------------------------

# Symptom keywords → canonical symptom string (longest match wins)
_SYMPTOM_KEYWORDS: list[tuple[str, str]] = sorted([
    ("chest pain",          "chest pain"),
    ("heart pain",          "chest pain"),
    ("palpitations",        "palpitations"),
    ("heart attack",        "heart attack"),
    ("shortness of breath", "shortness of breath"),
    ("breathing problem",   "shortness of breath"),
    ("difficulty breathing","shortness of breath"),
    ("headache",            "headache"),
    ("migraine",            "migraine"),
    ("dizziness",           "dizziness"),
    ("seizure",             "seizure"),
    ("cough",               "cough"),
    ("asthma",              "asthma"),
    ("stomach pain",        "stomach pain"),
    ("abdominal pain",      "stomach pain"),
    ("nausea",              "nausea"),
    ("vomiting",            "vomiting"),
    ("fever",               "fever"),
    ("cold",                "cold"),
    ("flu",                 "flu"),
    ("fatigue",             "fatigue"),
    ("weakness",            "weakness"),
    ("back pain",           "back pain"),
    ("joint pain",          "joint pain"),
    ("rash",                "rash"),
    ("swelling",            "swelling"),
    ("diabetes",            "diabetes"),
    ("hypertension",        "hypertension"),
    ("blood pressure",      "hypertension"),
], key=lambda t: len(t[0]), reverse=True)  # Longest first → greedy match

# City keywords → canonical (Title-cased) city name
_CITY_KEYWORDS: dict[str, str] = {
    "bangalore":  "Bangalore",
    "bengaluru":  "Bangalore",
    "mumbai":     "Mumbai",
    "bombay":     "Mumbai",
    "delhi":      "Delhi",
    "new delhi":  "Delhi",
    "chennai":    "Chennai",
    "madras":     "Chennai",
    "kolkata":    "Kolkata",
    "calcutta":   "Kolkata",
    "hyderabad":  "Hyderabad",
    "pune":       "Pune",
    "ahmedabad":  "Ahmedabad",
    "jaipur":     "Jaipur",
    "surat":      "Surat",
    "lucknow":    "Lucknow",
    "kanpur":     "Kanpur",
    "nagpur":     "Nagpur",
    "indore":     "Indore",
    "bhopal":     "Bhopal",
    "london":     "London",
    "new york":   "New York",
}


def _regex_fallback(text: str) -> dict:
    """
    Best-effort symptom + city extraction using keyword matching.
    Called when the Ollama LLM is unavailable or returns bad output.
    """
    lower = text.lower()
    detected_symptom = None
    detected_city    = None

    # ── Symptom detection (longest-match first) ──
    for keyword, canonical in _SYMPTOM_KEYWORDS:
        if keyword in lower:
            detected_symptom = canonical
            break

    # ── City detection ──
    # Check multi-word cities before single-word ones (already ordered by key length)
    for keyword in sorted(_CITY_KEYWORDS, key=len, reverse=True):
        if keyword in lower:
            detected_city = _CITY_KEYWORDS[keyword]
            break

    logger.info(
        "regex_fallback: symptoms=%r  city=%r  (input=%r)",
        detected_symptom, detected_city, text,
    )
    return {"symptoms": detected_symptom, "city": detected_city, "area": None}


# ---------------------------------------------------------------------------
# JSON parsing helper
# ---------------------------------------------------------------------------

def _parse_json_from_response(raw: str) -> dict:
    """
    Robustly extract a JSON object from Ollama's response.
    Handles markdown code fences and extra prose before/after the JSON.
    """
    # 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
    stripped = re.sub(r"```(?:json)?\s*", "", raw).strip()

    # 2. Fast path — direct parse
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # 3. Find the first {...} block (handles extra prose)
    match = re.search(r"\{.*?\}", stripped, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"No valid JSON found in response: {raw!r}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_medical_info(text: str) -> dict:
    """
    Use the local Ollama (llama3) model to extract symptoms, parent city,
    and local area/neighbourhood from the user's message.

    Falls back to regex-based keyword matching if Ollama is unavailable.

    Returns: {"symptoms": str | None, "city": str | None, "area": str | None}
    """
    if not text or not text.strip():
        return {"symptoms": None, "city": None, "area": None}

    try:
        response = ollama.chat(
            model="llama3",
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
        return {
            "symptoms": result.get("symptoms"),
            "city":     result.get("city"),
            "area":     result.get("area"),
        }

    except Exception as e:
        logger.warning(
            "Ollama extraction failed (%s). Falling back to regex matcher.", e
        )
        # ── Smart fallback instead of returning all-None ──
        return _regex_fallback(text)
