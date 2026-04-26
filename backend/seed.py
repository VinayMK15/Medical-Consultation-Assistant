from datetime import datetime, timedelta
from database import SessionLocal
from models import User, Appointment
from passlib.context import CryptContext

# 1. Setup Password Hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    return pwd_context.hash(password)

def seed_database():
    db = SessionLocal()
    
    try:
        print("[seed] Seeding the MedAssist Database...")
        
        # Delete stale seed rows first
        db.query(Appointment).delete()
        for em in ["admin@medassist.com", "doctor@medassist.com", "patient@medassist.com"]:
            u = db.query(User).filter(User.email == em).first()
            if u:
                db.delete(u)
        db.commit()

        # 2. Inject Master Admin
        admin = User(
            full_name="System Admin",
            email="admin@medassist.com",
            hashed_password=hash_password("admin123"),
            role="admin",
            is_verified=True
        )
        db.add(admin)
        print("[ok] Admin created: admin@medassist.com (pw: admin123)")

        # 3. Inject Verified Doctor
        doctor = User(
            full_name="Dr. Sharma",
            email="doctor@medassist.com",
            hashed_password=hash_password("doctor123"),
            role="doctor",
            is_verified=True
        )
        db.add(doctor)
        db.commit()
        db.refresh(doctor)
        print("[ok] Doctor created: doctor@medassist.com (pw: doctor123)")

        # 4. Inject Standard Patient
        patient = User(
            full_name="Rahul Desai",
            email="patient@medassist.com",
            hashed_password=hash_password("patient123"),
            role="patient"
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        print("[ok] Patient created: patient@medassist.com (pw: patient123)")

        # 5. Inject a Dummy Appointment
        if db.query(Appointment).count() == 0:
            appt1 = Appointment(
                patient_id=patient.id,
                doctor_id=doctor.id,
                appointment_time=datetime.now() + timedelta(hours=2),
                symptoms_summary="AI Pre-Consultation: Patient reports chest tightness and shortness of breath during exertion. Triage level: Moderate.",
                status="Pending"
            )
            db.add(appt1)
            print("[ok] Dummy appointment injected!")

        db.commit()
        print("[done] Seeding complete! You are ready to test.")
        
    except Exception as e:
        print(f"[error] Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
