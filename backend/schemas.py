import re
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

# ---------------------------------------------------------------------------
# Auth / Registration Schemas
# ---------------------------------------------------------------------------

class PatientCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    age: int | None = Field(default=None, ge=0, le=120)
    gender: str | None = None
    phone: str | None = None
    home_city: str | None = None
    home_address: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v


class DoctorCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    specialization: str
    experience_years: int | None = 0
    qualifications: str
    license_number: str
    phone: str
    practice_city: str
    practice_address: str
    consultation_fee: float | None = 0.0
    bio: str | None = None
    shift_start: str | None = "09:00"
    shift_end: str | None = "17:00"

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v


class AdminCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str | None = "admin"

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v


class ContactCreate(BaseModel):
    """
    Public contact form payload.

    Length caps are enforced here rather than trusted from the client: the
    message column is a plain String, and an unbounded free-text field on an
    unauthenticated endpoint is a cheap way to grow the database.
    """
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    message: str = Field(min_length=10, max_length=4000)


class ContactOut(BaseModel):
    id: int
    name: str
    email: str
    message: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str




# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------

class PatientResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None = None
    age: int | None = Field(default=None, ge=0, le=120)
    gender: str | None = None
    phone: str | None = None
    home_city: str | None = None
    home_address: str | None = None
    home_lat: float | None = None
    home_lng: float | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class DoctorResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    specialization: str
    experience_years: int = 0
    qualifications: str | None = None
    license_number: str | None = None
    phone: str | None = None
    practice_city: str | None = None
    practice_address: str | None = None
    practice_lat: float | None = None
    practice_lng: float | None = None
    consultation_fee: float = 0.0
    bio: str | None = None
    shift_start: str = "09:00"
    shift_end: str = "17:00"
    slot_duration_minutes: int = 30
    blocked_dates: list[str] = []
    is_verified: bool = False
    is_active: bool = True
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class AdminResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool = True
    created_at: datetime | None = None

    class Config:
        from_attributes = True




# ---------------------------------------------------------------------------
# Profile Update Schemas
# ---------------------------------------------------------------------------

class PatientProfileUpdate(BaseModel):
    full_name: str | None = None
    age: int | None = Field(default=None, ge=0, le=120)
    gender: str | None = None
    phone: str | None = None
    home_city: str | None = None
    home_address: str | None = None
    home_lat: float | None = None
    home_lng: float | None = None
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None


class PatientProfileResponse(BaseModel):
    id: int
    full_name: str | None = None
    email: EmailStr
    age: int | None = Field(default=None, ge=0, le=120)
    gender: str | None = None
    phone: str | None = None
    home_city: str | None = None
    home_address: str | None = None
    home_lat: float | None = None
    home_lng: float | None = None
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None

    class Config:
        from_attributes = True


class PatientSettingsUpdate(BaseModel):
    """Partial update — omitted fields keep their current value."""
    appointment_emails: bool | None = None


class PatientSettingsResponse(BaseModel):
    appointment_emails: bool

    class Config:
        from_attributes = True


class DoctorProfileUpdate(BaseModel):
    full_name: str | None = None
    specialization: str | None = None
    experience_years: int | None = None
    qualifications: str | None = None
    license_number: str | None = None
    phone: str | None = None
    practice_city: str | None = None
    practice_address: str | None = None
    practice_lat: float | None = None
    practice_lng: float | None = None
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    consultation_fee: float | None = None
    bio: str | None = None
    shift_start: str | None = None
    shift_end: str | None = None


class AdminManageDoctor(BaseModel):
    full_name: str | None = None
    specialization: str | None = None
    experience_years: int | None = None
    qualifications: str | None = None
    license_number: str | None = None
    phone: str | None = None
    practice_city: str | None = None
    practice_address: str | None = None
    practice_lat: float | None = None
    practice_lng: float | None = None
    consultation_fee: float | None = None
    bio: str | None = None
    shift_start: str | None = None
    shift_end: str | None = None
    is_verified: bool | None = None
    is_active: bool | None = None
    password: str | None = None

    @field_validator("shift_start", "shift_end")
    @classmethod
    def validate_shift_format(cls, v: str | None) -> str | None:
        if v is not None and not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", v):
            raise ValueError(
                f"Shift time must be in HH:MM 24-hour format "
                f"(e.g. '09:00', '17:30'). Got '{v}'."
            )
        return v

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str | None) -> str | None:
        if v is not None and v != "" and len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v


class AdminManagePatient(BaseModel):
    full_name: str | None = None
    age: int | None = Field(default=None, ge=0, le=120)
    gender: str | None = None
    phone: str | None = None
    home_city: str | None = None
    home_address: str | None = None
    password: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str | None) -> str | None:
        if v is not None and v != "" and len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v




# ---------------------------------------------------------------------------
# Password Reset Schemas
# ---------------------------------------------------------------------------

class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    # "link" (default) emails a reset URL — used by the logged-out login
    # page. "code" emails a short numeric code — used by the logged-in
    # Settings page, where staying in the app is better than navigating away.
    mode: str = "link"

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in ("link", "code"):
            raise ValueError("mode must be 'link' or 'code'")
        return v


class VerifyResetCodeRequest(BaseModel):
    """Exchange an emailed code plus a new password for a completed reset.

    Deliberately carries no email: the account is taken from the access
    token. Accepting a client-supplied address would let any signed-in user
    reset a *different* account's password using a code they obtained for
    that address.
    """

    code: str = Field(min_length=6, max_length=6)
    new_password: str

    @field_validator("code")
    @classmethod
    def validate_code_shape(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("code must be numeric")
        return v

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        return v


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
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
    prescription_notes: str | None = None


class AppointmentResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    appointment_date: date
    slot_time: str
    symptoms_summary: str
    status: str
    prescription_notes: str | None = None
    patient_name: str | None = None
    patient_email: str | None = None
    doctor_name: str | None = None
    doctor_specialty: str | None = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Symptom Mapping & Specialization Schemas
# ---------------------------------------------------------------------------

class SymptomMappingCreate(BaseModel):
    symptom: str
    specialist: str
    urgency: str | None = "medium"
    is_custom: bool | None = False
    added_by: str | None = None


class SymptomMappingResponse(BaseModel):
    id: int
    symptom: str
    specialist: str
    urgency: str = "medium"
    is_custom: bool = False
    added_by: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class SpecializationCreate(BaseModel):
    name: str
    description: str | None = None
    common_conditions: list[str] | None = []


class SpecializationResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    common_conditions: list[str] = []
    created_at: datetime | None = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Chat / Process Schema
# ---------------------------------------------------------------------------

class ProcessRequest(BaseModel):
    text: str | None = None
    message: str | None = None
    session_id: str
    patient_lat: float | None = None
    patient_lng: float | None = None
