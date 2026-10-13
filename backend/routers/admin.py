"""
Admin: account listing, creation, update and deletion.

Split out of the original 963-line module. The verification queue and schedule
moved to `admin_doctors.py`; symptom mappings and specializations to
`admin_taxonomy.py`; shared helpers to `admin_common.py`.

Route paths are unchanged -- the frontend calls them literally.

Two behaviours worth knowing when editing here:

- **Email uniqueness is cross-table.** `users`, `doctors` and `admin_users` are
  separate tables with no spanning constraint, so `email_is_registered` does
  that check in application code. Every write path must call it.
- **Deactivation and password resets revoke tokens.** Bumping `token_version`
  invalidates outstanding JWTs immediately, so a deactivated account is logged
  out everywhere rather than merely blocked at its next login.
"""

from __future__ import annotations

from datetime import date as date_type
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth_utils import get_current_admin, get_password_hash, revoke_tokens
from database import get_db
from models import AdminUser, Appointment, Doctor, User
from routers.admin_common import email_is_registered, pick, specialization_exists
from services.geo import resolve_coords_sync

router = APIRouter(prefix="/api/admin", tags=["Admin - Users"])

# ---------------------------------------------------------------------------
# Unified User Listing
# ---------------------------------------------------------------------------

@router.get("/users")
def get_admin_users(
    role: str,
    is_verified: bool | None = None,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if role == "doctor":
        base_q = db.query(Doctor)
        if is_verified is not None:
            base_q = base_q.filter(Doctor.is_verified == is_verified)
        doctors = base_q.order_by(Doctor.id.desc()).offset(skip).limit(limit).all()
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
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
                "role": "doctor",
            }
            for doc in doctors
        ]

    elif role == "patient":
        base_q = db.query(User)
        patients = base_q.order_by(User.id.desc()).offset(skip).limit(limit).all()
        return [
            {
                "id": p.id,
                "email": p.email,
                "full_name": p.full_name,
                "name": p.full_name,
                "age": p.age,
                "gender": p.gender,
                "phone": p.phone,
                "city": p.home_city,
                "address": p.home_address,
                "home_city": p.home_city,
                "home_address": p.home_address,
                "lat": p.home_lat,
                "lng": p.home_lng,
                "home_lat": p.home_lat,
                "home_lng": p.home_lng,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "role": "patient",
            }
            for p in patients
        ]

    elif role in ["admin", "superadmin"]:
        admins = db.query(AdminUser).order_by(AdminUser.id.desc()).offset(skip).limit(limit).all()
        return [
            {
                "id": a.id,
                "email": a.email,
                "full_name": a.full_name,
                "role": a.role,
                "is_active": a.is_active,
            }
            for a in admins
        ]

    return []


# ---------------------------------------------------------------------------
# Drill-Down: Single User Detail + Appointments + Schedule & Vacation
# ---------------------------------------------------------------------------

def _serialize_doctor(doc: Doctor) -> dict[str, Any]:
    """Full doctor record for the admin detail view."""
    return {
        "id": doc.id,
        "email": doc.email,
        "full_name": doc.full_name,
        "name": doc.full_name,
        "role": "doctor",
        "specialization": doc.specialization,
        "experience_years": doc.experience_years or 0,
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
        "consultation_fee": doc.consultation_fee or 0.0,
        "bio": doc.bio,
        "shift_start": doc.shift_start or "09:00",
        "shift_end": doc.shift_end or "17:00",
        "slot_duration_minutes": doc.slot_duration_minutes or 30,
        "blocked_dates": doc.blocked_dates or [],
        "is_verified": doc.is_verified,
        "is_active": doc.is_active,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


def _serialize_patient(p: User) -> dict[str, Any]:
    """Full patient record for the admin detail view."""
    return {
        "id": p.id,
        "email": p.email,
        "full_name": p.full_name,
        "name": p.full_name,
        "role": "patient",
        "age": p.age,
        "gender": p.gender,
        "phone": p.phone,
        "city": p.home_city,
        "address": p.home_address,
        "home_city": p.home_city,
        "home_address": p.home_address,
        "lat": p.home_lat,
        "lng": p.home_lng,
        "home_lat": p.home_lat,
        "home_lng": p.home_lng,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _appointment_counts(query) -> dict[str, int]:
    """
    Tally Pending / Completed / Cancelled for an appointment query.

    Reads the status column only instead of loading whole rows. Any status
    outside the three known values is bucketed as pending so the totals
    always add up to `total`.
    """
    counts = {"total": 0, "pending": 0, "completed": 0, "cancelled": 0}
    for (raw_status,) in query.with_entities(Appointment.status).all():
        counts["total"] += 1
        key = (raw_status or "").strip().lower()
        if key == "completed":
            counts["completed"] += 1
        elif key == "cancelled":
            counts["cancelled"] += 1
        else:
            counts["pending"] += 1
    return counts


def _serialize_appointment(appt: Appointment, doctor: Doctor, patient: User) -> dict[str, Any]:
    """One appointment row, joined with both parties so the admin UI needs no second request."""
    return {
        "id": appt.id,
        "patient_id": appt.patient_id,
        "doctor_id": appt.doctor_id,
        "appointment_date": appt.appointment_date.isoformat() if appt.appointment_date else None,
        "slot_time": appt.slot_time,
        "symptoms_summary": appt.symptoms_summary,
        "status": appt.status,
        "prescription_notes": appt.prescription_notes,
        # Doctor side — always present so one column set serves both views.
        "doctor_name": doctor.full_name if doctor else None,
        "doctor_specialization": doctor.specialization if doctor else None,
        "doctor_phone": doctor.phone if doctor else None,
        "doctor_city": doctor.practice_city if doctor else None,
        # Patient side
        "patient_name": patient.full_name if patient else "Unknown Patient",
        "patient_email": patient.email if patient else None,
        "patient_phone": patient.phone if patient else None,
        "patient_age": patient.age if patient else None,
        "patient_gender": patient.gender if patient else None,
        "patient_city": patient.home_city if patient else None,
    }


def _upcoming_first(appts: list[Appointment]) -> list[Appointment]:
    """
    Order for the detail views: today-and-future ascending (soonest first),
    then past descending (most recent first). A flat date sort buries the next
    consultation at the bottom of a long history, which is the row an admin
    actually opened the page for.
    """
    today = date_type.today()

    def key(appt: Appointment):
        d = appt.appointment_date
        minutes = 0
        try:
            hh, mm = str(appt.slot_time or "00:00").split(":")
            minutes = int(hh) * 60 + int(mm)
        except (ValueError, TypeError):
            pass
        # 0 sorts before 1, so future dates come first; within each group the
        # sign flip on date/minutes flips ascending into descending.
        if d and d >= today:
            return (0, d.toordinal(), minutes)
        return (1, -(d.toordinal() if d else 0), -minutes)

    return sorted(appts, key=key)


@router.get("/users/{user_id}")
def admin_get_user(
    user_id: int,
    role: Literal["doctor", "patient"] = Query(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Full profile for one doctor or patient, with their appointment tally."""
    if role == "doctor":
        doc = db.query(Doctor).filter(Doctor.id == user_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Doctor not found.")
        payload = _serialize_doctor(doc)
        payload["appointment_stats"] = _appointment_counts(
            db.query(Appointment).filter(Appointment.doctor_id == user_id)
        )
        return payload

    patient = db.query(User).filter(User.id == user_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
    payload = _serialize_patient(patient)
    payload["appointment_stats"] = _appointment_counts(
        db.query(Appointment).filter(Appointment.patient_id == user_id)
    )
    return payload


@router.get("/users/{user_id}/appointments")
def admin_get_user_appointments(
    user_id: int,
    role: Literal["doctor", "patient"] = Query(...),
    status_filter: str | None = Query(None, alias="status", description="pending | completed | cancelled"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Max records to return"),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Every appointment belonging to one user, joined with both the doctor and
    the patient so the admin UI can render a full table from a single call.
    """
    column = Appointment.doctor_id if role == "doctor" else Appointment.patient_id

    base = db.query(Appointment, Doctor, User).join(
        Doctor, Appointment.doctor_id == Doctor.id
    ).join(
        User, Appointment.patient_id == User.id
    ).filter(
        column == user_id
    )

    counts = _appointment_counts(db.query(Appointment).filter(column == user_id))

    # Counts must describe the whole history, not the filtered page, so they
    # are computed before the status filter is applied.
    if status_filter:
        needle = status_filter.strip().lower()
        if needle == "pending":
            base = base.filter(func.lower(Appointment.status) != "completed", func.lower(Appointment.status) != "cancelled")
        elif needle in ("completed", "cancelled"):
            base = base.filter(func.lower(Appointment.status) == needle)
        else:
            raise HTTPException(
                status_code=400,
                detail="status must be one of: pending, completed, cancelled.",
            )

    total = base.count()
    rows = base.all()

    # `rows` are (Appointment, Doctor, User) tuples; sort by the appointment.
    appts = _upcoming_first([r[0] for r in rows])
    page = appts[skip: skip + limit]

    by_id = {r[0].id: (r[1], r[2]) for r in rows}
    return {
        "data": [_serialize_appointment(a, *by_id[a.id]) for a in page],
        "total": total,
        "skip": skip,
        "limit": limit,
        "counts": counts,
    }


@router.post("/users", status_code=status.HTTP_201_CREATED)
def admin_create_user(
    payload: dict[str, Any],
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    role = payload.get("role", "patient")
    email = payload.get("email")
    password = payload.get("password")
    full_name = payload.get("full_name")

    if not email or not password or not full_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="email, password, and full_name are required.",
        )

    hashed_pw = get_password_hash(password)

    if role == "doctor":
        if email_is_registered(email, db):
            raise HTTPException(status_code=400, detail="An account with this email already exists.")

        for field in ("phone", "qualifications", "license_number"):
            if not payload.get(field) or not str(payload.get(field)).strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{field} is required for doctor accounts.",
                )
        if db.query(Doctor.id).filter(Doctor.license_number == str(payload.get("license_number")).strip()).first():
            raise HTTPException(status_code=400, detail="This license number is already registered.")

        city = pick(payload, "practice_city", "city")
        address = pick(payload, "practice_address", "address")
        if not city or not str(city).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="practice_city is required for doctor accounts.",
            )
        if not address or not str(address).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="practice_address is required for doctor accounts.",
            )
        lat, lng = resolve_coords_sync(city=city, address=address)

        specialization = payload.get("specialization", "General Physician")
        if not specialization_exists(specialization, db):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Unknown specialization: {specialization!r}. "
                    "It must match a row in the specializations table."
                ),
            )

        new_doc = Doctor(
            email=email,
            hashed_password=hashed_pw,
            full_name=full_name,
            specialization=specialization,
            experience_years=payload.get("experience_years", 0),
            qualifications=payload.get("qualifications"),
            license_number=payload.get("license_number"),
            phone=payload.get("phone"),
            practice_city=city,
            practice_address=address,
            practice_lat=lat,
            practice_lng=lng,
            consultation_fee=payload.get("consultation_fee", 0.0),
            bio=payload.get("bio"),
            shift_start=payload.get("shift_start", "09:00"),
            shift_end=payload.get("shift_end", "17:00"),
            is_verified=True,  # Admin-created doctors are auto-verified
            is_active=True,
        )

        # Cross-field shift validation
        s_start = payload.get("shift_start", "09:00")
        s_end = payload.get("shift_end", "17:00")
        if s_start and s_end and s_start >= s_end:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"shift_start ({s_start}) must be "
                    f"strictly before shift_end ({s_end})."
                ),
            )

        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        return {
            "id": new_doc.id,
            "email": new_doc.email,
            "full_name": new_doc.full_name,
            "role": "doctor",
            "is_verified": new_doc.is_verified,
        }

    elif role == "patient":
        if email_is_registered(email, db):
            raise HTTPException(status_code=400, detail="An account with this email already exists.")

        city = pick(payload, "home_city", "city")
        address = pick(payload, "home_address", "address")
        lat, lng = resolve_coords_sync(city=city, address=address)

        new_user = User(
            email=email,
            hashed_password=hashed_pw,
            full_name=full_name,
            age=payload.get("age"),
            gender=payload.get("gender"),
            phone=payload.get("phone"),
            home_city=city,
            home_address=address,
            home_lat=lat,
            home_lng=lng,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return {
            "id": new_user.id,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": "patient",
        }

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported role '{role}'.")


@router.put("/users/{user_id}")
def admin_update_user(
    user_id: int,
    payload: dict[str, Any],
    role: Literal["doctor", "patient"] = Query(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    target_role = role or payload.get("role")

    if target_role == "doctor":
        doc = db.query(Doctor).filter(Doctor.id == user_id).first()
        if doc:
            if "email" in payload and payload["email"]:
                if email_is_registered(payload["email"], db, exclude_role="doctor", exclude_id=doc.id):
                    raise HTTPException(status_code=400, detail="An account with this email already exists.")
                doc.email = payload["email"]
            if "password" in payload and payload["password"]:
                doc.hashed_password = get_password_hash(payload["password"])
                revoke_tokens(doc)
            if "full_name" in payload and payload["full_name"] is not None:
                doc.full_name = payload["full_name"]
            if "specialization" in payload and payload["specialization"] is not None:
                new_specialization = payload["specialization"]
                if not specialization_exists(new_specialization, db):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Unknown specialization: {new_specialization!r}. "
                            "It must match a row in the specializations table."
                        ),
                    )
                doc.specialization = new_specialization
            if "experience_years" in payload and payload["experience_years"] is not None:
                doc.experience_years = payload["experience_years"]
            if "qualifications" in payload:
                doc.qualifications = payload["qualifications"]
            if "license_number" in payload:
                doc.license_number = payload["license_number"]
            if "phone" in payload:
                doc.phone = payload["phone"]
            if "practice_city" in payload or "city" in payload:
                doc.practice_city = pick(payload, "practice_city", "city")
            if "practice_address" in payload or "address" in payload:
                doc.practice_address = pick(payload, "practice_address", "address")
            if "is_verified" in payload and payload["is_verified"] is not None:
                doc.is_verified = payload["is_verified"]
            if "is_active" in payload and payload["is_active"] is not None:
                was_active = doc.is_active
                doc.is_active = payload["is_active"]
                # Revoking access must end existing sessions, not merely block
                # the next login. Bumping the token version invalidates every
                # token already in the wild.
                if was_active and not doc.is_active:
                    revoke_tokens(doc)
            if "shift_start" in payload and payload["shift_start"]:
                doc.shift_start = payload["shift_start"]
            if "shift_end" in payload and payload["shift_end"]:
                doc.shift_end = payload["shift_end"]

            # Cross-field shift validation on update
            updated_start = payload.get("shift_start") or doc.shift_start or "09:00"
            updated_end   = payload.get("shift_end")   or doc.shift_end   or "17:00"
            if updated_start >= updated_end:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"shift_start ({updated_start}) must be "
                        f"strictly before shift_end ({updated_end})."
                    ),
                )

            db.commit()
            db.refresh(doc)
            return {
                "id": doc.id,
                "email": doc.email,
                "full_name": doc.full_name,
                "role": "doctor",
                "is_verified": doc.is_verified,
            }

    if target_role == "patient":
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            if "email" in payload and payload["email"]:
                if email_is_registered(payload["email"], db, exclude_role="patient", exclude_id=user.id):
                    raise HTTPException(status_code=400, detail="An account with this email already exists.")
                user.email = payload["email"]
            if "password" in payload and payload["password"]:
                user.hashed_password = get_password_hash(payload["password"])
                # An admin-set password is a reset in every sense that matters
                # to the holder's security.
                revoke_tokens(user)
            if "full_name" in payload and payload["full_name"] is not None:
                user.full_name = payload["full_name"]
            if "age" in payload:
                user.age = payload["age"]
            if "gender" in payload:
                user.gender = payload["gender"]
            if "phone" in payload:
                user.phone = payload["phone"]
            if "home_city" in payload or "city" in payload:
                user.home_city = pick(payload, "home_city", "city")
            if "home_address" in payload or "address" in payload:
                user.home_address = pick(payload, "home_address", "address")

            db.commit()
            db.refresh(user)
            return {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": "patient",
            }

    raise HTTPException(status_code=404, detail="User not found.")


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    role: Literal["doctor", "patient"] = Query(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if role == "doctor":
        doc = db.query(Doctor).filter(Doctor.id == user_id).first()
        if doc:
            db.query(Appointment).filter(Appointment.doctor_id == user_id).delete(synchronize_session=False)
            db.delete(doc)
            db.commit()
            return {"message": f"Doctor '{doc.full_name}' was successfully deleted.", "user_id": user_id}

    if role == "patient":
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            db.query(Appointment).filter(Appointment.patient_id == user_id).delete(synchronize_session=False)
            db.delete(user)
            db.commit()
            return {"message": f"Patient '{user.full_name}' was successfully deleted.", "user_id": user_id}

    raise HTTPException(status_code=404, detail="User not found.")
