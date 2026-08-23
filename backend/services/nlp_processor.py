import os
import urllib.request
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
    ("backache",                "back pain"),
    ("neck pain",               "neck pain"),
    ("neckpain",                "neck pain"),
    ("stiff neck",              "neck pain"),
    ("neck stiffness",          "neck pain"),
    ("neck ache",               "neck pain"),
    ("shoulder pain",           "shoulder pain"),
    ("shoulder ache",           "shoulder pain"),
    ("body pain",               "joint pain"),
    ("muscle pain",             "joint pain"),
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

# ---------------------------------------------------------------------------
# Dynamic Symptom Persistence (Auto-Learning Storage)
# ---------------------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
CUSTOM_SYMPTOMS_FILE = os.path.join(DATA_DIR, "custom_symptoms.json")

def load_custom_symptoms():
    """Load user-defined or AI-learned custom symptoms from backend/data/custom_symptoms.json."""
    if os.path.exists(CUSTOM_SYMPTOMS_FILE):
        try:
            with open(CUSTOM_SYMPTOMS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data:
                    kw = item.get("keyword", "").strip().lower()
                    canonical = item.get("canonical", "").strip()
                    if kw and canonical:
                        if not any(k == kw for k, _ in _SYMPTOM_KEYWORDS):
                            _SYMPTOM_KEYWORDS.append((kw, canonical))
            _SYMPTOM_KEYWORDS.sort(key=lambda t: len(t[0]), reverse=True)
            logger.info("Loaded custom symptoms from %s", CUSTOM_SYMPTOMS_FILE)
        except Exception as e:
            logger.warning("Failed to load custom_symptoms.json: %s", e)

# Initialize custom symptoms on import
load_custom_symptoms()


def record_learned_symptom(symptom: str):
    """
    If AI (Ollama or Gemini) extracts a symptom not currently present in
    _SYMPTOM_KEYWORDS, automatically add it to _SYMPTOM_KEYWORDS in-memory
    and persist it to backend/data/custom_symptoms.json.
    """
    if not symptom or not isinstance(symptom, str):
        return

    sym_clean = symptom.strip()
    sym_lower = sym_clean.lower()

    if not sym_lower:
        return

    # Check if already matched or present in _SYMPTOM_KEYWORDS
    already_known = any(kw == sym_lower or kw in sym_lower for kw, _ in _SYMPTOM_KEYWORDS)
    if already_known:
        return

    logger.info("Auto-learning new symptom extracted by AI: %r", sym_clean)
    _SYMPTOM_KEYWORDS.append((sym_lower, sym_clean))
    _SYMPTOM_KEYWORDS.sort(key=lambda t: len(t[0]), reverse=True)

    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        items = []
        if os.path.exists(CUSTOM_SYMPTOMS_FILE):
            with open(CUSTOM_SYMPTOMS_FILE, "r", encoding="utf-8") as f:
                try:
                    items = json.load(f)
                except Exception:
                    items = []

        if not any(i.get("keyword") == sym_lower for i in items):
            items.append({"keyword": sym_lower, "canonical": sym_clean})
            with open(CUSTOM_SYMPTOMS_FILE, "w", encoding="utf-8") as f:
                json.dump(items, f, indent=2)
            logger.info("Persisted new symptom %r to %s", sym_clean, CUSTOM_SYMPTOMS_FILE)
    except Exception as e:
        logger.warning("Failed to persist dynamic symptom %r: %s", sym_clean, e)

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
    # Normalize concatenated symptom terms (e.g., "neckpain" -> "neck pain", "backpain" -> "back pain")
    normalized_text = re.sub(r"\b([a-z]+)pain\b", r"\1 pain", lower)
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
        if keyword in lower or keyword in normalized_text:
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

def _call_gemini_extraction(text: str, api_key: str) -> dict | None:
    """Fallback extraction using Google Gemini REST API if GEMINI_API_KEY is provided."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    prompt = (
        f"Extract medical information from this text: '{text}'. "
        "Return ONLY a raw JSON object (no markdown, no code fence, no extra explanation) "
        "with exactly three keys: \"symptoms\" (string or null), \"city\" (string or null), \"area\" (string or null). "
        "Example: {\"symptoms\": \"chest pain\", \"city\": \"Bangalore\", \"area\": \"Whitefield\"}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.0, "responseMimeType": "application/json"}
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=5) as response:
        res_data = json.loads(response.read().decode("utf-8"))
        raw_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
        return _parse_json_from_response(raw_text)


def extract_medical_info(text: str) -> dict:
    """
    3-Tier Extraction Architecture:
    1. Local Ollama (model configured via OLLAMA_MODEL env var, e.g. qwen2:0.5b, llama3.2:1b).
    2. Cloud Gemini API (if GEMINI_API_KEY env var is present).
    3. Fast & deterministic Regex Fallback matcher.

    Returns: {"symptoms": str | None, "city": str | None, "area": str | None}
    """
    if not text or not text.strip():
        return {"symptoms": None, "city": None, "area": None}

    # ── Tier 1: Local Ollama Model ──
    ollama_enabled = os.getenv("OLLAMA_ENABLED", "true").lower() not in ("false", "0", "no", "off")
    model_name = os.getenv("OLLAMA_MODEL", "qwen2:0.5b")

    if ollama_enabled:
        try:
            response = ollama.chat(
                model=model_name,
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
                "symptoms": result.get("symptoms"),
                "city":     result.get("city"),
                "area":     result.get("area"),
            }
            if extracted["symptoms"]:
                record_learned_symptom(extracted["symptoms"])
            return extracted

        except Exception as e:
            logger.warning(
                "Ollama extraction failed using model %r (%s). Trying next extraction tier.",
                model_name, e
            )

    # ── Tier 2: Optional Cloud Gemini API Fallback ──
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            result = _call_gemini_extraction(text, gemini_key)
            if result:
                extracted = {
                    "symptoms": result.get("symptoms"),
                    "city":     result.get("city"),
                    "area":     result.get("area"),
                }
                if extracted["symptoms"]:
                    record_learned_symptom(extracted["symptoms"])
                return extracted
        except Exception as e:
            logger.warning("Gemini cloud extraction failed (%s). Moving to regex fallback.", e)

    # ── Tier 3: Deterministic Regex Matcher Fallback ──
    return _regex_fallback(text)

