from fastapi import APIRouter, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from models import User, Doctor, Appointment
from auth_utils import get_current_patient
from services.geo import resolve_coords_sync

router = APIRouter(prefix="/api/patient", tags=["Patient"])


@router.get("/profile", response_model=schemas.PatientProfileResponse)
def get_patient_profile(
    current_patient: User = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    """Return the authenticated patient's profile (including home location)."""
    # Auto-resolve coordinates if missing
    if current_patient.home_lat is None or current_patient.home_lng is None:
        lat, lng = resolve_coords_sync(current_patient.home_city, current_patient.home_address)
        if lat is not None and lng is not None:
            current_patient.home_lat = lat
            current_patient.home_lng = lng
            db.commit()
            db.refresh(current_patient)

    return {
        "id": current_patient.id,
        "full_name": current_patient.full_name,
        "email": current_patient.email,
        "age": current_patient.age,
        "gender": current_patient.gender,
        "phone": current_patient.phone,
        "city": current_patient.home_city,
        "address": current_patient.home_address,
        "home_city": current_patient.home_city,
        "home_address": current_patient.home_address,
        "lat": current_patient.home_lat,
        "lng": current_patient.home_lng,
        "home_lat": current_patient.home_lat,
        "home_lng": current_patient.home_lng,
    }


@router.put("/profile", response_model=schemas.PatientProfileResponse)
def update_patient_profile(
    payload: schemas.PatientProfileUpdate,
    current_patient: User = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    if payload.full_name is not None:
        current_patient.full_name = payload.full_name
    if payload.age is not None:
        current_patient.age = payload.age
    if payload.gender is not None:
        current_patient.gender = payload.gender
    if payload.phone is not None:
        current_patient.phone = payload.phone

    # Handle city/address fields with flexibility for home_city/city and home_address/address
    new_city = payload.home_city if payload.home_city is not None else payload.city
    new_address = payload.home_address if payload.home_address is not None else payload.address

    if new_city is not None:
        current_patient.home_city = new_city
    if new_address is not None:
        current_patient.home_address = new_address

    new_lat = payload.home_lat if payload.home_lat is not None else payload.lat
    new_lng = payload.home_lng if payload.home_lng is not None else payload.lng

    if new_lat is not None:
        current_patient.home_lat = new_lat
    if new_lng is not None:
        current_patient.home_lng = new_lng

    if current_patient.home_lat is None or current_patient.home_lng is None:
        lat, lng = resolve_coords_sync(current_patient.home_city, current_patient.home_address)
        if lat is not None and lng is not None:
            current_patient.home_lat = lat
            current_patient.home_lng = lng

    db.commit()
    db.refresh(current_patient)

    return {
        "id": current_patient.id,
        "full_name": current_patient.full_name,
        "email": current_patient.email,
        "age": current_patient.age,
        "gender": current_patient.gender,
        "phone": current_patient.phone,
        "city": current_patient.home_city,
        "address": current_patient.home_address,
        "home_city": current_patient.home_city,
        "home_address": current_patient.home_address,
        "lat": current_patient.home_lat,
        "lng": current_patient.home_lng,
        "home_lat": current_patient.home_lat,
        "home_lng": current_patient.home_lng,
    }


@router.get("/appointments")
def get_patient_appointments(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_patient: User = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    """Return appointments for the authenticated patient, enriched with doctor details."""
    base_q = (
        db.query(Appointment, Doctor)
        .join(Doctor, Appointment.doctor_id == Doctor.id)
        .filter(Appointment.patient_id == current_patient.id)
    )

    total = base_q.count()
    rows = base_q.offset(skip).limit(limit).all()

    data = []
    for appt, doc in rows:
        data.append({
            "id": appt.id,
            "doctor_name": doc.full_name or "Unknown Doctor",
            "specialty": doc.specialization or "General",
            "appointment_date": appt.appointment_date.isoformat() if appt.appointment_date else None,
            "slot_time": appt.slot_time,
            "symptoms": appt.symptoms_summary,
            "status": appt.status,
            "prescription_notes": appt.prescription_notes,
        })

    return {"data": data, "total": total, "skip": skip, "limit": limit}
