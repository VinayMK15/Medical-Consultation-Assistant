import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from limiter import limiter

import schemas
from database import get_db
from models import User
from auth_utils import get_password_hash, create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Use the shared limiter instance



@router.post("/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def signup(request: Request, user: schemas.UserCreate, db: Session = Depends(get_db)):
    # 1. Check if user already exists
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists.",
        )

    # 2. Hash the password
    hashed_pw = get_password_hash(user.password)

    # 3. Save to database
    new_user = User(
        email=user.email,
        hashed_password=hashed_pw,
        full_name=user.full_name,
        age=user.age,
        gender=user.gender,
        role=user.role,
        specialization=user.specialization,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "Account created successfully.",
        "id": new_user.id,
        "email": new_user.email
    }


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # 1. Check user exists
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Credentials",
        )

    # 2. Verify password
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Credentials",
        )

    # 3. Check verification status for doctors
    if user.role == "doctor" and not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending admin verification.",
        )

    # 4. Create access token
    token = create_access_token(data={"sub": user.email})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "name": user.full_name,
            "email": user.email,
            "role": user.role,
            "is_verified": user.is_verified,
        }
    }


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        # Prevent email enumeration by returning a generic success message
        return {"message": "If an account exists, a password reset link has been generated."}

    # Generate token and expiry
    reset_token = str(uuid.uuid4())
    user.reset_token = reset_token
    user.reset_token_expires = datetime.utcnow() + timedelta(minutes=15)
    db.commit()

    # For demo purposes, we return the token so the frontend can auto-redirect
    return {
        "message": "If an account exists, a password reset link has been generated.",
        "reset_token": reset_token
    }


@router.post("/reset-password")
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == payload.token).first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    if user.reset_token_expires and user.reset_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset token has expired.")

    # Update password and clear token
    user.hashed_password = get_password_hash(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return {"message": "Password reset successfully. You can now log in."}
