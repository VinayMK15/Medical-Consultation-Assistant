from datetime import date as date_type
from fastapi import APIRouter, HTTPException, Depends, Query, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import extract

import models
import schemas
from database import get_db
from models import User, Doctor, Appointment
from auth_utils import get_current_doctor
from services.email_service import send_completion_summary

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
            "prescription_notes": appt.prescription_notes,
        })

    return {"data": data, "total": total, "skip": skip, "limit": limit}


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
        )

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

    booked_counts = {}
    for appt in appts:
        if appt.status != "Cancelled":
            date_str = str(appt.appointment_date)
            booked_counts[date_str] = booked_counts.get(date_str, 0) + 1

    return {
        "booked_counts": booked_counts,
        "blocked_dates": current_doctor.blocked_dates or [],
    }
