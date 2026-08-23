from datetime import date as date_type
from fastapi import APIRouter, HTTPException, Depends, Query, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

import models
import schemas
from database import get_db
from models import User, Appointment
from auth_utils import get_current_user
from services.email_service import send_completion_summary

router = APIRouter(prefix="/api/doctor", tags=["Doctor"])


@router.get("/appointments")
def get_doctor_appointments(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Doctor portal only."
        )

    # Join with User table to get patient name + email in a single query
    PatientUser = models.User

    base_q = (
        db.query(Appointment, PatientUser)
        .join(PatientUser, Appointment.patient_id == PatientUser.id)
        .filter(Appointment.doctor_id == current_user.id)
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
        })

    return {"data": data, "total": total, "skip": skip, "limit": limit}



@router.patch("/appointments/{appointment_id}/complete")
def complete_appointment(
    appointment_id: int,
    payload: schemas.AppointmentComplete,
    background_tasks: BackgroundTasks,
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

    if appt.status and appt.status.lower() == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cancelled appointments cannot be marked as completed."
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
                "doctor_name": current_user.full_name,
                "prescription_notes": payload.prescription_notes,
                "date": str(appt.appointment_date),
            }
        )

    return {"message": "Appointment marked as completed.", "appointment_id": appt.id}


@router.get("/profile")
def get_doctor_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the authenticated doctor's profile (including shift times)."""
    if current_user.role != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Doctor portal only.",
        )

    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "specialization": current_user.specialization,
        "city": current_user.city,
        "address": current_user.address,
        "shift_start": current_user.shift_start or "09:00",
        "shift_end": current_user.shift_end or "17:00",
        "is_verified": current_user.is_verified,
    }


@router.put("/schedule")
def update_doctor_schedule(
    payload: schemas.ScheduleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the authenticated doctor's shift_start and shift_end.

    Validates that:
      - The user is a doctor.
      - shift_start is strictly before shift_end.
    """
    if current_user.role != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Doctor portal only.",
        )

    # Logical validation: start must be before end
    if payload.shift_start >= payload.shift_end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"shift_start ({payload.shift_start}) must be before "
                f"shift_end ({payload.shift_end})."
            ),
        )

    current_user.shift_start = payload.shift_start
    current_user.shift_end = payload.shift_end
    db.commit()
    db.refresh(current_user)

    return {
        "message": "Schedule updated successfully.",
        "shift_start": current_user.shift_start,
        "shift_end": current_user.shift_end,
    }


@router.post("/blocked-dates")
def toggle_blocked_date(
    payload: schemas.BlockedDateToggle,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "doctor":
        raise HTTPException(status_code=403, detail="Doctor portal only.")

    try:
        target_date = date_type.fromisoformat(payload.date)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD."
        )

    if target_date < date_type.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot mark past dates as vacation."
        )

    current_blocked = list(current_user.blocked_dates or [])
    
    # Toggle logic: if date is already in the list, remove it. Otherwise, add it.
    if payload.date in current_blocked:
        current_blocked.remove(payload.date)
        action = "unblocked"
    else:
        current_blocked.append(payload.date)
        action = "blocked"

    # Assign a new list and flag_modified to ensure SQLAlchemy detects the change
    current_user.blocked_dates = current_blocked
    flag_modified(current_user, "blocked_dates")
    db.commit()
    db.refresh(current_user)

    return {"message": f"Date {payload.date} {action} successfully.", "blocked_dates": current_user.blocked_dates}


@router.get("/calendar-summary")
def get_calendar_summary(
    year: int = Query(...),
    month: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns an aggregated view of the doctor's month:
    {
      "booked_counts": { "2026-08-15": 3, "2026-08-16": 1 },
      "blocked_dates": ["2026-08-20"]
    }
    """
    if current_user.role != "doctor":
        raise HTTPException(status_code=403, detail="Doctor portal only.")

    from sqlalchemy import extract

    # Find all appointments for this doctor in this year/month
    appts = db.query(Appointment).filter(
        Appointment.doctor_id == current_user.id,
        extract('year', Appointment.appointment_date) == year,
        extract('month', Appointment.appointment_date) == month
    ).all()

    booked_counts = {}
    for appt in appts:
        if appt.status != 'Cancelled':
            date_str = str(appt.appointment_date)
            booked_counts[date_str] = booked_counts.get(date_str, 0) + 1

    return {
        "booked_counts": booked_counts,
        "blocked_dates": current_user.blocked_dates or []
    }
