from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from services.translator_logic import detect_and_translate_to_english, translate_from_english
from services.nlp_processor import extract_medical_info
import models
import schemas
from database import engine, get_db
from models import User
from models import Appointment
from auth_utils import get_password_hash, create_access_token, verify_password, get_current_user

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# Allow React frontend to talk to FastAPI without CORS blocks
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store: { session_id: { "symptoms": ..., "city": ..., "area": ... } }
sessions: dict = {}

# ---------------------------------------------------------------------------
# Symptom -> Medical Specialist mapping
# ---------------------------------------------------------------------------
SYMPTOM_SPECIALIST_MAP = {
    # Cardiology
    "chest pain":       "Cardiologist",
    "heart pain":       "Cardiologist",
    "palpitations":     "Cardiologist",
    "heart attack":     "Cardiologist",
    # Neurology
    "headache":         "Neurologist",
    "migraine":         "Neurologist",
    "seizure":          "Neurologist",
    "dizziness":        "Neurologist",
    # Pulmonology
    "cough":            "Pulmonologist",
    "shortness of breath": "Pulmonologist",
    "breathing":        "Pulmonologist",
    "asthma":           "Pulmonologist",
    # Internal Medicine / General
    "nausea":           "Internal Medicine",
    "nauseous":         "Internal Medicine",
    "stomach pain":     "Internal Medicine",
    "abdominal pain":   "Internal Medicine",
    "vomiting":         "Internal Medicine",
    "fever":            "General Physician",
    "cold":             "General Physician",
    "flu":              "General Physician",
    "fatigue":          "General Physician",
    "weakness":         "General Physician",
}

# Specialty strings we recognise (used as fallback label)
_KNOWN_SPECIALTIES = {
    "Cardiologist", "General Physician", "Neurologist",
    "Pulmonologist", "Internal Medicine",
}


def get_specialist(symptoms: str) -> str:
    """Return the best-matching specialist for the given symptom string."""
    if not symptoms:
        return "General Physician"
    lower = symptoms.lower()
    # Longest-match first so "chest pain" beats "pain"
    for keyword in sorted(SYMPTOM_SPECIALIST_MAP, key=len, reverse=True):
        if keyword in lower:
            return SYMPTOM_SPECIALIST_MAP[keyword]
    return "General Physician"


def find_doctors(city: str | None, area: str | None, specialist: str, db: Session) -> list:
    """
    Query verified doctors from the SQLite database.

    Priority:
      1. Specialist match + city/area match
      2. General Physician fallback in the same city
      3. Any verified doctor in the city (top 3)
    """
    if not city:
        return []

    # All verified doctors in the city
    base_q = db.query(User).filter(
        User.role == "doctor",
        User.is_verified == True,
    )

    def location_filter(q):
        """Filter doctors whose city or address matches the requested city/area."""
        city_lower = city.lower()
        conditions = [User.city.ilike(f"%{city_lower}%")]
        if area:
            area_lower = area.lower()
            conditions.append(User.address.ilike(f"%{area_lower}%"))
        # OR: match on city OR address containing area
        from sqlalchemy import or_
        return q.filter(or_(*conditions))

    def to_dict(doc: User) -> dict:
        return {
            "id":        doc.id,
            "name":      doc.full_name or "Unknown Doctor",
            "specialty": doc.specialization or "General Physician",
            "address":   doc.address or city,
            "lat":       float(doc.lat) if doc.lat else None,
            "lng":       float(doc.lng) if doc.lng else None,
        }

    city_pool_q = location_filter(base_q)

    # 1. Specialist + location
    matched = city_pool_q.filter(
        User.specialization.ilike(specialist)
    ).all()
    if matched:
        return [to_dict(d) for d in matched]

    # 2. General Physician fallback
    gp = city_pool_q.filter(
        User.specialization.ilike("General Physician")
    ).all()
    if gp:
        return [to_dict(d) for d in gp]

    # 3. Any verified doctor in the city (top 3)
    return [to_dict(d) for d in city_pool_q.limit(3).all()]


class UserMessage(BaseModel):
    text: str
    session_id: str





@app.get("/")
def read_root():
    return {"message": "Medical Consultation Assistant API is running."}


@app.post("/process")
def process_message(msg: UserMessage, db: Session = Depends(get_db)):
    session_id = msg.session_id

    # Step 1: Detect source language + translate input to English
    english_text, user_lang = detect_and_translate_to_english(msg.text)

    # Step 2: Extract medical info (symptoms, city, area)
    extracted = extract_medical_info(english_text)

    # Step 3: Update session with any newly found info
    if session_id not in sessions:
        sessions[session_id] = {"symptoms": None, "city": None, "area": None}

    session = sessions[session_id]
    if extracted["symptoms"]:
        session["symptoms"] = extracted["symptoms"]
    if extracted["city"]:
        session["city"] = extracted["city"]
    if extracted["area"]:
        session["area"] = extracted["area"]

    # Step 4: Logic gate -- determine what to reply
    symptoms = session["symptoms"]
    city     = session["city"]
    area     = session["area"]
    specialist = get_specialist(symptoms)

    doctors = []
    display_location = area or city  # prefer the more specific name for the reply

    if symptoms and city:
        doctors = find_doctors(city, area, specialist, db)
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

    # Step 5: Translate the reply back to the user's original language
    localized_reply = translate_from_english(reply, user_lang)

    return {
        "reply": localized_reply,
        "status": consultation_status,
        "city": city,
        "area": area,
        "doctors": doctors,
    }


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # 1. Check if user already exists
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists.",
        )

    # 2. Hash the password
    hashed_pw = get_password_hash(user.password)

    # 3. Save to database
    new_user = User(
        email=user.email,
        hashed_password=hashed_pw,
        full_name=user.full_name,
        age=user.age,
        gender=user.gender,
        role=user.role,
        specialization=user.specialization,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Return success message along with minimal info
    return {
        "message": "Account created successfully.",
        "id": new_user.id,
        "email": new_user.email
    }


@app.post("/api/auth/login")
def login(user_credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    # 1. Check user exists
    user = db.query(User).filter(User.email == user_credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Credentials",
        )

    # 2. Verify password
    if not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Credentials",
        )

    # 3. Check verification status for doctors
    if user.role == "doctor" and not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending admin verification.",
        )

    # 4. Create access token
    token = create_access_token(data={"sub": user.email})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "name": user.full_name,
            "email": user.email,
            "role": user.role,
            "is_verified": user.is_verified,
        }
    }


# ---------------------------------------------------------------------------
# Doctor routes
# ---------------------------------------------------------------------------

@app.get("/api/doctor/appointments")
def get_doctor_appointments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Doctor portal only."
        )

    # Join with User table to get patient name + email
    appointments = db.query(Appointment).filter(
        Appointment.doctor_id == current_user.id
    ).all()

    result = []
    for appt in appointments:
        patient = db.query(User).filter(User.id == appt.patient_id).first()
        result.append({
            "id": appt.id,
            "patient_id": appt.patient_id,
            "doctor_id": appt.doctor_id,
            "appointment_time": appt.appointment_time,
            "symptoms_summary": appt.symptoms_summary,
            "status": appt.status,
            "patient_name": patient.full_name if patient else "Unknown Patient",
            "patient_email": patient.email if patient else None,
        })

    return result


@app.patch("/api/doctor/appointments/{appointment_id}/complete")
def complete_appointment(
    appointment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Doctor portal only."
        )

    appt = db.query(Appointment).filter(
        Appointment.id == appointment_id,
        Appointment.doctor_id == current_user.id
    ).first()

    if not appt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found."
        )

    appt.status = "Completed"
    db.commit()
    db.refresh(appt)
    return {"message": "Appointment marked as completed.", "appointment_id": appt.id}


# ---------------------------------------------------------------------------
# Patient routes
# ---------------------------------------------------------------------------

@app.get("/api/patient/appointments")
def get_patient_appointments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return all appointments for the authenticated patient, enriched with doctor details."""
    if current_user.role != "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Patient portal only."
        )

    # Alias the User table so we can join it as the "doctor" side
    DoctorUser = models.User

    rows = (
        db.query(Appointment, DoctorUser)
        .join(DoctorUser, Appointment.doctor_id == DoctorUser.id)
        .filter(Appointment.patient_id == current_user.id)
        .all()
    )

    result = []
    for appt, doctor in rows:
        result.append({
            "id":             appt.id,
            "doctor_name":    doctor.full_name or "Unknown Doctor",
            "specialty":      doctor.specialization or "General",
            "date":           appt.appointment_time.isoformat() if appt.appointment_time else None,
            "symptoms":       appt.symptoms_summary,
            "status":         appt.status,
        })

    return result


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------

@app.get("/api/admin/pending-doctors", response_model=list[schemas.UserResponse])
def get_pending_doctors(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Admin portal only."
        )

    return db.query(User).filter(
        User.role == "doctor",
        User.is_verified == False
    ).all()


@app.post("/api/admin/verify-doctor/{doctor_id}")
def verify_doctor(
    doctor_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Admin portal only."
        )

    doctor = db.query(User).filter(User.id == doctor_id, User.role == "doctor").first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found."
        )

    doctor.is_verified = True
    db.commit()
    db.refresh(doctor)

    return {"message": f"Doctor '{doctor.full_name}' has been verified successfully.", "doctor_id": doctor.id}
