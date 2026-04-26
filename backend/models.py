from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
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
    created_at = Column(DateTime, default=datetime.utcnow)

class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"))
    doctor_id = Column(Integer, ForeignKey("users.id"))
    appointment_time = Column(DateTime)
    symptoms_summary = Column(String)
    status = Column(String, default="Pending")
