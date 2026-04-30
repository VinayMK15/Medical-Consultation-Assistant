from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    role: Optional[str] = "patient"
    specialization: Optional[str] = None

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

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class AppointmentCreate(BaseModel):
    doctor_id: int
    appointment_time: datetime
    symptoms_summary: str


class AppointmentComplete(BaseModel):
    prescription_notes: Optional[str] = None


class AppointmentResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    appointment_time: datetime
    symptoms_summary: str
    status: str
    prescription_notes: Optional[str] = None
    patient_name: Optional[str] = None
    patient_email: Optional[str] = None

    class Config:
        from_attributes = True
