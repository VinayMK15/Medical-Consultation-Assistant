"""
Admin: doctor verification, doctor schedule, doctor calendar, platform stats.

Split out of the 963-line `admin.py`. Route paths are unchanged from the
original single module -- the frontend calls them literally
(`/api/admin/approve-doctor/{id}`, `/api/admin/doctors/{id}/schedule`), so
this is a code-organisation change only.
"""

from __future__ import annotations

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from auth_utils import get_current_admin
from database import get_db
from models import AdminUser, Appointment, Doctor, User

router = APIRouter(prefix="/api/admin", tags=["Admin - Doctors"])


# ---------------------------------------------------------------------------
# Verification queue
# ---------------------------------------------------------------------------
@router.get("/pending-doctors")
def get_pending_doctors(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Doctors awaiting verification.

    Returns a bare list rather than the paginated envelope the other admin
    routes use. A pre-existing inconsistency, noted in the original code and
    left alone here: the frontend distinguishes a full page from a truncated
    one by its own `limit`, so changing the shape would break it.
    """
    base_q = db.query(Doctor).filter(Doctor.is_verified == False)  # noqa: E712
    doctors = base_q.offset(skip).limit(limit).all()

    return [
        {
            "id": doc.id,
            "email": doc.email,
            "full_name": doc.full_name,
            "name": doc.full_name,
            "specialization": doc.specialization,
            "experience_years": doc.experience_years,
            "qualifications": doc.qualifications,
            "license_number": doc.license_number,
            "phone": doc.phone,
            "city": doc.practice_city,
            "address": doc.practice_address,
            "practice_city": doc.practice_city,
            "practice_address": doc.practice_address,
            "lat": doc.practice_lat,
            "lng": doc.practice_lng,
            "practice_lat": doc.practice_lat,
            "practice_lng": doc.practice_lng,
            "consultation_fee": doc.consultation_fee,
            "bio": doc.bio,
            "shift_start": doc.shift_start,
            "shift_end": doc.shift_end,
            "is_verified": doc.is_verified,
            "is_active": doc.is_active,
            "role": "doctor",
        }
        for doc in doctors
    ]


@router.delete("/reject-doctor/{doctor_id}")
def reject_doctor(
    doctor_id: int,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Remove a doctor and their appointments.

    Appointments are deleted explicitly rather than cascading: the
    `appointments` foreign keys carry no ON DELETE action, so removing the
    doctor first would raise a constraint error and leave both rows in place.
    """
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    db.query(Appointment).filter(Appointment.doctor_id == doctor_id).delete(
        synchronize_session=False
    )
    db.delete(doctor)
    db.commit()

    return {
        "message": f"Doctor '{doctor.full_name}' has been rejected and removed.",
        "doctor_id": doctor_id,
    }


@router.put("/approve-doctor/{doctor_id}")
def approve_doctor(
    doctor_id: int,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Set `is_verified=True` on a doctor, which is what enables their login."""
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    doctor.is_verified = True
    db.commit()
    db.refresh(doctor)

    return {
        "message": f"Doctor '{doctor.full_name}' approved successfully.",
        "doctor_id": doctor.id,
        "is_verified": doctor.is_verified,
    }


# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------
@router.get("/doctors/{doctor_id}/schedule")
def admin_get_doctor_schedule(
    doctor_id: int,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    A doctor's shift window, blocked dates, and appointment counts.

    Backs the admin calendar view, which shows the same schedule data the
    doctor's own dashboard shows plus the dates they marked unavailable.
    """
    doc = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    # `blocked_dates` is a JSON column typed as Column[Any]; at runtime it holds
    # a list of ISO date strings. Narrow it before iterating.
    blocked = sorted({d for d in list(doc.blocked_dates or []) if d})

    today = date_type.today()
    today_key = today.isoformat()

    today_rows = db.query(Appointment).filter(
        Appointment.doctor_id == doc.id,
        Appointment.appointment_date == today_key,
    ).all()

    upcoming = (
        db.query(Appointment)
        .filter(
            Appointment.doctor_id == doc.id,
            Appointment.appointment_date > today_key,
        )
        .order_by(Appointment.appointment_date, Appointment.slot_time)
        .all()
    )

    def summarise(rows):
        return {
            "total": len(rows),
            "pending": sum(1 for a in rows if a.status == "Pending"),
            "completed": sum(1 for a in rows if a.status == "Completed"),
            "cancelled": sum(1 for a in rows if a.status == "Cancelled"),
        }

    return {
        "doctor_id": doc.id,
        "doctor_name": doc.full_name,
        "specialization": doc.specialization,
        "shift_start": doc.shift_start,
        "shift_end": doc.shift_end,
        "slot_duration_minutes": doc.slot_duration_minutes,
        "blocked_dates": blocked,
        "today": summarise(today_rows),
        "upcoming_total": len(upcoming),
        "upcoming": [
            {
                "id": a.id,
                "appointment_date": a.appointment_date.isoformat(),
                "slot_time": a.slot_time,
                "status": a.status,
            }
            for a in upcoming
        ],
    }


@router.put("/doctors/{doctor_id}/schedule")
def admin_update_doctor_schedule(
    doctor_id: int,
    payload: dict,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Update a doctor's shift window and slot granularity.

    Admins can edit any doctor's schedule, which doctors cannot do for
    themselves. Useful for head-office overrides and for repairing a shift
    that would otherwise permit bookings outside working hours.
    """
    doc = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    shift_start = str(payload.get("shift_start") or doc.shift_start or "09:00")
    shift_end = str(payload.get("shift_end") or doc.shift_end or "17:00")

    if shift_start >= shift_end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"shift_start ({shift_start}) must be strictly before "
                f"shift_end ({shift_end})."
            ),
        )

    slot_minutes = payload.get("slot_duration_minutes")
    if slot_minutes is not None:
        try:
            slot_minutes = int(slot_minutes)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail="slot_duration_minutes must be a number.",
            ) from None
        if slot_minutes not in (15, 20, 30, 45, 60):
            raise HTTPException(
                status_code=400,
                detail="slot_duration_minutes must be one of: 15, 20, 30, 45, 60.",
            )
        doc.slot_duration_minutes = slot_minutes

    doc.shift_start = shift_start
    doc.shift_end = shift_end

    db.commit()
    db.refresh(doc)

    return {
        "message": "Schedule updated successfully.",
        "doctor_id": doc.id,
        "shift_start": doc.shift_start,
        "shift_end": doc.shift_end,
        "slot_duration_minutes": doc.slot_duration_minutes,
    }


@router.get("/doctors/{doctor_id}/calendar-summary")
def admin_get_doctor_calendar(
    doctor_id: int,
    year: int | None = Query(None, description="Defaults to the current year"),
    month: int | None = Query(None, ge=1, le=12),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Per-day appointment counts for a doctor, for the admin calendar view.

    Defaults to the current month. Keyed by ISO date so the client indexes
    directly rather than scanning.

    The date filter is a range rather than `extract('year', ...)` and
    `extract('month', ...)`: the function form cannot use an index, whereas
    `ix_appointments_doctor_date` serves this query directly.
    """
    doc = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    now = date_type.today()
    year = year or now.year
    month = month or now.month

    if not 1 <= month <= 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="month must be between 1 and 12.",
        )

    first = date_type(year, month, 1)
    last = date_type(year + (month == 12), (month % 12) + 1, 1)

    rows = db.query(Appointment).filter(
        Appointment.doctor_id == doc.id,
        Appointment.appointment_date >= first.isoformat(),
        Appointment.appointment_date < last.isoformat(),
    ).all()

    counts: dict[str, int] = {}
    for appt in rows:
        if appt.status == "Cancelled":
            continue
        counts[str(appt.appointment_date)] = counts.get(str(appt.appointment_date), 0) + 1

    return {
        "doctor_id": doc.id,
        "year": year,
        "month": month,
        "total": sum(counts.values()),
        "booked_by_date": counts,
    }


# ---------------------------------------------------------------------------
# Platform stats
# ---------------------------------------------------------------------------
@router.get("/stats")
def get_admin_stats(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Headline counts for the admin dashboard."""
    pending_count = db.query(Doctor).filter(Doctor.is_verified == False).count()  # noqa: E712
    active_count = db.query(Doctor).filter(Doctor.is_verified == True).count()  # noqa: E712
    patient_count = db.query(User).count()

    return {
        "pending_doctors": pending_count,
        "active_doctors": active_count,
        "total_patients": patient_count,
    }
