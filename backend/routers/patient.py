from fastapi import APIRouter, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from models import User, Appointment
from auth_utils import get_current_user

router = APIRouter(prefix="/api/patient", tags=["Patient"])


@router.get("/profile", response_model=schemas.PatientProfileResponse)
def get_patient_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return the authenticated patient's profile (including home location)."""
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Patient portal only.")

    # Auto-resolve coordinates if missing or outdated default
    from main import get_patient_coords
    lat, lng = get_patient_coords(current_user.city, current_user.address)
    if lat is not None and lng is not None and (current_user.lat != lat or current_user.lng != lng):
        current_user.lat = lat
        current_user.lng = lng
        db.commit()
        db.refresh(current_user)

    return current_user


@router.put("/profile", response_model=schemas.PatientProfileResponse)
def update_patient_profile(
    payload: schemas.PatientProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Patient portal only.")

    if payload.full_name is not None: current_user.full_name = payload.full_name
    if payload.age is not None: current_user.age = payload.age
    if payload.gender is not None: current_user.gender = payload.gender
    if payload.city is not None: current_user.city = payload.city
    if payload.address is not None: current_user.address = payload.address
    if payload.lat is not None: current_user.lat = payload.lat
    if payload.lng is not None: current_user.lng = payload.lng

    if payload.lat is None or payload.lng is None:
        from main import get_patient_coords
        lat, lng = get_patient_coords(current_user.city, current_user.address)
        if lat is not None and lng is not None:
            current_user.lat = lat
            current_user.lng = lng

    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/appointments")
def get_patient_appointments(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return appointments for the authenticated patient, enriched with doctor details."""
    if current_user.role != "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Patient portal only."
        )

    DoctorUser = models.User

    base_q = (
        db.query(Appointment, DoctorUser)
        .join(DoctorUser, Appointment.doctor_id == DoctorUser.id)
        .filter(Appointment.patient_id == current_user.id)
    )

    total = base_q.count()
    rows = base_q.offset(skip).limit(limit).all()

    data = []
    for appt, doctor in rows:
        data.append({
            "id":             appt.id,
            "doctor_name":    doctor.full_name or "Unknown Doctor",
            "specialty":      doctor.specialization or "General",
            "appointment_date": appt.appointment_date.isoformat() if appt.appointment_date else None,
            "slot_time":      appt.slot_time,
            "symptoms":       appt.symptoms_summary,
            "status":         appt.status,
            "prescription_notes": appt.prescription_notes,
        })

    return {"data": data, "total": total, "skip": skip, "limit": limit}
