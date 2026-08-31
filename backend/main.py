"""
main.py - MedAssist API Entrypoint

Registers all routers and middleware. Business logic lives in routers/:
  - routers/auth.py         → /api/auth/*
  - routers/doctor.py       → /api/doctor/*
  - routers/patient.py      → /api/patient/*
  - routers/appointments.py → /api/appointments/*
  - routers/admin.py        → /api/admin/*
"""
import os
import math
from datetime import date as date_type

from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_
import random
from cachetools import TTLCache

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from limiter import limiter

from database import engine, get_db, SessionLocal
import models
from models import User
from schemas import ProcessRequest
from auth_utils import get_current_user
from services.translator_logic import detect_and_translate_to_english, translate_from_english
from services.nlp_processor import extract_medical_info, normalize_city

from routers import auth, doctor, patient, appointments, admin

import logging
from contextlib import asynccontextmanager
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: validate that Alembic migrations are up to date.
    Never create tables directly — Alembic owns schema management.
    """
    try:
        alembic_cfg = Config("alembic.ini")
        script = ScriptDirectory.from_config(alembic_cfg)
        head_revision = script.get_current_head()

        with engine.connect() as conn:
            context = MigrationContext.configure(conn)
            current_revision = context.get_current_revision()

        if current_revision != head_revision:
            logger.warning(
                "Database migrations are not up to date. "
                "Current: %s | Head: %s | "
                "Run: alembic upgrade head",
                current_revision,
                head_revision,
            )
        else:
            logger.info(
                "Database schema is up to date at revision: %s",
                current_revision,
            )
    except Exception as e:
        logger.warning("Could not validate Alembic migration state: %s", e)

    yield  # Application runs here

app = FastAPI(title="MedAssist API", version="1.0.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Rate Limiting — shared limiter instance used by all routers
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS — restrict to known frontend origins (configurable via env var)
# ---------------------------------------------------------------------------
_ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Register routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(doctor.router)
app.include_router(patient.router)
app.include_router(appointments.router)
app.include_router(admin.router)

# ---------------------------------------------------------------------------
# TTL session store for NLP chat: max 1000 sessions, each expires after 30 min
# ---------------------------------------------------------------------------
SESSION_TTL_SECONDS = 60 * 30   # 30 minutes
SESSION_MAX_SIZE    = 1000
sessions: TTLCache  = TTLCache(maxsize=SESSION_MAX_SIZE, ttl=SESSION_TTL_SECONDS)

# ---------------------------------------------------------------------------
# City & Area Coordinates (Latitude, Longitude)
# ---------------------------------------------------------------------------
CITY_AREA_COORDS = {
    # 7 Cities
    "Bangalore": (12.9716, 77.5946),
    "Mumbai":    (19.0760, 72.8777),
    "Delhi":     (28.6139, 77.2090),
    "Chennai":   (13.0827, 80.2707),
    "Hyderabad": (17.3850, 78.4867),
    "Pune":      (18.5204, 73.8567),
    "Kolkata":   (22.5726, 88.3639),

    # 12 Bangalore areas
    "Koramangala":     (12.9352, 77.6245),
    "Indiranagar":     (12.9784, 77.6408),
    "Jayanagar":       (12.9308, 77.5838),
    "Whitefield":      (12.9698, 77.7500),
    "Rajajinagar":     (12.9907, 77.5530),
    "Banashankari":    (12.9255, 77.5468),
    "Hebbal":          (13.0354, 77.5972),
    "Kengeri":         (12.8996, 77.4827),
    "Marathahalli":    (12.9591, 77.6974),
    "BTM Layout":      (12.9166, 77.6101),
    "HSR Layout":      (12.9116, 77.6389),
    "Electronic City": (12.8399, 77.6770),
    "Malleswaram":     (12.9997, 77.5713),
    "Bellandur":       (12.9263, 77.6756),
    "JP Nagar":        (12.9082, 77.5858),
    "Yelahanka":       (13.1007, 77.5963),

    # 8 Mumbai areas
    "Bandra":  (19.0596, 72.8295),
    "Andheri": (19.1136, 72.8697),
    "Worli":   (19.0176, 72.8172),
    "Dadar":   (19.0178, 72.8478),
    "Powai":   (19.1176, 72.9060),
    "Juhu":    (19.1075, 72.8263),
    "Malad":   (19.1874, 72.8484),
    "Vashi":   (19.0770, 72.9986),
}


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate distance in kilometers between two lat/lng points using math module.
    Returns distance rounded to 1 decimal place.
    """
    R = 6371.0  # Earth radius in kilometers

    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)

    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 1)


def get_patient_coords(city: str | None, area: str | None) -> tuple[float | None, float | None]:
    """
    Look up patient coordinates checking area first, falling back to city.
    Returns (lat, lng) or (None, None) if neither found. Never raises an exception.
    """
    try:
        coords_map = {k.lower(): v for k, v in CITY_AREA_COORDS.items()}

        if area and isinstance(area, str):
            area_clean = area.strip().lower()
            if area_clean in coords_map:
                return coords_map[area_clean]

        if city and isinstance(city, str):
            city_clean = city.strip().lower()
            if city_clean in coords_map:
                return coords_map[city_clean]

        return (None, None)
    except Exception:
        return (None, None)

# ---------------------------------------------------------------------------
# Symptom → Medical Specialist mapping
# ---------------------------------------------------------------------------
SYMPTOM_SPECIALIST_MAP = {
    # Cardiology
    "chest pain":           "Cardiologist",
    "heart pain":           "Cardiologist",
    "palpitations":         "Cardiologist",
    "heart attack":         "Cardiologist",
    "chest tightness":      "Cardiologist",
    # Neurology
    "headache":             "Neurologist",
    "migraine":             "Neurologist",
    "seizure":              "Neurologist",
    "dizziness":            "Neurologist",
    "numbness":             "Neurologist",
    "stroke":               "Neurologist",
    # Pulmonology
    "cough":                "Pulmonologist",
    "shortness of breath":  "Pulmonologist",
    "breathing":            "Pulmonologist",
    "asthma":               "Pulmonologist",
    "wheezing":             "Pulmonologist",
    # Internal Medicine
    "nausea":               "Internal Medicine",
    "nauseous":             "Internal Medicine",
    "stomach pain":         "Internal Medicine",
    "abdominal pain":       "Internal Medicine",
    "vomiting":             "Internal Medicine",
    # General Physician
    "fever":                "General Physician",
    "cold":                 "General Physician",
    "flu":                  "General Physician",
    "fatigue":              "General Physician",
    "weakness":             "General Physician",
    # Orthopedics
    "broken arm":           "Orthopedic Surgeon",
    "broke my arm":         "Orthopedic Surgeon",
    "fracture":             "Orthopedic Surgeon",
    "broken bone":          "Orthopedic Surgeon",
    "bone pain":            "Orthopedic Surgeon",
    "joint pain":           "Orthopedic Surgeon",
    "knee pain":            "Orthopedic Surgeon",
    "back pain":            "Orthopedic Surgeon",
    "backache":             "Orthopedic Surgeon",
    "neck pain":            "Orthopedic Surgeon",
    "neckpain":             "Orthopedic Surgeon",
    "stiff neck":           "Orthopedic Surgeon",
    "neck stiffness":       "Orthopedic Surgeon",
    "neck ache":            "Orthopedic Surgeon",
    "shoulder pain":        "Orthopedic Surgeon",
    "shoulder ache":        "Orthopedic Surgeon",
    "sprain":               "Orthopedic Surgeon",
    "broken leg":           "Orthopedic Surgeon",
    # Dermatology
    "rash":                 "Dermatologist",
    "skin rash":            "Dermatologist",
    "acne":                 "Dermatologist",
    "eczema":               "Dermatologist",
    "psoriasis":            "Dermatologist",
    "itching":              "Dermatologist",
    "skin infection":       "Dermatologist",
    # Pediatrics
    "child fever":          "Pediatrician",
    "infant":               "Pediatrician",
    "baby":                 "Pediatrician",
    "child rash":           "Pediatrician",
    # Psychiatry
    "anxiety":              "Psychiatrist",
    "depression":           "Psychiatrist",
    "panic attack":         "Psychiatrist",
    "mental health":        "Psychiatrist",
    "insomnia":             "Psychiatrist",
    "stress":               "Psychiatrist",
    # Gastroenterology
    "diarrhea":             "Gastroenterologist",
    "constipation":         "Gastroenterologist",
    "bloating":             "Gastroenterologist",
    "acid reflux":          "Gastroenterologist",
    "heartburn":            "Gastroenterologist",
    "ibs":                  "Gastroenterologist",
    # Endocrinology
    "diabetes":             "Endocrinologist",
    "thyroid":              "Endocrinologist",
    "weight gain":          "Endocrinologist",
    "hormonal":             "Endocrinologist",
    # Ophthalmology
    "eye pain":             "Ophthalmologist",
    "blurry vision":        "Ophthalmologist",
    "vision loss":          "Ophthalmologist",
    "red eye":              "Ophthalmologist",
    # ENT
    "ear pain":             "ENT Specialist",
    "hearing loss":         "ENT Specialist",
    "sore throat":          "ENT Specialist",
    "nose bleed":           "ENT Specialist",
    "sinusitis":            "ENT Specialist",
    "tonsils":              "ENT Specialist",
    # Urology
    "urinary pain":         "Urologist",
    "kidney stone":         "Urologist",
    "frequent urination":   "Urologist",
    # Oncology
    "cancer":               "Oncologist",
    "tumor":                "Oncologist",
    "lump":                 "Oncologist",
}


def get_specialist(symptoms: str) -> str:
    """Return the best-matching specialist for the given symptom string."""
    if not symptoms:
        return "General Physician"
    lower = symptoms.lower()
    for keyword in sorted(SYMPTOM_SPECIALIST_MAP, key=len, reverse=True):
        if keyword in lower:
            return SYMPTOM_SPECIALIST_MAP[keyword]
    return "General Physician"


def find_doctors(
    city: str | None,
    area: str | None,
    specialist: str,
    db: Session | None = None,
    patient_lat: float | None = None,
    patient_lng: float | None = None,
) -> list:
    """
    Query verified doctors from the database.
    If patient coordinates are provided, compute distance_km, attach to each doctor dict,
    and sort doctors list ascending by distance_km.

    Priority:
      1. Specialist match + city/area match
      2. General Physician fallback in the same city
      3. Any verified doctor in the city (top 3)
    """
    # Handle parameter overload flexibility:
    # If 4th positional arg `db` is numeric, caller passed find_doctors(city, area, specialist, patient_lat, patient_lng)
    if isinstance(db, (float, int)):
        patient_lng = patient_lat
        patient_lat = db
        db = None

    if not city:
        return []

    close_db_on_exit = False
    if db is None:
        db = SessionLocal()
        close_db_on_exit = True

    try:
        base_q = db.query(User).filter(
            User.role == "doctor",
            User.is_verified == True,
        )

        def location_filter(q):
            city_lower = city.lower()
            conditions = [User.city.ilike(f"%{city_lower}%")]
            if area:
                area_lower = area.lower()
                conditions.append(User.address.ilike(f"%{area_lower}%"))
            return q.filter(or_(*conditions))

        def to_dict(doc: User) -> dict:
            lat = doc.lat or 0.0
            lng = doc.lng or 0.0

            if lat == 0.0 or lng == 0.0:
                doc_address = (doc.address or "").lower()
                matched_area = next(
                    (coords for area_name, coords in CITY_AREA_COORDS.items() if area_name.lower() in doc_address),
                    None,
                )
                if matched_area:
                    base_lat, base_lng = matched_area
                else:
                    matched_key = next((k for k in CITY_AREA_COORDS if k.lower() == (city or "").lower()), None)
                    base_lat, base_lng = CITY_AREA_COORDS[matched_key] if matched_key else (12.9716, 77.5946)

                lat = base_lat + random.uniform(-0.008, 0.008)
                lng = base_lng + random.uniform(-0.008, 0.008)

            return {
                "id":        doc.id,
                "name":      doc.full_name or "Unknown Doctor",
                "specialty": doc.specialization or "General Physician",
                "address":   doc.address or city,
                "lat":       lat,
                "lng":       lng,
            }

        city_pool_q = location_filter(base_q)

        matched = city_pool_q.filter(User.specialization.ilike(specialist)).all()
        if matched:
            results = [to_dict(d) for d in matched]
        else:
            gp = city_pool_q.filter(User.specialization.ilike("General Physician")).all()
            if gp:
                results = [to_dict(d) for d in gp]
            else:
                results = [to_dict(d) for d in city_pool_q.limit(3).all()]

        if patient_lat is not None and patient_lng is not None:
            for doc_dict in results:
                doc_dict["distance_km"] = haversine(
                    float(patient_lat), float(patient_lng), float(doc_dict["lat"]), float(doc_dict["lng"])
                )
            results.sort(key=lambda d: d["distance_km"])

        return results
    finally:
        if close_db_on_exit:
            db.close()


class UserMessage(ProcessRequest):
    pass


# ---------------------------------------------------------------------------
# Root health check
# ---------------------------------------------------------------------------
@app.get("/")
def read_root():
    return {"message": "Medical Consultation Assistant API is running."}


# ---------------------------------------------------------------------------
# NLP / AI chat endpoint
# ---------------------------------------------------------------------------
@app.post("/process")
def process_message(
    msg: UserMessage,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session_id = msg.session_id

    english_text, user_lang = detect_and_translate_to_english(msg.text)
    extracted = extract_medical_info(english_text)

    if session_id not in sessions:
        sessions[session_id] = {"symptoms": None, "city": None, "area": None}

    session = sessions[session_id]
    if extracted["symptoms"]:
        session["symptoms"] = extracted["symptoms"]
    if extracted["city"]:
        session["city"] = normalize_city(extracted["city"])
    if extracted["area"]:
        session["area"] = extracted["area"]

    symptoms = session["symptoms"]
    city     = session["city"]
    area     = session["area"]
    extracted_city = city
    extracted_area = area
    specialist = get_specialist(symptoms)

    doctors = []
    # Location Resolution Priority Chain:
    # Priority 1: Live GPS from frontend
    # Priority 2: Saved home location from patient profile (coords -> city/address lookup)
    # Priority 3: NLP extracted location from message
    if msg.patient_lat is not None and msg.patient_lng is not None:
        patient_lat = msg.patient_lat
        patient_lng = msg.patient_lng
        if not extracted_city and current_user and getattr(current_user, "city", None):
            extracted_city = current_user.city
            city = current_user.city
    elif (
        current_user
        and getattr(current_user, "lat", None) is not None
        and getattr(current_user, "lng", None) is not None
    ):
        patient_lat = current_user.lat
        patient_lng = current_user.lng
        if not extracted_city and getattr(current_user, "city", None):
            extracted_city = current_user.city
            city = current_user.city
        if not extracted_area and getattr(current_user, "address", None):
            extracted_area = current_user.address
            area = current_user.address
    elif (
        current_user
        and getattr(current_user, "city", None) is not None
        and str(current_user.city).strip() != ""
    ):
        if not extracted_city:
            extracted_city = current_user.city
            city = current_user.city
        if not extracted_area and getattr(current_user, "address", None):
            extracted_area = current_user.address
            area = current_user.address
        patient_lat, patient_lng = get_patient_coords(
            current_user.city, getattr(current_user, "address", None)
        )
    else:
        patient_lat, patient_lng = get_patient_coords(extracted_city, extracted_area)

    display_location = extracted_area or extracted_city

    if symptoms and extracted_city:
        doctors = find_doctors(
            extracted_city, extracted_area, specialist, db, patient_lat=patient_lat, patient_lng=patient_lng
        )
        if doctors:
            reply = (
                f"I've found {len(doctors)} {specialist}(s) in "
                f"{display_location} who can help with your {symptoms}. "
                f"Mapping them now..."
            )
        else:
            reply = (
                f"I couldn't find a {specialist} near {display_location} "
                f"for your {symptoms}. Try a nearby city or broader area."
            )
        consultation_status = "complete"
    elif symptoms and not city:
        reply = (
            f"I understand you're experiencing {symptoms}. "
            f"Which city are you in so I can find a {specialist} for you?"
        )
        consultation_status = "incomplete"
    elif city and not symptoms:
        reply = (
            f"I've noted your location as {display_location}. "
            f"Could you describe your symptoms so I can find the right specialist?"
        )
        consultation_status = "incomplete"
    else:
        reply = (
            "I didn't catch that. Could you describe your symptoms "
            "or mention which city you're in?"
        )
        consultation_status = "incomplete"

    localized_reply = translate_from_english(reply, user_lang)

    return {
        "reply": localized_reply,
        "status": consultation_status,
        "city": city,
        "area": area,
        "doctors": doctors,
    }
