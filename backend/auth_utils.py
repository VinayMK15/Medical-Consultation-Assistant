import os
from dotenv import load_dotenv
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db

# Load variables from backend/.env (silently a no-op if file is missing)
load_dotenv()

_RAW_SECRET = os.getenv("SECRET_KEY", "")
if not _RAW_SECRET or _RAW_SECRET.startswith("change-me"):
    import warnings
    import secrets
    warnings.warn(
        "SECRET_KEY is not set or is still the placeholder value. "
        "Set a strong random key in backend/.env before deploying.",
        stacklevel=1,
    )
    _RAW_SECRET = secrets.token_hex(32)

SECRET_KEY = _RAW_SECRET
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    """
    Creates a JWT access token.
    Payload typically contains: {"sub": email, "role": role, "table": table_name}
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/patient/login")


def _decode_token(token: str) -> Dict[str, Any]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: Optional[str] = payload.get("sub")
        if email is None:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception


def get_current_patient(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Dependency that ensures the authenticated user is a patient."""
    payload = _decode_token(token)
    email: str = payload.get("sub")
    role: Optional[str] = payload.get("role")

    from models import User
    user = db.query(User).filter(User.email == email).first()
    if user is None or (role and role != "patient"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid patient credentials or account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_doctor(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Dependency that ensures the authenticated user is a doctor."""
    payload = _decode_token(token)
    email: str = payload.get("sub")
    role: Optional[str] = payload.get("role")

    from models import Doctor
    doctor = db.query(Doctor).filter(Doctor.email == email).first()
    if doctor is None or (role and role != "doctor"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid doctor credentials or account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not doctor.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor account has been deactivated.",
        )
    return doctor


def get_current_admin(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Dependency that ensures the authenticated user is an admin."""
    payload = _decode_token(token)
    email: str = payload.get("sub")
    role: Optional[str] = payload.get("role")

    from models import AdminUser
    admin = db.query(AdminUser).filter(AdminUser.email == email).first()
    if admin is None or (role and role not in ["admin", "superadmin"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials or account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is inactive.",
        )
    return admin


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    General fallback dependency: resolves token to Patient, Doctor, or AdminUser.
    Used for general endpoints like /process.
    """
    payload = _decode_token(token)
    email: str = payload.get("sub")
    role: Optional[str] = payload.get("role")

    from models import User, Doctor, AdminUser

    if role == "doctor":
        doc = db.query(Doctor).filter(Doctor.email == email).first()
        if doc:
            return doc
    elif role in ["admin", "superadmin"]:
        adm = db.query(AdminUser).filter(AdminUser.email == email).first()
        if adm:
            return adm
    elif role == "patient":
        usr = db.query(User).filter(User.email == email).first()
        if usr:
            return usr

    # If role is unspecified in token, check in priority order
    usr = db.query(User).filter(User.email == email).first()
    if usr:
        return usr
    doc = db.query(Doctor).filter(Doctor.email == email).first()
    if doc:
        return doc
    adm = db.query(AdminUser).filter(AdminUser.email == email).first()
    if adm:
        return adm

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
