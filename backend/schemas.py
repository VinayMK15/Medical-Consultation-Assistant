from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import date, datetime
import re


# ---------------------------------------------------------------------------
# Auth / Registration Schemas
# ---------------------------------------------------------------------------

class PatientCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    home_city: Optional[str] = None
    home_address: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return v


class DoctorCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    specialization: str
    experience_years: Optional[int] = 0
    qualifications: Optional[str] = None
    license_number: Optional[str] = None
    phone: Optional[str] = None
    practice_city: Optional[str] = None
    practice_address: Optional[str] = None
    consultation_fee: Optional[float] = 0.0
    bio: Optional[str] = None
    shift_start: Optional[str] = "09:00"
    shift_end: Optional[str] = "17:00"

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return v


class AdminCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Optional[str] = "admin"

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


# Backward compatibility aliases
UserCreate = PatientCreate
UserLogin = LoginRequest


# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------

class PatientResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    home_city: Optional[str] = None
    home_address: Optional[str] = None
    home_lat: Optional[float] = None
    home_lng: Optional[float] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DoctorResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    specialization: str
    experience_years: int = 0
    qualifications: Optional[str] = None
    license_number: Optional[str] = None
    phone: Optional[str] = None
    practice_city: Optional[str] = None
    practice_address: Optional[str] = None
    practice_lat: Optional[float] = None
    practice_lng: Optional[float] = None
    consultation_fee: float = 0.0
    bio: Optional[str] = None
    shift_start: str = "09:00"
    shift_end: str = "17:00"
    slot_duration_minutes: int = 30
    blocked_dates: List[str] = []
    is_verified: bool = False
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Backward compatibility
UserResponse = PatientResponse


# ---------------------------------------------------------------------------
# Profile Update Schemas
# ---------------------------------------------------------------------------

class PatientProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    home_city: Optional[str] = None
    home_address: Optional[str] = None
    home_lat: Optional[float] = None
    home_lng: Optional[float] = None
    city: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class PatientProfileResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: EmailStr
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    home_city: Optional[str] = None
    home_address: Optional[str] = None
    home_lat: Optional[float] = None
    home_lng: Optional[float] = None
    city: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

    class Config:
        from_attributes = True


class DoctorProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    specialization: Optional[str] = None
    experience_years: Optional[int] = None
    qualifications: Optional[str] = None
    license_number: Optional[str] = None
    phone: Optional[str] = None
    practice_city: Optional[str] = None
    practice_address: Optional[str] = None
    practice_lat: Optional[float] = None
    practice_lng: Optional[float] = None
    city: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    consultation_fee: Optional[float] = None
    bio: Optional[str] = None
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None


class AdminManageDoctor(BaseModel):
    full_name: Optional[str] = None
    specialization: Optional[str] = None
    experience_years: Optional[int] = None
    qualifications: Optional[str] = None
    license_number: Optional[str] = None
    phone: Optional[str] = None
    practice_city: Optional[str] = None
    practice_address: Optional[str] = None
    practice_lat: Optional[float] = None
    practice_lng: Optional[float] = None
    consultation_fee: Optional[float] = None
    bio: Optional[str] = None
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    is_verified: Optional[bool] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str | None) -> str | None:
        if v is not None and v != "" and len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return v


class AdminManagePatient(BaseModel):
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    home_city: Optional[str] = None
    home_address: Optional[str] = None
    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str | None) -> str | None:
        if v is not None and v != "" and len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return v


# Backward compatibility
AdminUserCreate = DoctorCreate
AdminUserUpdate = AdminManageDoctor


# ---------------------------------------------------------------------------
# Password Reset Schemas
# ---------------------------------------------------------------------------

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return v


# ---------------------------------------------------------------------------
# Schedule Schemas
# ---------------------------------------------------------------------------

class BlockedDateToggle(BaseModel):
    date: str  # YYYY-MM-DD


class ScheduleUpdate(BaseModel):
    shift_start: str   # e.g. "09:00"
    shift_end: str     # e.g. "17:00"

    @field_validator("shift_start", "shift_end")
    @classmethod
    def validate_time_format(cls, v: str) -> str:
        if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", v):
            raise ValueError(
                f"Time must be in HH:MM 24-hour format (e.g. '09:00', '17:30'). Got '{v}'."
            )
        return v


# ---------------------------------------------------------------------------
# Appointment Schemas
# ---------------------------------------------------------------------------

class AppointmentCreate(BaseModel):
    doctor_id: int
    appointment_date: date
    slot_time: str
    symptoms_summary: str

    @field_validator("slot_time")
    @classmethod
    def validate_slot_time(cls, v: str) -> str:
        if not re.match(r"^([01]\d|2[0-3]):(00|30)$", v):
            raise ValueError(
                "slot_time must be in HH:MM format and end in :00 or :30 "
                "(e.g. '09:00', '14:30'). 30-minute slots only."
            )
        return v


class AppointmentComplete(BaseModel):
    prescription_notes: Optional[str] = None


class AppointmentResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    appointment_date: date
    slot_time: str
    symptoms_summary: str
    status: str
    prescription_notes: Optional[str] = None
    patient_name: Optional[str] = None
    patient_email: Optional[str] = None
    doctor_name: Optional[str] = None
    doctor_specialty: Optional[str] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Symptom Mapping & Specialization Schemas
# ---------------------------------------------------------------------------

class SymptomMappingCreate(BaseModel):
    symptom: str
    specialist: str
    urgency: Optional[str] = "medium"
    is_custom: Optional[bool] = False
    added_by: Optional[str] = None


class SymptomMappingResponse(BaseModel):
    id: int
    symptom: str
    specialist: str
    urgency: str = "medium"
    is_custom: bool = False
    added_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SpecializationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    common_conditions: Optional[List[str]] = []


class SpecializationResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    common_conditions: List[str] = []
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Chat / Process Schema
# ---------------------------------------------------------------------------

class ProcessRequest(BaseModel):
    text: Optional[str] = None
    message: Optional[str] = None
    session_id: str
    patient_lat: Optional[float] = None
    patient_lng: Optional[float] = None
