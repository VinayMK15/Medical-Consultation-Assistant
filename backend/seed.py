"""
seed.py - Master seed script for MedAssist.

Creates:
  1. Admin account
  2. Primary doctor account (for dashboard testing)
  3. Patient account
  4. 30 verified specialty doctors across 15 Bangalore areas
  5. Demo appointments using the new slot-engine schema (appointment_date + slot_time)

Run:
    cd backend
    python seed.py
"""

from datetime import date, timedelta
from database import SessionLocal, engine
from models import User, Appointment, Base
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# ---------------------------------------------------------------------------
# 30 Verified Doctors - 2 per specialty across 15 Bangalore areas
# Universal password: password123
# Email format: dr.[specialty].[area]@medassist.com
# ---------------------------------------------------------------------------

SPECIALTIES = [
    "Cardiologist", "Neurologist", "Pulmonologist", "General Physician",
    "Internal Medicine", "Dermatologist", "Orthopedist", "Pediatrician",
    "Psychiatrist", "Gastroenterologist", "Endocrinologist", "Ophthalmologist",
    "ENT Specialist", "Urologist", "Oncologist",
]

AREAS = [
    "Whitefield", "Koramangala", "Indiranagar", "Jayanagar", "Malleswaram",
    "HSR Layout", "BTM Layout", "Electronic City", "Marathahalli", "Hebbal",
    "Yelahanka", "Banashankari", "Bellandur", "Rajajinagar", "JP Nagar",
]

# Realistic Indian doctor names (30 total - alternating Female/Male)
DOCTOR_NAMES = [
    "Dr. Priya Sharma",      "Dr. Rajesh Menon",       # Cardiologist
    "Dr. Sneha Iyer",        "Dr. Vikram Joshi",       # Neurologist
    "Dr. Ananya Das",        "Dr. Suresh Patil",       # Pulmonologist
    "Dr. Kavitha Rao",       "Dr. Arjun Nair",         # General Physician
    "Dr. Divya Shetty",      "Dr. Manoj Kumar",        # Internal Medicine
    "Dr. Lakshmi Reddy",     "Dr. Karthik Bhat",       # Dermatologist
    "Dr. Pooja Hegde",       "Dr. Ravi Prasad",        # Orthopedist
    "Dr. Meghana Kulkarni",  "Dr. Siddharth Gowda",    # Pediatrician
    "Dr. Nandini Acharya",   "Dr. Anil Deshmukh",      # Psychiatrist
    "Dr. Swathi Mohan",      "Dr. Pranav Iyengar",     # Gastroenterologist
    "Dr. Rekha Venkatesh",   "Dr. Deepak Srinivas",    # Endocrinologist
    "Dr. Gayathri Ramesh",   "Dr. Harish Babu",        # Ophthalmologist
    "Dr. Suma Kamath",       "Dr. Nikhil Prabhu",      # ENT Specialist
    "Dr. Rashmi Naik",       "Dr. Girish Agarwal",     # Urologist
    "Dr. Bhavya Krishnan",   "Dr. Tarun Saxena",       # Oncologist
]

# Shift variations so not all doctors have the same hours
SHIFT_PATTERNS = [
    ("09:00", "17:00"),   # standard day
    ("08:00", "16:00"),   # early bird
    ("10:00", "18:00"),   # late start
    ("09:00", "17:00"),   # standard day
    ("08:30", "16:30"),   # half-hour offset
]


def build_30_doctors():
    """Generate the 30 doctor data dicts."""
    doctors = []
    for i in range(30):
        spec = SPECIALTIES[i // 2]
        area = AREAS[i % 15]
        safe_spec = spec.lower().replace(" ", "")
        safe_area = area.lower().replace(" ", "")
        shift_start, shift_end = SHIFT_PATTERNS[i % len(SHIFT_PATTERNS)]

        doctors.append({
            "full_name": DOCTOR_NAMES[i],
            "email": f"dr.{safe_spec}.{safe_area}@medassist.com",
            "password": "password123",
            "specialization": spec,
            "city": "Bangalore",
            "address": f"{area}, Bangalore",
            "gender": "Female" if i % 2 == 0 else "Male",
            "age": 33 + (i % 18),
            "shift_start": shift_start,
            "shift_end": shift_end,
        })
    return doctors


# ---------------------------------------------------------------------------
# Pending doctors - appear in admin approval queue
# ---------------------------------------------------------------------------
PENDING_DOCTORS = [
    {
        "full_name": "Dr. Meera Iyer",
        "email": "meera.iyer@medassist.com",
        "password": "doctor123",
        "specialization": "Dermatologist",
        "gender": "Female",
        "age": 34,
    },
    {
        "full_name": "Dr. Kiran Reddy",
        "email": "kiran.reddy@medassist.com",
        "password": "doctor123",
        "specialization": "Pediatrician",
        "gender": "Male",
        "age": 41,
    },
    {
        "full_name": "Dr. Rohan Bhat",
        "email": "rohan.bhat@medassist.com",
        "password": "doctor123",
        "specialization": "Psychiatrist",
        "gender": "Male",
        "age": 38,
    },
    {
        "full_name": "Dr. Nalini Krishnan",
        "email": "nalini.krishnan@medassist.com",
        "password": "doctor123",
        "specialization": "Gynecologist",
        "gender": "Female",
        "age": 45,
    },
    {
        "full_name": "Dr. Sanjay Hegde",
        "email": "sanjay.hegde@medassist.com",
        "password": "doctor123",
        "specialization": "Orthopedic Surgeon",
        "gender": "Male",
        "age": 50,
    },
]


def seed_database():
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        print("=" * 60)
        print("  MedAssist - Database Seeder")
        print("=" * 60)

        # -- Wipe all existing seed data ---------------------------------
        print("\n[clean] Removing stale seed data...")
        db.query(Appointment).delete()
        db.commit()

        specialist_doctors = build_30_doctors()
        all_seed_emails = (
            ["admin@medassist.com", "doctor@medassist.com", "test1@gmail.com",
             "patient2@gmail.com", "patient@medassist.com"]
            + [d["email"] for d in specialist_doctors]
            + [d["email"] for d in PENDING_DOCTORS]
        )
        for email in all_seed_emails:
            u = db.query(User).filter(User.email == email).first()
            if u:
                db.delete(u)
        db.commit()

        # -- 1. Admin ----------------------------------------------------
        admin = User(
            full_name="System Admin",
            email="admin@medassist.com",
            hashed_password=hash_password("admin123"),
            role="admin",
            is_verified=True,
        )
        db.add(admin)
        print("\n[ok] Admin created")
        print("    email:    admin@medassist.com")
        print("    password: admin123")

        # -- 2. Primary Doctor (dashboard login) -------------------------
        primary_doctor = User(
            full_name="Dr. Anjali Sharma",
            email="doctor@medassist.com",
            hashed_password=hash_password("doctor123"),
            role="doctor",
            specialization="Cardiologist",
            gender="Female",
            age=39,
            city="Bangalore",
            address="Koramangala, Bangalore",
            is_verified=True,
            shift_start="09:00",
            shift_end="17:00",
        )
        db.add(primary_doctor)
        db.commit()
        db.refresh(primary_doctor)
        print("\n[ok] Primary Doctor created (verified)")
        print("    email:    doctor@medassist.com")
        print("    password: doctor123")

        # -- 3. Patient --------------------------------------------------
        patient = User(
            full_name="Test Patient",
            email="test1@gmail.com",
            hashed_password=hash_password("test1@123"),
            role="patient",
            age=28,
            gender="Male",
        )
        db.add(patient)

        patient2 = User(
            full_name="Second Patient",
            email="patient2@gmail.com",
            hashed_password=hash_password("patient123"),
            role="patient",
            age=32,
            gender="Female",
        )
        db.add(patient2)

        db.commit()
        db.refresh(patient)
        db.refresh(patient2)
        print("\n[ok] Patients created")
        print("    email:    test1@gmail.com / test1@123")
        print("    email:    patient2@gmail.com / patient123")

        # -- 4. 30 Verified Specialty Doctors ----------------------------
        print(f"\n[seed] Creating {len(specialist_doctors)} verified specialty doctors...")
        print(f"       Universal password: password123")
        print(f"       City: Bangalore\n")

        for doc_data in specialist_doctors:
            doc = User(
                full_name=doc_data["full_name"],
                email=doc_data["email"],
                hashed_password=hash_password(doc_data["password"]),
                role="doctor",
                specialization=doc_data["specialization"],
                city=doc_data["city"],
                address=doc_data["address"],
                gender=doc_data["gender"],
                age=doc_data["age"],
                is_verified=True,
                shift_start=doc_data["shift_start"],
                shift_end=doc_data["shift_end"],
            )
            db.add(doc)
            shift_info = f"{doc_data['shift_start']}-{doc_data['shift_end']}"
            print(
                f"  [ok] {doc_data['full_name']:<26} "
                f"{doc_data['specialization']:<22} "
                f"{doc_data['address']:<28} "
                f"({shift_info})"
            )

        db.commit()

        # -- 5. Pending Doctors (admin approval queue) -------------------
        print(f"\n[seed] Creating {len(PENDING_DOCTORS)} pending doctors (is_verified=False)...")

        for d in PENDING_DOCTORS:
            pending = User(
                full_name=d["full_name"],
                email=d["email"],
                hashed_password=hash_password(d["password"]),
                role="doctor",
                specialization=d["specialization"],
                gender=d["gender"],
                age=d["age"],
                is_verified=False,
            )
            db.add(pending)
            print(f"  [pending] {d['full_name']:<25} ({d['specialization']:<20}) -> {d['email']}")

        db.commit()

        # -- 6. Demo Appointments (using new slot-engine schema) ---------
        print("\n[seed] Creating demo appointments...")

        tomorrow = date.today() + timedelta(days=1)

        demo_appointments = [
            {
                "patient_id": patient.id,
                "doctor_id": primary_doctor.id,
                "appointment_date": tomorrow,
                "slot_time": "09:30",
                "symptoms_summary": (
                    "AI Pre-Consultation: Patient reports chest tightness and "
                    "shortness of breath during exertion. Triage level: Moderate."
                ),
                "status": "Pending",
            },
            {
                "patient_id": patient.id,
                "doctor_id": primary_doctor.id,
                "appointment_date": tomorrow,
                "slot_time": "14:00",
                "symptoms_summary": (
                    "Follow-up consultation for recurring palpitations. "
                    "Previous ECG was normal. Needs stress test evaluation."
                ),
                "status": "Pending",
            },
        ]

        for appt_data in demo_appointments:
            appt = Appointment(**appt_data)
            db.add(appt)
            print(
                f"  [ok] {appt_data['appointment_date']} @ {appt_data['slot_time']} - "
                f"{appt_data['status']}"
            )

        db.commit()

        # -- Summary -----------------------------------------------------
        print("\n" + "=" * 60)
        print("  Seeding Complete!")
        print("=" * 60)
        print()
        print("  LOGIN CREDENTIALS")
        print("  -" * 28)
        print("  Admin   -> admin@medassist.com    / admin123")
        print("  Doctor  -> doctor@medassist.com   / doctor123  (verified)")
        print("  Patient -> test1@gmail.com        / test1@123")
        print()
        print(f"  Specialty Doctors: {len(specialist_doctors)} (all verified, pw: password123)")
        print(f"  Pending Doctors:   {len(PENDING_DOCTORS)} (awaiting admin approval)")
        print(f"  Demo Appointments: {len(demo_appointments)} (on {tomorrow})")
        print()
        print("  NLP TESTING CHEAT SHEET")
        print("  -" * 28)
        print("  [Heart] Cardiology   -> dr.cardiologist.whitefield@medassist.com")
        print("                    dr.cardiologist.koramangala@medassist.com")
        print("  [Brain] Neurology    -> dr.neurologist.indiranagar@medassist.com")
        print("                    dr.neurologist.jayanagar@medassist.com")
        print("  [Lung] Pulmonology  -> dr.pulmonologist.malleswaram@medassist.com")
        print("                    dr.pulmonologist.hsrlayout@medassist.com")
        print("  [Steth] General      -> dr.generalphysician.btmlayout@medassist.com")
        print("                    dr.generalphysician.electroniccity@medassist.com")
        print("  [Bone] Orthopedist  -> dr.orthopedist.bellandur@medassist.com")
        print("                    dr.orthopedist.rajajinagar@medassist.com")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()