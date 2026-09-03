from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import date
import re


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    role: Optional[str] = "patient"
    specialization: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return v

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    role: str
    is_verified: bool
    specialization: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    # --- NEW: Doctor shift window ---
    shift_start: str = "09:00"
    shift_end: str = "17:00"
    blocked_dates: List[str] = []

    class Config:
        from_attributes = True


# Used by doctor to block or unblock a date
class BlockedDateToggle(BaseModel):
    date: str  # YYYY-MM-DD


class PatientProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
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
    city: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

    class Config:
        from_attributes = True


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


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str
    age: Optional[int] = None
    gender: Optional[str] = None
    specialization: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    # --- NEW: optional shift fields for admin-created doctors ---
    shift_start: Optional[str] = "09:00"
    shift_end: Optional[str] = "17:00"

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return v


class AdminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    full_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    specialization: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    is_verified: Optional[bool] = None
    # --- NEW: editable shift window ---
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str | None) -> str | None:
        if v is not None and v != "" and len(v) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


# ---------------------------------------------------------------------------
# Doctor Schedule Schema
# ---------------------------------------------------------------------------

class ScheduleUpdate(BaseModel):
    """
    Payload for PUT /api/doctor/schedule.
    Both fields must be strict "HH:MM" (24-hour) strings.
    """
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
# Appointment Schemas — Time Slot Engine (30-min slots)
# ---------------------------------------------------------------------------

class AppointmentCreate(BaseModel):
    """
    Schema for booking a new appointment.
    - appointment_date: "YYYY-MM-DD"
    - slot_time: "HH:MM" — must end in :00 or :30 (30-minute slots only)
    """
    doctor_id: int
    appointment_date: date                     # Pydantic auto-parses "YYYY-MM-DD"
    slot_time: str                              # e.g. "10:00", "14:30"
    symptoms_summary: str

    @field_validator("slot_time")
    @classmethod
    def validate_slot_time(cls, v: str) -> str:
        # Must match strict HH:MM format
        if not re.match(r"^([01]\d|2[0-3]):(00|30)$", v):
            raise ValueError(
                "slot_time must be in HH:MM format and end in :00 or :30 "
                "(e.g. '09:00', '14:30'). 30-minute slots only."
            )
        return v


class AppointmentComplete(BaseModel):
    prescription_notes: Optional[str] = None


class AppointmentResponse(BaseModel):
    """Response model returning booked appointment details."""
    id: int
    patient_id: int
    doctor_id: int
    appointment_date: date
    slot_time: str
    symptoms_summary: str
    status: str
    prescription_notes: Optional[str] = None
    # Enriched fields (populated by the API layer, not stored on Appointment)
    patient_name: Optional[str] = None
    patient_email: Optional[str] = None
    doctor_name: Optional[str] = None
    doctor_specialty: Optional[str] = None

    class Config:
        from_attributes = True


class ProcessRequest(BaseModel):
    """Schema for POST /process request body with optional GPS coordinates."""
    text: Optional[str] = None
    message: Optional[str] = None
    session_id: str
    patient_lat: Optional[float] = None
    patient_lng: Optional[float] = None

