from datetime import date as date_type

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import extract
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

import schemas
from auth_utils import (
    create_access_token,
    get_current_doctor,
    get_password_hash,
    revoke_tokens,
    verify_password,
)
from database import get_db
from models import Appointment, Doctor, User
from services.email_service import send_completion_summary
from services.geo import resolve_coords_sync

router = APIRouter(prefix="/api/doctor", tags=["Doctor"])


@router.get("/appointments")
def get_doctor_appointments(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_doctor: Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    # Join with User (patients) to get patient name + email in a single query
    base_q = (
        db.query(Appointment, User)
        .join(User, Appointment.patient_id == User.id)
        .filter(Appointment.doctor_id == current_doctor.id)
    )

    total = base_q.count()
    rows = base_q.offset(skip).limit(limit).all()

    data = []
    for appt, patient in rows:
        data.append({
            "id": appt.id,
            "patient_id": appt.patient_id,
            "doctor_id": appt.doctor_id,
            "appointment_date": appt.appointment_date.isoformat() if appt.appointment_date else None,
            "slot_time": appt.slot_time,
            "symptoms_summary": appt.symptoms_summary,
            "status": appt.status,
            "patient_name": patient.full_name or "Unknown Patient",
            "patient_email": patient.email or None,
            "patient_phone": patient.phone or None,
            "patient_age": patient.age,
            "patient_gender": patient.gender,
            "prescription_notes": appt.prescription_notes,
        })

    return {"data": data, "total": total, "skip": skip, "limit": limit}


@router.patch("/appointments/{appointment_id}/notes")
def update_appointment_notes(
    appointment_id: int,
    payload: schemas.AppointmentComplete,
    current_doctor: Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    """Save or update prescription notes / vitals draft for an appointment without changing status."""
    appt = db.query(Appointment).filter(
        Appointment.id == appointment_id,
        Appointment.doctor_id == current_doctor.id,
    ).first()

    if not appt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found.",
        )

    if appt.status and appt.status.lower() == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cancelled appointments cannot be updated.",
        )

    appt.prescription_notes = payload.prescription_notes
    db.commit()
    db.refresh(appt)

    return {
        "message": "Prescription notes saved.",
        "appointment_id": appt.id,
        "prescription_notes": appt.prescription_notes,
    }


@router.patch("/appointments/{appointment_id}/complete")
def complete_appointment(
    appointment_id: int,
    payload: schemas.AppointmentComplete,
    background_tasks: BackgroundTasks,
    current_doctor: Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    appt = db.query(Appointment).filter(
        Appointment.id == appointment_id,
        Appointment.doctor_id == current_doctor.id,
    ).first()

    if not appt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found.",
        )

    if appt.status and appt.status.lower() == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cancelled appointments cannot be marked as completed.",
        )

    if appt.status and appt.status.lower() == "completed":
        # Allow updating prescription notes on already completed appointments
        if payload.prescription_notes is not None:
            appt.prescription_notes = payload.prescription_notes
            db.commit()
            db.refresh(appt)
        return {
            "message": "Appointment updated.",
            "appointment_id": appt.id,
            "prescription_notes": appt.prescription_notes,
        }

    appt.status = "Completed"
    appt.prescription_notes = payload.prescription_notes
    db.commit()
    db.refresh(appt)

    # Fire background email task to patient
    patient = db.query(User).filter(User.id == appt.patient_id).first()
    if patient:
        background_tasks.add_task(
            send_completion_summary,
            patient_email=patient.email,
            details={
                "patient_name": patient.full_name,
                "doctor_name": current_doctor.full_name,
                "prescription_notes": payload.prescription_notes,
                "date": str(appt.appointment_date),
            },
        )

    return {"message": "Appointment marked as completed.", "appointment_id": appt.id}


@router.get("/profile")
def get_doctor_profile(
    current_doctor: Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    """Return the authenticated doctor's profile."""
    return {
        "id": current_doctor.id,
        "email": current_doctor.email,
        "full_name": current_doctor.full_name,
        "specialization": current_doctor.specialization,
        "experience_years": current_doctor.experience_years,
        "qualifications": current_doctor.qualifications,
        "license_number": current_doctor.license_number,
        "phone": current_doctor.phone,
        "city": current_doctor.practice_city,
        "address": current_doctor.practice_address,
        "practice_city": current_doctor.practice_city,
        "practice_address": current_doctor.practice_address,
        "lat": current_doctor.practice_lat,
        "lng": current_doctor.practice_lng,
        "practice_lat": current_doctor.practice_lat,
        "practice_lng": current_doctor.practice_lng,
        "consultation_fee": current_doctor.consultation_fee,
        "bio": current_doctor.bio,
        "shift_start": current_doctor.shift_start or "09:00",
        "shift_end": current_doctor.shift_end or "17:00",
        "slot_duration_minutes": current_doctor.slot_duration_minutes,
        "blocked_dates": current_doctor.blocked_dates or [],
        "is_verified": current_doctor.is_verified,
        "is_active": current_doctor.is_active,
    }


@router.put("/profile")
def update_doctor_profile(
    payload: schemas.DoctorProfileUpdate,
    current_doctor: Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    """Update the authenticated doctor's profile and clinic information."""
    if payload.full_name is not None:
        current_doctor.full_name = payload.full_name
    if payload.specialization is not None:
        current_doctor.specialization = payload.specialization
    if payload.experience_years is not None:
        current_doctor.experience_years = payload.experience_years
    if payload.qualifications is not None:
        current_doctor.qualifications = payload.qualifications
    if payload.license_number is not None:
        current_doctor.license_number = payload.license_number
    if payload.phone is not None:
        current_doctor.phone = payload.phone
    if payload.consultation_fee is not None:
        current_doctor.consultation_fee = payload.consultation_fee
    if payload.bio is not None:
        current_doctor.bio = payload.bio
    if payload.shift_start is not None:
        current_doctor.shift_start = payload.shift_start
    if payload.shift_end is not None:
        current_doctor.shift_end = payload.shift_end

    new_city = payload.practice_city if payload.practice_city is not None else payload.city
    new_address = payload.practice_address if payload.practice_address is not None else payload.address

    address_changed = False
    if new_city is not None and new_city != current_doctor.practice_city:
        current_doctor.practice_city = new_city
        address_changed = True
    elif new_city is not None:
        current_doctor.practice_city = new_city

    if new_address is not None and new_address != current_doctor.practice_address:
        current_doctor.practice_address = new_address
        address_changed = True
    elif new_address is not None:
        current_doctor.practice_address = new_address

    new_lat = payload.practice_lat if payload.practice_lat is not None else payload.lat
    new_lng = payload.practice_lng if payload.practice_lng is not None else payload.lng

    if new_lat is not None:
        current_doctor.practice_lat = new_lat
    if new_lng is not None:
        current_doctor.practice_lng = new_lng

    if (current_doctor.practice_lat is None or current_doctor.practice_lng is None or address_changed) and (new_lat is None and new_lng is None):
        lat, lng = resolve_coords_sync(current_doctor.practice_city, current_doctor.practice_address)
        if lat is not None and lng is not None:
            current_doctor.practice_lat = lat
            current_doctor.practice_lng = lng

    db.commit()
    db.refresh(current_doctor)

    return {
        "id": current_doctor.id,
        "email": current_doctor.email,
        "full_name": current_doctor.full_name,
        "specialization": current_doctor.specialization,
        "experience_years": current_doctor.experience_years,
        "qualifications": current_doctor.qualifications,
        "license_number": current_doctor.license_number,
        "phone": current_doctor.phone,
        "city": current_doctor.practice_city,
        "address": current_doctor.practice_address,
        "practice_city": current_doctor.practice_city,
        "practice_address": current_doctor.practice_address,
        "lat": current_doctor.practice_lat,
        "lng": current_doctor.practice_lng,
        "practice_lat": current_doctor.practice_lat,
        "practice_lng": current_doctor.practice_lng,
        "consultation_fee": current_doctor.consultation_fee,
        "bio": current_doctor.bio,
        "shift_start": current_doctor.shift_start or "09:00",
        "shift_end": current_doctor.shift_end or "17:00",
        "slot_duration_minutes": current_doctor.slot_duration_minutes,
        "blocked_dates": current_doctor.blocked_dates or [],
        "is_verified": current_doctor.is_verified,
        "is_active": current_doctor.is_active,
    }


@router.post("/change-password")
def change_doctor_password(
    payload: schemas.ChangePasswordRequest,
    current_doctor: Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    """Change the authenticated doctor's password."""
    if not verify_password(payload.current_password, current_doctor.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long.",
        )

    current_doctor.hashed_password = get_password_hash(payload.new_password)
    # Invalidate this session's token too. The response below carries a fresh
    # one, so the doctor stays signed in on this device while every other
    # session is logged out -- which is the point of changing a password
    # after suspecting a compromise.
    revoke_tokens(current_doctor)
    db.commit()

    new_token = create_access_token(data={
        "sub": str(current_doctor.id),
        "role": "doctor",
        "email": current_doctor.email,
        "ver": current_doctor.token_version,
    })

    return {
        "message": "Password updated successfully.",
        "access_token": new_token,
        "token_type": "bearer",
    }


@router.put("/schedule")
def update_doctor_schedule(
    payload: schemas.ScheduleUpdate,
    current_doctor: Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    """
    Update the authenticated doctor's shift_start and shift_end.
    Validates that shift_start is strictly before shift_end.
    """
    if payload.shift_start >= payload.shift_end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"shift_start ({payload.shift_start}) must be before "
                f"shift_end ({payload.shift_end})."
            ),
        )

    current_doctor.shift_start = payload.shift_start
    current_doctor.shift_end = payload.shift_end
    db.commit()
    db.refresh(current_doctor)

    return {
        "message": "Schedule updated successfully.",
        "shift_start": current_doctor.shift_start,
        "shift_end": current_doctor.shift_end,
    }


@router.post("/blocked-dates")
def toggle_blocked_date(
    payload: schemas.BlockedDateToggle,
    current_doctor: Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    try:
        target_date = date_type.fromisoformat(payload.date)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD.",
        ) from None
    if target_date < date_type.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot mark past dates as vacation.",
        )

    current_blocked = list(current_doctor.blocked_dates or [])

    if payload.date in current_blocked:
        current_blocked.remove(payload.date)
        action = "unblocked"
    else:
        current_blocked.append(payload.date)
        action = "blocked"

    current_doctor.blocked_dates = current_blocked
    flag_modified(current_doctor, "blocked_dates")
    db.commit()
    db.refresh(current_doctor)

    return {
        "message": f"Date {payload.date} {action} successfully.",
        "blocked_dates": current_doctor.blocked_dates,
    }


@router.get("/calendar-summary")
def get_calendar_summary(
    year: int = Query(...),
    month: int = Query(...),
    current_doctor: Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
):
    """
    Returns an aggregated view of the doctor's month:
    {
      "booked_counts": { "2026-08-15": 3, "2026-08-16": 1 },
      "blocked_dates": ["2026-08-20"]
    }
    """
    appts = db.query(Appointment).filter(
        Appointment.doctor_id == current_doctor.id,
        extract("year", Appointment.appointment_date) == year,
        extract("month", Appointment.appointment_date) == month,
    ).all()

    booked_counts: dict[str, int] = {}
    for appt in appts:
        if appt.status != "Cancelled":
            date_str = str(appt.appointment_date)
            booked_counts[date_str] = booked_counts.get(date_str, 0) + 1

    return {
        "booked_counts": booked_counts,
        "blocked_dates": current_doctor.blocked_dates or [],
    }
