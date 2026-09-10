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
import random
import logging
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_
from cachetools import TTLCache

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from limiter import limiter

from database import engine, get_db, SessionLocal
import models
from models import User, Doctor, AdminUser, SymptomMapping, Specialization
from schemas import ProcessRequest
from auth_utils import get_current_user
from services.translator_logic import detect_and_translate_to_english, translate_from_english
from services.nlp_processor import extract_medical_info, normalize_city
from services.geo import resolve_coords_sync, haversine, CITY_AREA_COORDS

from routers import auth, doctor, patient, appointments, admin

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Symptom Cache System (DB-backed)
# ---------------------------------------------------------------------------
_symptom_cache: Dict[str, str] = {}


def load_symptom_cache(db: Optional[Session] = None):
    """Load all symptom mappings from DB into memory cache."""
    global _symptom_cache
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        mappings = db.query(SymptomMapping).all()
        _symptom_cache = {m.symptom.lower().strip(): m.specialist for m in mappings}
        logger.info("Loaded %d symptom mappings into cache.", len(_symptom_cache))
    except Exception as exc:
        logger.warning("Could not load symptom cache from DB: %s", exc)
    finally:
        if close_db:
            db.close()


def invalidate_symptom_cache():
    """Reload symptom cache from database."""
    load_symptom_cache()


def save_learned_symptom(symptom: str, specialist: str, added_by: str = "NLP"):
    """Persist a dynamically learned symptom mapping to DB and cache."""
    global _symptom_cache
    symptom_clean = symptom.lower().strip()
    db = SessionLocal()
    try:
        existing = db.query(SymptomMapping).filter(SymptomMapping.symptom == symptom_clean).first()
        if not existing:
            mapping = SymptomMapping(
                symptom=symptom_clean,
                specialist=specialist,
                is_custom=True,
                added_by=added_by,
            )
            db.add(mapping)
            db.commit()
            _symptom_cache[symptom_clean] = specialist
    except Exception as exc:
        logger.warning("Failed to persist learned symptom '%s': %s", symptom, exc)
    finally:
        db.close()


def get_specialist(symptoms: str) -> str:
    """Return the best-matching specialist for the given symptom string from DB cache."""
    global _symptom_cache
    if not _symptom_cache:
        load_symptom_cache()

    if not symptoms:
        return "General Physician"
    lower = symptoms.lower()

    # Search in DB cache (longest match first)
    for keyword in sorted(_symptom_cache, key=len, reverse=True):
        if keyword in lower:
            return _symptom_cache[keyword]

    return "General Physician"


# Eagerly initialize cache on module load
load_symptom_cache()


# ---------------------------------------------------------------------------
# Lifespan context manager
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:
      1. Validate Alembic migration state.
      2. Preload DB-backed symptom cache.
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
                "Database migrations are not up to date. Current: %s | Head: %s | Run: alembic upgrade head",
                current_revision,
                head_revision,
            )
        else:
            logger.info("Database schema is up to date at revision: %s", current_revision)
    except Exception as e:
        logger.warning("Could not validate Alembic migration state: %s", e)

    # Preload symptom cache
    load_symptom_cache()

    yield  # Application runs here


app = FastAPI(title="MedAssist API", version="1.0.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Rate Limiting
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS
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
# TTL session store for NLP chat
# ---------------------------------------------------------------------------
SESSION_TTL_SECONDS = 60 * 30  # 30 minutes
SESSION_MAX_SIZE = 1000
sessions: TTLCache = TTLCache(maxsize=SESSION_MAX_SIZE, ttl=SESSION_TTL_SECONDS)


def get_patient_coords(city: Optional[str], area: Optional[str]) -> tuple[Optional[float], Optional[float]]:
    """Helper forwarding to resolve_coords_sync."""
    return resolve_coords_sync(city=city, address=area)


# ---------------------------------------------------------------------------
# Doctor Search Engine (queries Doctor model)
# ---------------------------------------------------------------------------
def find_doctors(
    city: Optional[str],
    area: Optional[str],
    specialist: str,
    db: Optional[Session] = None,
    patient_lat: Optional[float] = None,
    patient_lng: Optional[float] = None,
) -> list:
    """
    Query verified & active doctors from the Doctor table.
    Sort by proximity if patient coordinates are available.
    """
    # Overload flexibility: if db passed as float/int
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
        base_q = db.query(Doctor).filter(
            Doctor.is_verified == True,
            Doctor.is_active == True,
        )

        def location_filter(q):
            city_lower = city.lower()
            conditions = [Doctor.practice_city.ilike(f"%{city_lower}%")]
            if area:
                area_lower = area.lower()
                conditions.append(Doctor.practice_address.ilike(f"%{area_lower}%"))
            return q.filter(or_(*conditions))

        def to_dict(doc: Doctor) -> dict:
            lat = doc.practice_lat or 0.0
            lng = doc.practice_lng or 0.0

            if lat == 0.0 or lng == 0.0:
                doc_address = (doc.practice_address or "").lower()
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
                "id": doc.id,
                "name": doc.full_name or "Unknown Doctor",
                "specialty": doc.specialization or "General Physician",
                "address": doc.practice_address or doc.practice_city or city,
                "city": doc.practice_city or city,
                "lat": lat,
                "lng": lng,
                "experience_years": doc.experience_years,
                "consultation_fee": doc.consultation_fee,
            }

        city_pool_q = location_filter(base_q)

        matched = city_pool_q.filter(Doctor.specialization.ilike(specialist)).all()
        if matched:
            results = [to_dict(d) for d in matched]
        else:
            gp = city_pool_q.filter(Doctor.specialization.ilike("General Physician")).all()
            if gp:
                results = [to_dict(d) for d in gp]
            else:
                results = [to_dict(d) for d in city_pool_q.limit(3).all()]

        # Deduplicate
        seen_keys = set()
        deduped = []
        for d in results:
            key = (d["name"].strip().lower(), d["specialty"].strip().lower(), (d.get("address") or "").strip().lower())
            if key not in seen_keys:
                seen_keys.add(key)
                deduped.append(d)
        results = deduped

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
# Background Map & Exploration Endpoint
# ---------------------------------------------------------------------------
@app.get("/api/doctors")
def get_all_active_doctors(db: Session = Depends(get_db)):
    """Return all verified & active doctors for background map rendering."""
    docs = db.query(Doctor).filter(Doctor.is_verified == True, Doctor.is_active == True).all()
    return [
        {
            "id": d.id,
            "name": d.full_name,
            "specialty": d.specialization,
            "city": d.practice_city,
            "address": d.practice_address,
            "lat": d.practice_lat or 12.9716,
            "lng": d.practice_lng or 77.5946,
            "experience_years": d.experience_years,
            "consultation_fee": d.consultation_fee,
        }
        for d in docs
    ]


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
    current_user: Any = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session_id = msg.session_id
    raw_text = msg.text or msg.message or ""

    english_text, user_lang = detect_and_translate_to_english(raw_text)
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
    city = session["city"]
    area = session["area"]
    extracted_city = city
    extracted_area = area
    specialist = get_specialist(symptoms)

    doctors = []
    patient_lat = None
    patient_lng = None

    # Priority 1: Live coordinates sent from frontend request
    if msg.patient_lat is not None and msg.patient_lng is not None:
        patient_lat = msg.patient_lat
        patient_lng = msg.patient_lng
        user_city = getattr(current_user, "home_city", getattr(current_user, "city", None))
        user_addr = getattr(current_user, "home_address", getattr(current_user, "address", None))

        if not extracted_city and user_city:
            extracted_city = user_city
            city = user_city
            if not extracted_area and user_addr:
                extracted_area = user_addr
                area = user_addr
        elif not extracted_city:
            # Check nearest city within supported areas
            closest_city = None
            min_dist = float("inf")
            for c_name in ["Bangalore", "Mumbai", "Delhi", "Chennai", "Hyderabad", "Pune", "Kolkata"]:
                c_lat, c_lng = CITY_AREA_COORDS[c_name.lower()]
                dist = haversine(patient_lat, patient_lng, c_lat, c_lng)
                if dist < min_dist:
                    min_dist = dist
                    closest_city = c_name
            if closest_city and min_dist < 100:
                extracted_city = closest_city
                city = closest_city

    # Priority 2: Stored lat/lng from patient profile
    elif (
        current_user
        and getattr(current_user, "home_lat", getattr(current_user, "practice_lat", getattr(current_user, "lat", None))) is not None
        and getattr(current_user, "home_lng", getattr(current_user, "practice_lng", getattr(current_user, "lng", None))) is not None
    ):
        patient_lat = getattr(current_user, "home_lat", getattr(current_user, "practice_lat", getattr(current_user, "lat", None)))
        patient_lng = getattr(current_user, "home_lng", getattr(current_user, "practice_lng", getattr(current_user, "lng", None)))
        user_city = getattr(current_user, "home_city", getattr(current_user, "practice_city", getattr(current_user, "city", None)))
        user_addr = getattr(current_user, "home_address", getattr(current_user, "practice_address", getattr(current_user, "address", None)))
        if not extracted_city and user_city:
            extracted_city = user_city
            city = user_city
        if not extracted_area and user_addr:
            extracted_area = user_addr
            area = user_addr

    # Priority 3: City name from user profile
    elif (
        current_user
        and getattr(current_user, "home_city", getattr(current_user, "practice_city", getattr(current_user, "city", None))) is not None
        and str(getattr(current_user, "home_city", getattr(current_user, "practice_city", getattr(current_user, "city", "")))).strip() != ""
    ):
        user_city = getattr(current_user, "home_city", getattr(current_user, "practice_city", getattr(current_user, "city", None)))
        user_addr = getattr(current_user, "home_address", getattr(current_user, "practice_address", getattr(current_user, "address", None)))
        patient_lat, patient_lng = resolve_coords_sync(user_city, user_addr)
        if not extracted_city:
            extracted_city = user_city
            city = user_city
        if not extracted_area and user_addr:
            extracted_area = user_addr
            area = user_addr

    # Priority 4: NLP extracted city / area
    else:
        patient_lat, patient_lng = resolve_coords_sync(extracted_city, extracted_area)

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
        "patient_lat": patient_lat,
        "patient_lng": patient_lng,
    }
