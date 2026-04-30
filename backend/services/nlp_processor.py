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
    # Cardiology
    ("chest pain",              "chest pain"),
    ("heart pain",              "chest pain"),
    ("palpitations",            "palpitations"),
    ("heart attack",            "heart attack"),
    ("chest tightness",         "chest tightness"),
    # Neurology
    ("shortness of breath",     "shortness of breath"),
    ("breathing problem",       "shortness of breath"),
    ("difficulty breathing",    "shortness of breath"),
    ("headache",                "headache"),
    ("migraine",                "migraine"),
    ("dizziness",               "dizziness"),
    ("seizure",                 "seizure"),
    ("numbness",                "numbness"),
    ("stroke",                  "stroke"),
    # Pulmonology
    ("cough",                   "cough"),
    ("asthma",                  "asthma"),
    ("wheezing",                "wheezing"),
    # Internal Medicine / General
    ("stomach pain",            "stomach pain"),
    ("abdominal pain",          "stomach pain"),
    ("nausea",                  "nausea"),
    ("vomiting",                "vomiting"),
    ("fever",                   "fever"),
    ("cold",                    "cold"),
    ("flu",                     "flu"),
    ("fatigue",                 "fatigue"),
    ("weakness",                "weakness"),
    # Orthopedics
    ("broke my arm",            "broke my arm"),
    ("broken arm",              "broken arm"),
    ("broken leg",              "broken leg"),
    ("broken bone",             "broken bone"),
    ("bone pain",               "bone pain"),
    ("joint pain",              "joint pain"),
    ("knee pain",               "knee pain"),
    ("back pain",               "back pain"),
    ("fracture",                "fracture"),
    ("sprain",                  "sprain"),
    # Dermatology
    ("skin rash",               "skin rash"),
    ("skin infection",          "skin infection"),
    ("rash",                    "rash"),
    ("acne",                    "acne"),
    ("eczema",                  "eczema"),
    ("psoriasis",               "psoriasis"),
    ("itching",                 "itching"),
    ("swelling",                "swelling"),
    # Psychiatry
    ("panic attack",            "panic attack"),
    ("mental health",           "mental health"),
    ("anxiety",                 "anxiety"),
    ("depression",              "depression"),
    ("insomnia",                "insomnia"),
    ("stress",                  "stress"),
    # Gastroenterology
    ("acid reflux",             "acid reflux"),
    ("diarrhea",                "diarrhea"),
    ("constipation",            "constipation"),
    ("bloating",                "bloating"),
    ("heartburn",               "heartburn"),
    ("ibs",                     "ibs"),
    # Endocrinology
    ("diabetes",                "diabetes"),
    ("thyroid",                 "thyroid"),
    ("weight gain",             "weight gain"),
    ("hormonal",                "hormonal imbalance"),
    ("hypertension",            "hypertension"),
    ("blood pressure",          "hypertension"),
    # Ophthalmology
    ("blurry vision",           "blurry vision"),
    ("vision loss",             "vision loss"),
    ("eye pain",                "eye pain"),
    ("red eye",                 "red eye"),
    # ENT
    ("hearing loss",            "hearing loss"),
    ("nose bleed",              "nose bleed"),
    ("sore throat",             "sore throat"),
    ("sinusitis",               "sinusitis"),
    ("ear pain",                "ear pain"),
    ("tonsils",                 "tonsils"),
    # Urology
    ("frequent urination",      "frequent urination"),
    ("urinary pain",            "urinary pain"),
    ("kidney stone",            "kidney stone"),
    # Oncology
    ("cancer",                  "cancer"),
    ("tumor",                   "tumor"),
    ("lump",                    "lump"),
    # Pediatrics
    ("child fever",             "child fever"),
    ("infant",                  "infant illness"),
    ("baby",                    "infant illness"),
], key=lambda t: len(t[0]), reverse=True)  # Longest first → greedy match

# City keywords → canonical (Title-cased) city name
_CITY_KEYWORDS: dict[str, str] = {
    # Major Indian cities
    "bangalore":        "Bangalore",
    "bengaluru":        "Bangalore",
    "mumbai":           "Mumbai",
    "bombay":           "Mumbai",
    "delhi":            "Delhi",
    "new delhi":        "Delhi",
    "chennai":          "Chennai",
    "madras":           "Chennai",
    "kolkata":          "Kolkata",
    "calcutta":         "Kolkata",
    "hyderabad":        "Hyderabad",
    "pune":             "Pune",
    "ahmedabad":        "Ahmedabad",
    "jaipur":           "Jaipur",
    "surat":            "Surat",
    "lucknow":          "Lucknow",
    "kanpur":           "Kanpur",
    "nagpur":           "Nagpur",
    "indore":           "Indore",
    "bhopal":           "Bhopal",
    "london":           "London",
    "new york":         "New York",
    # Bangalore neighbourhoods — all resolve to "Bangalore" as the parent city
    "whitefield":       "Bangalore",
    "koramangala":      "Bangalore",
    "indiranagar":      "Bangalore",
    "jayanagar":        "Bangalore",
    "malleswaram":      "Bangalore",
    "hsr layout":       "Bangalore",
    "btm layout":       "Bangalore",
    "electronic city":  "Bangalore",
    "marathahalli":     "Bangalore",
    "hebbal":           "Bangalore",
    "yelahanka":        "Bangalore",
    "banashankari":     "Bangalore",
    "bellandur":        "Bangalore",
    "rajajinagar":      "Bangalore",
    "jp nagar":         "Bangalore",
}


def normalize_city(city: str | None) -> str | None:
    """
    Canonicalize a raw city string using the _CITY_KEYWORDS alias map.

    Examples
    --------
    normalize_city("Bengaluru")  -> "Bangalore"
    normalize_city("Bombay")     -> "Mumbai"
    normalize_city("London")     -> "London"
    normalize_city(None)         -> None
    """
    if not city:
        return None
    return _CITY_KEYWORDS.get(city.strip().lower(), city)


def _regex_fallback(text: str) -> dict:
    """
    Best-effort symptom + city + area extraction using keyword matching.
    Called when the Ollama LLM is unavailable or returns bad output.
    """
    lower = text.lower()
    detected_symptom = None
    detected_city    = None
    detected_area    = None

    # Bangalore area names — checked separately so we can populate the area field
    _BANGALORE_AREAS: dict[str, str] = {
        "whitefield":       "Whitefield",
        "koramangala":      "Koramangala",
        "indiranagar":      "Indiranagar",
        "jayanagar":        "Jayanagar",
        "malleswaram":      "Malleswaram",
        "hsr layout":       "HSR Layout",
        "btm layout":       "BTM Layout",
        "electronic city":  "Electronic City",
        "marathahalli":     "Marathahalli",
        "hebbal":           "Hebbal",
        "yelahanka":        "Yelahanka",
        "banashankari":     "Banashankari",
        "bellandur":        "Bellandur",
        "rajajinagar":      "Rajajinagar",
        "jp nagar":         "JP Nagar",
    }

    # ── Symptom detection (longest-match first) ──
    for keyword, canonical in _SYMPTOM_KEYWORDS:
        if keyword in lower:
            detected_symptom = canonical
            break

    # ── Area detection (check Bangalore areas first, longest match first) ──
    for keyword in sorted(_BANGALORE_AREAS, key=len, reverse=True):
        if keyword in lower:
            detected_area = _BANGALORE_AREAS[keyword]
            detected_city = "Bangalore"   # area implies the parent city
            break

    # ── City detection (only if city not already set by area match) ──
    if not detected_city:
        for keyword in sorted(_CITY_KEYWORDS, key=len, reverse=True):
            if keyword in lower:
                detected_city = _CITY_KEYWORDS[keyword]
                break

    logger.info(
        "regex_fallback: symptoms=%r  city=%r  area=%r  (input=%r)",
        detected_symptom, detected_city, detected_area, text,
    )
    return {"symptoms": detected_symptom, "city": detected_city, "area": detected_area}


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
