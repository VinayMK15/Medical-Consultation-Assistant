from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session

import schemas
from database import get_db
from models import User, Appointment
from auth_utils import get_current_user, get_password_hash

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def _require_admin(current_user: User):
    """Shared admin role check."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Admin portal only."
        )


@router.get("/pending-doctors", response_model=list[schemas.UserResponse])
def get_pending_doctors(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _require_admin(current_user)
    base_q = db.query(User).filter(
        User.role == "doctor",
        User.is_verified == False
    )
    total = base_q.count()
    data = base_q.offset(skip).limit(limit).all()
    return data


@router.delete("/reject-doctor/{doctor_id}")
def reject_doctor(
    doctor_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _require_admin(current_user)

    doctor = db.query(User).filter(User.id == doctor_id, User.role == "doctor").first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found."
        )

    db.delete(doctor)
    db.commit()

    return {"message": f"Doctor '{doctor.full_name}' has been rejected and removed.", "doctor_id": doctor_id}


@router.get("/users", response_model=list[schemas.UserResponse])
def get_admin_users(
    role: str,
    is_verified: Optional[bool] = None,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Unified endpoint for the Admin Dashboard.

    Examples:
      GET /api/admin/users?role=doctor&is_verified=false  → pending doctors
      GET /api/admin/users?role=doctor&is_verified=true   → active doctors
      GET /api/admin/users?role=patient                   → all patients
    """
    _require_admin(current_user)

    base_q = db.query(User).filter(User.role == role)
    if is_verified is not None:
        base_q = base_q.filter(User.is_verified == is_verified)

    total = base_q.count()
    data = base_q.order_by(User.id.desc()).offset(skip).limit(limit).all()
    return data


@router.put("/approve-doctor/{user_id}")
def approve_doctor(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """PUT alias for approving a doctor — sets is_verified=True."""
    _require_admin(current_user)

    doctor = db.query(User).filter(User.id == user_id, User.role == "doctor").first()
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


@router.get("/stats")
def get_admin_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns platform-wide counts for the Admin Dashboard stat cards."""
    _require_admin(current_user)

    pending_count = db.query(User).filter(User.role == "doctor", User.is_verified == False).count()
    active_count  = db.query(User).filter(User.role == "doctor", User.is_verified == True).count()
    patient_count = db.query(User).filter(User.role == "patient").count()

    return {
        "pending_doctors": pending_count,
        "active_doctors":  active_count,
        "total_patients":  patient_count,
    }


@router.post("/users", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    payload: schemas.AdminUserCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _require_admin(current_user)

    # Check email exists
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists."
        )

    # Manual creation by admin: doctors are auto-verified
    is_verified = True if payload.role == "doctor" else False

    new_user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        age=payload.age,
        gender=payload.gender,
        specialization=payload.specialization,
        city=payload.city,
        address=payload.address,
        is_verified=is_verified,
        shift_start=payload.shift_start,
        shift_end=payload.shift_end,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.put("/users/{user_id}", response_model=schemas.UserResponse)
def admin_update_user(
    user_id: int,
    payload: schemas.AdminUserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _require_admin(current_user)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )

    # Update fields if provided
    if payload.email is not None:
        # Check for duplicate email
        duplicate = db.query(User).filter(User.email == payload.email, User.id != user_id).first()
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already taken by another user."
            )
        user.email = payload.email

    if payload.password is not None and payload.password != "":
        user.hashed_password = get_password_hash(payload.password)

    if payload.full_name is not None:     user.full_name = payload.full_name
    if payload.age is not None:           user.age = payload.age
    if payload.gender is not None:        user.gender = payload.gender
    if payload.specialization is not None: user.specialization = payload.specialization
    if payload.city is not None:          user.city = payload.city
    if payload.address is not None:       user.address = payload.address
    if payload.is_verified is not None:   user.is_verified = payload.is_verified
    if payload.shift_start is not None:   user.shift_start = payload.shift_start
    if payload.shift_end is not None:     user.shift_end = payload.shift_end

    db.commit()
    db.refresh(user)

    return user


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _require_admin(current_user)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )

    # Also delete associated appointments to prevent foreign key errors
    db.query(Appointment).filter(
        (Appointment.patient_id == user_id) | (Appointment.doctor_id == user_id)
    ).delete(synchronize_session=False)

    db.delete(user)
    db.commit()

    return {"message": f"User '{user.full_name}' was successfully deleted.", "user_id": user_id}
