from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Date, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    """Represents a Patient."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    age = Column(Integer)  # Important for medical context
    gender = Column(String)  # (e.g., Male, Female, Other)
    phone = Column(String, nullable=True)

    # Location fields
    home_city = Column(String, nullable=True)
    home_address = Column(String, nullable=True)
    home_lat = Column(Float, nullable=True)
    home_lng = Column(Float, nullable=True)

    # Password Reset
    reset_token = Column(String, nullable=True, index=True)
    reset_token_expires = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    appointments = relationship(
        "Appointment", foreign_keys="Appointment.patient_id", back_populates="patient"
    )


class Doctor(Base):
    """Represents a Doctor."""
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    specialization = Column(String, nullable=False)
    experience_years = Column(Integer, default=0)
    qualifications = Column(String, nullable=True)
    license_number = Column(String, nullable=True)
    phone = Column(String, nullable=True)

    # Location & Practice details
    practice_city = Column(String, nullable=True)
    practice_address = Column(String, nullable=True)
    practice_lat = Column(Float, nullable=True)
    practice_lng = Column(Float, nullable=True)
    consultation_fee = Column(Float, default=0.0)
    bio = Column(String, nullable=True)

    # Schedule & Availability
    shift_start = Column(String, default="09:00")
    shift_end = Column(String, default="17:00")
    slot_duration_minutes = Column(Integer, default=30)
    blocked_dates = Column(JSON, default=list)

    # Admin controls
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    # Password Reset
    reset_token = Column(String, nullable=True, index=True)
    reset_token_expires = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    appointments = relationship(
        "Appointment", foreign_keys="Appointment.doctor_id", back_populates="doctor"
    )


class AdminUser(Base):
    """Represents an Admin."""
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="admin")  # "admin" or "superadmin"
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (
        UniqueConstraint(
            "doctor_id",
            "appointment_date",
            "slot_time",
            name="uq_doctor_date_slot"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"))
    doctor_id = Column(Integer, ForeignKey("doctors.id"))

    appointment_date = Column(Date, nullable=False)
    slot_time = Column(String, nullable=False)

    symptoms_summary = Column(String)
    status = Column(String, default="Pending")
    prescription_notes = Column(String, nullable=True)

    # Relationships
    patient = relationship(
        "User", foreign_keys=[patient_id], back_populates="appointments"
    )
    doctor = relationship(
        "Doctor", foreign_keys=[doctor_id], back_populates="appointments"
    )


class SymptomMapping(Base):
    __tablename__ = "symptom_mappings"

    id = Column(Integer, primary_key=True, index=True)
    symptom = Column(String, unique=True, index=True, nullable=False)
    specialist = Column(String, nullable=False)
    urgency = Column(String, default="medium")
    is_custom = Column(Boolean, default=False)
    added_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Specialization(Base):
    __tablename__ = "specializations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    common_conditions = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
