"""
MedAssist API entrypoint.

Application wiring: the lifespan handler, middleware, router registration, and
the endpoints that belong to no feature router -- `/api/doctors` for the
background map and `/process` for the symptom chat.

Everything else lives elsewhere:
  - routers/       HTTP layer, one module per feature
  - services/      business logic that is not HTTP-shaped

    nlp_processor  symptom extraction and regional vocabulary matching
    routing        symptom -> specialty, curated and IDF-weighted
    doctor_search  filtering, ranking and capping doctor results
    vocabulary     the vocabularies, and how they are loaded
    geo            geocoding and haversine distance
    translator     language detection and translation
    email_service  transactional email

The vocabularies and routing caches are built explicitly in the lifespan
handler, not at import time. Importing any service must not open a database
connection -- that previously broke read-only replicas, workers starting before
migrations, and the test suite.
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from cachetools import TTLCache
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from auth_utils import get_current_user
from database import checkpoint_wal, engine, get_db
from limiter import limiter
from models import Doctor
from routers import (
    admin,
    admin_doctors,
    admin_taxonomy,
    appointments,
    auth,
    contact,
    doctor,
    patient,
)
from schemas import ProcessRequest
from services import routing, vocabulary
from services.doctor_search import find_doctors
from services.geo import resolve_coords_sync, resolve_doctor_display_coords
from services.nlp_processor import extract_medical_info, normalize_city
from services.routing import format_specialists, format_specialists_count, get_specialists
from services.translator_logic import (
    detect_and_translate_to_english,
    translate_from_english,
)

logger = logging.getLogger(__name__)

# Re-exported for the admin routes, the NLP service and the tests, which
# rebuild the routing cache after changing a mapping. Kept importable from
# `main` so none of them has to reach into services/ for one name.
invalidate_symptom_cache = routing.invalidate_symptom_cache
get_specialist = routing.get_specialist
save_learned_symptom = routing.save_learned_symptom

# Backing store for the multi-turn symptom chat. TTL-bounded so a patient who
# abandons a conversation does not leak a session entry indefinitely.
SESSION_TTL_SECONDS = 60 * 30
SESSION_MAX_SIZE = 1000
sessions: TTLCache = TTLCache(maxsize=SESSION_MAX_SIZE, ttl=SESSION_TTL_SECONDS)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:
      1. Validate the Alembic revision.
      2. Build the vocabularies and routing caches.
    Shutdown:
      3. Checkpoint the WAL so the .db file is self-contained.
    """
    _validate_migrations()
    _warm_caches()

    yield  # Application runs here

    # Fold the WAL back into the main database. Without this, committed rows
    # stay in the -wal sidecar and a plain file copy of the .db is missing
    # them.
    #
    # PASSIVE, not TRUNCATE: TRUNCATE needs exclusive access to reset the WAL
    # file, so it blocks for the full busy_timeout whenever any request still
    # holds a read transaction. PASSIVE copies what it can and returns
    # immediately, which is the right trade for a shutdown path.
    try:
        _busy, log_pages, checkpointed = checkpoint_wal("PASSIVE")
        logger.info(
            "WAL checkpointed on shutdown: %d pages copied, %d still in WAL.",
            checkpointed, log_pages,
        )
    except Exception as exc:
        logger.warning("WAL checkpoint on shutdown failed: %s", exc)


def _validate_migrations() -> None:
    """
    Warn when the database is behind the migration head.

    A warning rather than a refusal: the app can still serve most endpoints
    against an older schema, and refusing to start would turn a fixable
    problem into an outage.
    """
    try:
        script = ScriptDirectory.from_config(Config("alembic.ini"))
        head_revision = script.get_current_head()

        with engine.connect() as conn:
            current = MigrationContext.configure(conn).get_current_revision()

        if current != head_revision:
            logger.warning(
                "Database migrations are not up to date. Current: %s | Head: %s "
                "| Run: alembic upgrade head",
                current, head_revision,
            )
        else:
            logger.info("Database schema is up to date at revision: %s", current)
    except Exception as exc:
        logger.warning("Could not validate Alembic migration state: %s", exc)


def _warm_caches() -> None:
    """Build the in-memory vocabularies and routing caches."""
    vocabulary.warm_all()
    routing.warm_caches()


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(title="MedAssist API", version="1.0.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
_ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:5174,http://127.0.0.1:5174",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add OWASP-recommended security headers to every response."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(self)"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' unpkg.com; "
            "style-src 'self' 'unsafe-inline' fonts.googleapis.com; "
            "font-src 'self' fonts.gstatic.com; "
            "img-src 'self' data: *.tile.openstreetmap.org; "
            "connect-src 'self' localhost:8000 nominatim.openstreetmap.org "
            "router.project-osrm.org"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(doctor.router)
app.include_router(patient.router)
app.include_router(appointments.router)
app.include_router(contact.router)

# The admin panel spans three modules: users, doctors, and the symptom
# taxonomy. All share the /api/admin prefix; the frontend addresses them by
# literal path.
app.include_router(admin.router)
app.include_router(admin_doctors.router)
app.include_router(admin_taxonomy.router)


# ---------------------------------------------------------------------------
# Background map
# ---------------------------------------------------------------------------
@app.get("/api/doctors")
def get_all_active_doctors(db: Session = Depends(get_db)):
    """
    Return all verified and active doctors for background map rendering.

    Unfiltered by city: the map needs every marker to place, and the client
    filters. That makes this O(n) in the doctor count -- fine at a few
    hundred rows, and the reason a much larger platform would want a
    bounding-box query instead. See `services/doctor_search.py` for the same
    trade-off documented where the code lives.
    """
    docs = db.query(Doctor).filter(
        Doctor.is_verified == True,  # noqa: E712
        Doctor.is_active == True,  # noqa: E712
    ).all()

    results = []
    for doc in docs:
        lat, lng = resolve_doctor_display_coords(doc)
        results.append({
            "id": doc.id,
            "name": doc.full_name,
            "specialty": doc.specialization,
            "city": doc.practice_city,
            "address": doc.practice_address,
            "lat": lat,
            "lng": lng,
            "experience_years": doc.experience_years,
            "consultation_fee": doc.consultation_fee,
        })
    return results


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/")
def read_root():
    return {"message": "Medical Consultation Assistant API is running."}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/v1/models")
def get_models():
    return {"object": "list", "data": []}


# ---------------------------------------------------------------------------
# Symptom chat
# ---------------------------------------------------------------------------
@app.post("/process")
def process_message(
    msg: ProcessRequest,
    current_user: Any = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    The symptom chat endpoint.

    Accumulates symptoms and location across turns in a TTL-cached session,
    resolves them to ranked specialists, then returns matching doctors.

    Location is resolved in priority order: coordinates the browser supplied,
    then the authenticated user's profile, then what this conversation has
    established. The reply reports whether enough is known to route yet, so
    the client can keep asking rather than showing an empty map.
    """
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
    specialists = get_specialists(symptoms)

    doctors = []
    patient_lat = None
    patient_lng = None

    # The authenticated user's own location, used only to fill gaps. The
    # conversation always wins: a city the patient typed this turn is more
    # current than the one saved at signup.
    profile_city = (
        getattr(current_user, "home_city", None)
        or getattr(current_user, "practice_city", None)
        or getattr(current_user, "city", None)
    )
    profile_addr = (
        getattr(current_user, "home_address", None)
        or getattr(current_user, "practice_address", None)
        or getattr(current_user, "address", None)
    )

    # City is resolved FIRST and independently of coordinates.
    #
    # These used to be one if/elif chain, which meant that a browser sending
    # live coordinates consumed the branch that would otherwise have read the
    # profile -- so `city` stayed None and the reply asked the patient for a
    # city they had already saved on their profile. Coordinates answer "how far
    # away is this doctor"; the city answers "which doctors are candidates at
    # all" (find_doctors returns [] without one). They are separate questions
    # and must not gate each other.
    #
    # Only the city is taken from the profile, never the street address: `area`
    # reaches the client as the map's city label, and a full postal address
    # there renders as "3 near 1487, 5th Cross Rd, ...". The address is still
    # used below, for coordinate resolution, where its precision is wanted.
    if not extracted_city and profile_city:
        extracted_city = profile_city
        city = profile_city

    # Coordinates, most precise source first.
    #
    # Priority 1: live coordinates from the browser. More accurate than
    # anything stored, and it avoids a geocoding round-trip.
    if msg.patient_lat is not None and msg.patient_lng is not None:
        patient_lat = msg.patient_lat
        patient_lng = msg.patient_lng

    # Priority 2: the local city/area table. Resolving from it avoids calling
    # Nominatim for the same city repeatedly. The profile address takes part
    # here as the lookup key, so a saved home location resolves to the same
    # coordinates the map is already showing.
    elif extracted_city:
        patient_lat, patient_lng = resolve_coords_sync(
            city=extracted_city,
            address=extracted_area or profile_addr,
        )

    display_location = extracted_area or extracted_city

    if symptoms and extracted_city:
        doctors = find_doctors(
            city=extracted_city,
            area=extracted_area,
            specialist=specialists,
            db=db,
            patient_lat=patient_lat,
            patient_lng=patient_lng,
        )
        spec_label = format_specialists(specialists)
        if doctors:
            reply = (
                f"I've found {len(doctors)} "
                f"{format_specialists_count(specialists, len(doctors))} in "
                f"{display_location} who can help with your {symptoms}. "
                f"Mapping them now..."
            )
        else:
            reply = (
                f"I couldn't find a {spec_label} near {display_location} "
                f"for your {symptoms}. Try a nearby city or broader area."
            )
        consultation_status = "complete"
    elif symptoms and not city:
        reply = (
            f"I understand you're experiencing {symptoms}. "
            f"Which city are you in so I can find a "
            f"{format_specialists(specialists)} for you?"
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
        "specialists": specialists,
        "session_id": session_id,
    }


# Names re-exported for the routers, services and tests, which import them
# from `main` rather than reaching into services/ for a single symbol.
__all__ = [
    "app",
    "find_doctors",
    "get_specialist",
    "invalidate_symptom_cache",
    "lifespan",
    "save_learned_symptom",
]
