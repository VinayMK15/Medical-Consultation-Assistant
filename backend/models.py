from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Date, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    age = Column(Integer)  # Important for medical context
    gender = Column(String)  # (e.g., Male, Female, Other)
    role = Column(String, default="patient")
    is_verified = Column(Boolean, default=False)
    specialization = Column(String, nullable=True)
    # Location fields (relevant for doctors)
    city = Column(String, nullable=True)
    address = Column(String, nullable=True)
    lat = Column(String, nullable=True)   # stored as string for flexibility
    lng = Column(String, nullable=True)

    # --- NEW: Doctor shift/availability window (stored as "HH:MM" strings) ---
    shift_start = Column(String, default="09:00")  # e.g. "09:00"
    shift_end = Column(String, default="17:00")     # e.g. "17:00"
    blocked_dates = Column(JSON, default=list)  # Added for vacation tracking

    # --- NEW: Password Reset ---
    reset_token = Column(String, nullable=True, index=True)
    reset_token_expires = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    appointments_as_patient = relationship(
        "Appointment", foreign_keys="Appointment.patient_id", back_populates="patient"
    )
    appointments_as_doctor = relationship(
        "Appointment", foreign_keys="Appointment.doctor_id", back_populates="doctor"
    )


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"))
    doctor_id = Column(Integer, ForeignKey("users.id"))

    # --- REPLACED: generic appointment_time (DateTime) with date + slot ---
    appointment_date = Column(Date, nullable=False)    # e.g. 2026-05-20
    slot_time = Column(String, nullable=False)          # e.g. "10:30" (always HH:MM)

    symptoms_summary = Column(String)
    status = Column(String, default="Pending")
    prescription_notes = Column(String, nullable=True)

    # Relationships back to User
    patient = relationship(
        "User", foreign_keys=[patient_id], back_populates="appointments_as_patient"
    )
    doctor = relationship(
        "User", foreign_keys=[doctor_id], back_populates="appointments_as_doctor"
    )

# ---------------------------------------------------------------------------
# SCHEMA CHANGES — Use Alembic Migrations
# ---------------------------------------------------------------------------
# This project now uses Alembic for database migrations. When you add or
# modify a column in any model above, do NOT delete the database.
# Instead, run the following commands from the backend/ directory:
#
#   1. Generate a new migration:
#        alembic revision --autogenerate -m "describe your change"
#
#   2. Review the generated file in migrations/versions/
#
#   3. Apply the migration:
#        alembic upgrade head
#
# To roll back the last migration:
#        alembic downgrade -1
# ---------------------------------------------------------------------------
