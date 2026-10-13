import logging
from datetime import date as date_type

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import schemas
from auth_utils import get_current_patient, get_current_user
from database import begin_immediate, get_db
from models import Appointment, Doctor, User
from services.email_service import send_booking_confirmation, send_cancellation_notice
from utils import generate_time_slots

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/appointments", tags=["Appointments"])


@router.get("/available-slots")
def get_available_slots(
    doctor_id: int = Query(..., description="ID of the doctor"),
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return all un-booked 30-minute slots for the given doctor on the given date.
    """
    # 1. Validate doctor
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    shift_start = doctor.shift_start or "09:00"
    shift_end = doctor.shift_end or "17:00"

    # 2. Parse the requested date
    try:
        requested_date = date_type.fromisoformat(date)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD.",
        ) from None

    # 3. Check for vacations/blocked dates
    if doctor.blocked_dates and date in doctor.blocked_dates:
        return {
            "doctor_id": doctor_id,
            "doctor_name": doctor.full_name,
            "date": date,
            "shift_start": shift_start,
            "shift_end": shift_end,
            "all_slots": [],
            "available_slots": [],
            "booked_slots_list": [],
            "total_slots": 0,
            "booked_slots": 0,
            "message": f"Dr. {doctor.full_name} is on vacation on this date.",
        }

    # 4. Generate all possible slots
    try:
        total_slots = generate_time_slots(shift_start, shift_end, interval_minutes=doctor.slot_duration_minutes or 30)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot generate slots: {exc}",
        ) from exc

    # 5. Query already-booked slots for this doctor + date
    booked_appointments = (
        db.query(Appointment)
        .filter(
            Appointment.doctor_id == doctor_id,
            Appointment.appointment_date == requested_date,
            Appointment.status != "Cancelled",
        )
        .all()
    )
    booked_slots = {appt.slot_time for appt in booked_appointments}

    # Also subtract slots where the current patient already has an appointment
    if current_user and getattr(current_user, "id", None) and isinstance(current_user, User):
        patient_appointments = (
            db.query(Appointment)
            .filter(
                Appointment.patient_id == current_user.id,
                Appointment.appointment_date == requested_date,
                Appointment.status != "Cancelled",
            )
            .all()
        )
        booked_slots.update({appt.slot_time for appt in patient_appointments})

    available_slots = sorted(set(total_slots) - booked_slots)
    booked_slots_list = sorted(booked_slots)

    return {
        "doctor_id": doctor_id,
        "doctor_name": doctor.full_name,
        "date": date,
        "shift_start": shift_start,
        "shift_end": shift_end,
        "all_slots": total_slots,
        "available_slots": available_slots,
        "booked_slots_list": booked_slots_list,
        "total_slots": len(total_slots),
        "booked_slots": len(booked_slots),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_appointment(
    appointment: schemas.AppointmentCreate,
    background_tasks: BackgroundTasks,
    current_patient: User = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    # Everything below reads and then writes, so the write lock is taken up
    # front rather than upgraded mid-transaction. Two concurrent bookings for
    # the same slot would otherwise both pass the double-booking guards below
    # and collide at COMMIT, where SQLite has no way to resolve them: one gets
    # SQLITE_BUSY and, with a deferred transaction, a deadlock rather than a
    # clean wait. Here the loser waits on busy_timeout and then either sees the
    # committed row or hits the partial unique index and returns 409.
    begin_immediate(db)

    # Validate doctor exists, is verified, and is active
    doctor = db.query(Doctor).filter(Doctor.id == appointment.doctor_id).first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )
    if not doctor.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This doctor is not yet verified and cannot accept appointments.",
        )
    if not doctor.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This doctor is currently inactive.",
        )

    # Reject past dates
    if appointment.appointment_date < date_type.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot book appointments in the past.",
        )

    # Check if Doctor is on Vacation
    if doctor.blocked_dates and appointment.appointment_date.isoformat() in doctor.blocked_dates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dr. {doctor.full_name} is on vacation on {appointment.appointment_date} and cannot accept appointments.",
        )

    # Validate slot falls within doctor's shift window
    shift_start = doctor.shift_start or "09:00"
    shift_end = doctor.shift_end or "17:00"
    if appointment.slot_time < shift_start or appointment.slot_time >= shift_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Slot {appointment.slot_time} is outside this doctor's "
                f"shift hours ({shift_start}–{shift_end})."
            ),
        )

    # Double-booking guard for Doctor
    existing_doctor_appt = (
        db.query(Appointment)
        .filter(
            Appointment.doctor_id == appointment.doctor_id,
            Appointment.appointment_date == appointment.appointment_date,
            Appointment.slot_time == appointment.slot_time,
            Appointment.status != "Cancelled",
        )
        .first()
    )
    if existing_doctor_appt:
        logger.warning(
            "Booking rejected (doctor-taken): patient_id=%s doctor_id=%s date=%s slot=%s",
            current_patient.id, appointment.doctor_id,
            appointment.appointment_date, appointment.slot_time,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"The slot {appointment.slot_time} on "
                f"{appointment.appointment_date} is already booked "
                f"for this doctor."
            ),
        )

    # Double-booking guard for Patient
    existing_patient_appt = (
        db.query(Appointment)
        .filter(
            Appointment.patient_id == current_patient.id,
            Appointment.appointment_date == appointment.appointment_date,
            Appointment.slot_time == appointment.slot_time,
            Appointment.status != "Cancelled",
        )
        .first()
    )
    if existing_patient_appt:
        logger.warning(
            "Booking rejected (patient-taken): patient_id=%s doctor_id=%s date=%s slot=%s",
            current_patient.id, appointment.doctor_id,
            appointment.appointment_date, appointment.slot_time,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"You already have an appointment booked at "
                f"{appointment.slot_time} on {appointment.appointment_date}."
            ),
        )

    new_appointment = Appointment(
        patient_id=current_patient.id,
        doctor_id=appointment.doctor_id,
        appointment_date=appointment.appointment_date,
        slot_time=appointment.slot_time,
        symptoms_summary=appointment.symptoms_summary,
        status="Pending",
    )

    try:
        db.add(new_appointment)
        db.commit()
        db.refresh(new_appointment)
    except IntegrityError:
        db.rollback()
        logger.warning(
            "Booking race (unique-violation at commit): patient_id=%s doctor_id=%s date=%s slot=%s",
            current_patient.id, appointment.doctor_id,
            appointment.appointment_date, appointment.slot_time,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"The slot {appointment.slot_time} on "
                f"{appointment.appointment_date} was just booked "
                f"by another request. Please select a different slot."
            ),
        ) from None

    # Fire background email task
    background_tasks.add_task(
        send_booking_confirmation,
        patient_email=current_patient.email,
        doctor_email=doctor.email,
        details={
            "patient_name": current_patient.full_name,
            "doctor_name": doctor.full_name,
            "specialty": doctor.specialization,
            "date": str(appointment.appointment_date),
            "time": appointment.slot_time,
            "practice_address": doctor.practice_address,
            "practice_lat": doctor.practice_lat,
            "practice_lng": doctor.practice_lng,
        },
    )

    return new_appointment


@router.patch("/{appointment_id}/cancel")
def cancel_appointment(
    appointment_id: int,
    background_tasks: BackgroundTasks,
    current_patient: User = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    # Read-then-write, same as booking: the status check decides whether this
    # row may change, so the lock is taken before the check rather than after.
    begin_immediate(db)

    appt = db.query(Appointment).filter(
        Appointment.id == appointment_id,
        Appointment.patient_id == current_patient.id,
    ).first()

    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    if appt.status.lower() != "pending":
        raise HTTPException(status_code=400, detail="Only pending appointments can be cancelled.")

    appt.status = "Cancelled"
    db.commit()

    doctor = db.query(Doctor).filter(Doctor.id == appt.doctor_id).first()
    if doctor:
        background_tasks.add_task(
            send_cancellation_notice,
            patient_email=current_patient.email,
            doctor_email=doctor.email,
            details={
                "patient_name": current_patient.full_name,
                "doctor_name": doctor.full_name,
                "date": str(appt.appointment_date),
                "time": appt.slot_time,
            },
        )

    return {"message": "Appointment cancelled successfully."}
