import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

import schemas
from auth_utils import (
    create_access_token,
    get_current_patient,
    get_password_hash,
    revoke_tokens,
    verify_password,
)
from database import get_db
from limiter import limiter
from models import AdminUser, Doctor, User
from services.email_service import send_password_reset_code_email, send_password_reset_email
from services.geo import resolve_coords_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def email_is_registered(email: str, db: Session) -> bool:
    """Prevent the same email from being registered in multiple account tables (case-insensitive)."""
    normalized = (email or "").strip().lower()
    return any([
        db.query(User.id).filter(func.lower(User.email) == normalized).first(),
        db.query(Doctor.id).filter(func.lower(Doctor.email) == normalized).first(),
        db.query(AdminUser.id).filter(func.lower(AdminUser.email) == normalized).first(),
    ])


def find_reset_account(email: str, db: Session) -> User | Doctor | AdminUser | None:
    """Return an account only when the email maps to one account type."""
    accounts = [
        db.query(User).filter(User.email == email).first(),
        db.query(Doctor).filter(Doctor.email == email).first(),
        db.query(AdminUser).filter(AdminUser.email == email).first(),
    ]
    matches = [account for account in accounts if account is not None]
    return matches[0] if len(matches) == 1 else None


# ---------------------------------------------------------------------------
# Patient Auth
# ---------------------------------------------------------------------------

@router.post("/patient/signup", status_code=status.HTTP_201_CREATED)
@router.post("/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def patient_signup(request: Request, user: schemas.PatientCreate, db: Session = Depends(get_db)):
    # 1. Check if user already exists
    if email_is_registered(user.email, db):
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

    # `sub` is the account id. `ver` pins the token to the account's current
    # token_version, so bumping that value later invalidates this token.
    token = create_access_token(data={
        "sub": str(user.id),
        "role": "patient",
        "email": user.email,
        "ver": user.token_version or 0,
    })

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
    if email_is_registered(doc.email, db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A doctor account with this email already exists.",
        )

    if db.query(Doctor.id).filter(Doctor.license_number == doc.license_number.strip()).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This license number is already registered.",
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

    token = create_access_token(data={
        "sub": str(doc.id),
        "role": "doctor",
        "email": doc.email,
        "ver": doc.token_version or 0,
    })

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

    token = create_access_token(data={
        "sub": str(admin.id),
        "role": admin.role,
        "email": admin.email,
        "ver": admin.token_version or 0,
    })

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
# Password Reset
# ---------------------------------------------------------------------------

# Failed code guesses tolerated before the stored hash is destroyed,
# forcing the user to request a fresh code.
MAX_CODE_ATTEMPTS = 5
CODE_EXPIRY_MINUTES = 10

# Prefix written into reset_token so a code hash can never be mistaken for
# a link token by the existing /reset-password route (and vice versa).
_CODE_PREFIX = "code:"


def _hash_code(code: str) -> str:
    return _CODE_PREFIX + hashlib.sha256(code.encode()).hexdigest()


def _verify_code(account, code: str) -> bool:
    """Constant-time compare of the submitted code against the stored hash."""
    if not account.reset_token or not account.reset_token.startswith(_CODE_PREFIX):
        return False
    return hmac.compare_digest(account.reset_token, _hash_code(code))


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Issue a reset credential.

    Two modes, because they serve genuinely different situations:
      * link (default) — logged-out users on the login page. A 32-byte
        token_urlsafe value behind a URL, unguessable.
      * code          — users already signed in (Settings). A 6-digit code
        they type in place, so they never leave the app.

    SECURITY NOTE on the code mode: a 6-digit code has 1,000,000 possible
    values, versus the ~256 bits of entropy in the link token. That is a
    real reduction in strength. What covers it:
      - the code is stored as a SHA-256 hash, never in plaintext
      - it expires in 10 minutes (half the link token's 15)
      - /verify-reset-code is rate-limited separately from the request
        endpoint, so guessing is throttled independently of requesting
      - the code is destroyed after MAX_CODE_ATTEMPTS failures, so an
        attacker cannot grind unlimited guesses against a single code
      - failures return one generic message, revealing nothing about
        whether the code was wrong, expired, or already consumed

    The identical response is returned whether or not the account exists,
    so this endpoint cannot be used to enumerate registered emails.
    """
    account = find_reset_account(payload.email, db)

    if payload.mode == "code":
        generic = {"message": "If an account exists, a verification code has been sent."}
        if not account:
            return generic

        code = "".join(secrets.choice("0123456789") for _ in range(6))
        account.reset_token = _hash_code(code)
        account.reset_token_expires = _utcnow() + timedelta(minutes=CODE_EXPIRY_MINUTES)
        # A fresh code restarts the guess budget.
        account.reset_failed_attempts = 0
        db.commit()

        send_password_reset_code_email(payload.email, code)
        return generic

    account_missing_response = {"message": "If an account exists, a password reset link has been sent."}
    if not account:
        return account_missing_response

    reset_token = secrets.token_urlsafe(32)
    account.reset_token = reset_token
    account.reset_token_expires = _utcnow() + timedelta(minutes=15)
    account.reset_failed_attempts = 0
    db.commit()

    send_password_reset_email(payload.email, reset_token)

    return account_missing_response


@router.post("/verify-reset-code")
@limiter.limit("5/minute")
def verify_reset_code(
    request: Request,
    payload: schemas.VerifyResetCodeRequest,
    current_patient: User = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """Complete a password reset using an emailed code (signed-in flow).

    Requires authentication, and the account is taken from the access
    token rather than the request body — a signed-in caller cannot use a
    code issued for someone else's address to reset that other account.
    """
    account = current_patient

    # One generic failure for every cause: wrong code, expired code,
    # already-consumed code, or no code requested at all. Distinguishing
    # them would tell an attacker how close a guess was.
    generic_failure = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="That code is invalid or has expired. Request a new one.",
    )

    if account.reset_token_expires and account.reset_token_expires < _utcnow():
        account.reset_token = None
        account.reset_token_expires = None
        db.commit()
        raise generic_failure

    if not _verify_code(account, payload.code):
        # Burn the code after too many wrong guesses, forcing a re-request
        # so an attacker gets a fresh 10-minute window rather than an
        # unbounded number of attempts against the same code.
        attempts = (account.reset_failed_attempts or 0) + 1
        if attempts >= MAX_CODE_ATTEMPTS:
            account.reset_token = None
            account.reset_token_expires = None
            account.reset_failed_attempts = 0
            logger.info(
                "Reset code for %s invalidated after %d failed attempts",
                account.email, attempts,
            )
        else:
            account.reset_failed_attempts = attempts
        db.commit()
        raise generic_failure

    account.hashed_password = get_password_hash(payload.new_password)
    account.reset_token = None
    account.reset_token_expires = None
    account.reset_failed_attempts = 0
    # Same reasoning as the link-token reset: a reset must end every existing
    # session, including the caller's own.
    revoke_tokens(account)
    db.commit()

    return {
        "message": "Password updated successfully.",
        "detail": "All existing sessions have been signed out. Please log in again.",
    }


@router.post("/reset-password")
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    # This route consumes link tokens only. A code hash also lives in
    # reset_token, so without this guard a leaked code hash could be
    # replayed here as if it were a link token — and would skip the
    # attempt counter entirely.
    if payload.token.startswith(_CODE_PREFIX):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    account = db.query(User).filter(User.reset_token == payload.token).first()
    login_path = "/login"
    if not account:
        account = db.query(Doctor).filter(Doctor.reset_token == payload.token).first()
        login_path = "/doctor/login"
    if not account:
        account = db.query(AdminUser).filter(AdminUser.reset_token == payload.token).first()
        login_path = "/admin/login"

    if not account:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    if account.reset_token_expires and account.reset_token_expires < _utcnow():
        raise HTTPException(status_code=400, detail="Reset token has expired.")

    account.hashed_password = get_password_hash(payload.new_password)
    account.reset_token = None
    account.reset_token_expires = None
    # A password reset is the user's response to a suspected compromise, so
    # every existing session must die. Without this, a stolen token would
    # outlive the reset that was supposed to revoke it.
    revoke_tokens(account)
    db.commit()

    return {
        "message": "Password reset successfully. You can now log in.",
        "login_path": login_path,
    }
