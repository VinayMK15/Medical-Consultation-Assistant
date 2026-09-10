import uuid
from datetime import datetime, timedelta
from typing import Optional, Union

from fastapi import APIRouter, HTTPException, Depends, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from limiter import limiter

import schemas
from database import get_db
from models import User, Doctor, AdminUser
from auth_utils import get_password_hash, create_access_token, verify_password
from services.geo import resolve_coords_sync

router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ---------------------------------------------------------------------------
# Patient Auth
# ---------------------------------------------------------------------------

@router.post("/patient/signup", status_code=status.HTTP_201_CREATED)
@router.post("/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def patient_signup(request: Request, user: schemas.PatientCreate, db: Session = Depends(get_db)):
    # 1. Check if user already exists
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists.",
        )

    # 2. Hash the password
    hashed_pw = get_password_hash(user.password)

    # 3. Resolve coordinates
    lat, lng = resolve_coords_sync(city=user.home_city, address=user.home_address)

    # 4. Save to database
    new_user = User(
        email=user.email,
        hashed_password=hashed_pw,
        full_name=user.full_name,
        age=user.age,
        gender=user.gender,
        phone=user.phone,
        home_city=user.home_city,
        home_address=user.home_address,
        home_lat=lat,
        home_lng=lng,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "Account created successfully.",
        "id": new_user.id,
        "email": new_user.email,
        "role": "patient",
    }


@router.post("/patient/login")
@router.post("/login")
@limiter.limit("10/minute")
def patient_login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Credentials",
        )

    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Credentials",
        )

    token = create_access_token(data={"sub": user.email, "role": "patient", "table": "users"})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.full_name,
            "full_name": user.full_name,
            "email": user.email,
            "role": "patient",
            "age": user.age,
            "gender": user.gender,
            "phone": user.phone,
            "city": user.home_city,
            "address": user.home_address,
            "home_city": user.home_city,
            "home_address": user.home_address,
            "lat": user.home_lat,
            "lng": user.home_lng,
            "home_lat": user.home_lat,
            "home_lng": user.home_lng,
        },
    }


# ---------------------------------------------------------------------------
# Doctor Auth
# ---------------------------------------------------------------------------

@router.post("/doctor/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def doctor_signup(request: Request, doc: schemas.DoctorCreate, db: Session = Depends(get_db)):
    existing = db.query(Doctor).filter(Doctor.email == doc.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A doctor account with this email already exists.",
        )

    hashed_pw = get_password_hash(doc.password)
    lat, lng = resolve_coords_sync(city=doc.practice_city, address=doc.practice_address)

    new_doc = Doctor(
        email=doc.email,
        hashed_password=hashed_pw,
        full_name=doc.full_name,
        specialization=doc.specialization,
        experience_years=doc.experience_years or 0,
        qualifications=doc.qualifications,
        license_number=doc.license_number,
        phone=doc.phone,
        practice_city=doc.practice_city,
        practice_address=doc.practice_address,
        practice_lat=lat,
        practice_lng=lng,
        consultation_fee=doc.consultation_fee or 0.0,
        bio=doc.bio,
        shift_start=doc.shift_start or "09:00",
        shift_end=doc.shift_end or "17:00",
        is_verified=False,
        is_active=True,
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    return {
        "message": "Doctor account created successfully. Your account is pending admin verification.",
        "id": new_doc.id,
        "email": new_doc.email,
        "role": "doctor",
    }


@router.post("/doctor/login")
@limiter.limit("10/minute")
def doctor_login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    doc = db.query(Doctor).filter(Doctor.email == form_data.username).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Credentials",
        )

    if not verify_password(form_data.password, doc.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Credentials",
        )

    if not doc.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending admin verification.",
        )

    if not doc.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor account has been deactivated.",
        )

    token = create_access_token(data={"sub": doc.email, "role": "doctor", "table": "doctors"})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": doc.id,
            "name": doc.full_name,
            "full_name": doc.full_name,
            "email": doc.email,
            "role": "doctor",
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
            "slot_duration_minutes": doc.slot_duration_minutes,
            "blocked_dates": doc.blocked_dates or [],
            "is_verified": doc.is_verified,
            "is_active": doc.is_active,
        },
    }


# ---------------------------------------------------------------------------
# Admin Auth
# ---------------------------------------------------------------------------

@router.post("/admin/login")
@limiter.limit("10/minute")
def admin_login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    admin = db.query(AdminUser).filter(AdminUser.email == form_data.username).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Credentials",
        )

    if not verify_password(form_data.password, admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Credentials",
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is inactive.",
        )

    token = create_access_token(data={"sub": admin.email, "role": admin.role, "table": "admin_users"})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": admin.id,
            "name": admin.full_name,
            "full_name": admin.full_name,
            "email": admin.email,
            "role": admin.role,
            "is_active": admin.is_active,
        },
    }


# ---------------------------------------------------------------------------
# Password Reset (supports User, Doctor, and AdminUser)
# ---------------------------------------------------------------------------

@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    account: Optional[Union[User, Doctor, AdminUser]] = None
    account = db.query(User).filter(User.email == payload.email).first()
    if not account:
        account = db.query(Doctor).filter(Doctor.email == payload.email).first()

    if not account:
        # Generic response to prevent email enumeration
        return {"message": "If an account exists, a password reset link has been generated."}

    reset_token = str(uuid.uuid4())
    account.reset_token = reset_token
    account.reset_token_expires = datetime.utcnow() + timedelta(minutes=15)
    db.commit()

    return {
        "message": "If an account exists, a password reset link has been generated.",
        "reset_token": reset_token,
    }


@router.post("/reset-password")
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    account = db.query(User).filter(User.reset_token == payload.token).first()
    if not account:
        account = db.query(Doctor).filter(Doctor.reset_token == payload.token).first()

    if not account:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    if account.reset_token_expires and account.reset_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset token has expired.")

    account.hashed_password = get_password_hash(payload.new_password)
    account.reset_token = None
    account.reset_token_expires = None
    db.commit()

    return {"message": "Password reset successfully. You can now log in."}
