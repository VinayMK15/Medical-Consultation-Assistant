"""
seed.py - Master seed script for MedAssist.

Seeds:
  1. Admin account -> AdminUser table
  2. Primary doctor account -> Doctor table
  3. Patient accounts -> User table
  4. 30 verified specialty doctors -> Doctor table
  5. 5 pending doctors -> Doctor table
  6. Demo appointments -> Appointment table
  7. Built-in symptom mappings -> SymptomMapping table
  8. Specializations -> Specialization table

Run:
    cd backend
    python seed.py
"""

from datetime import date, timedelta
from database import SessionLocal
from models import User, Doctor, AdminUser, Appointment, SymptomMapping, Specialization
from passlib.context import CryptContext
from services.geo import resolve_coords_sync

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# ---------------------------------------------------------------------------
# 30 Verified Doctors - 2 per specialty across 15 Bangalore areas
# Universal password: password123
# ---------------------------------------------------------------------------

SPECIALTIES = [
    "Cardiologist", "Neurologist", "Pulmonologist", "General Physician",
    "Internal Medicine", "Dermatologist", "Orthopedic Surgeon", "Pediatrician",
    "Psychiatrist", "Gastroenterologist", "Endocrinologist", "Ophthalmologist",
    "ENT Specialist", "Urologist", "Oncologist",
]

AREAS = [
    "Whitefield", "Koramangala", "Indiranagar", "Jayanagar", "Malleswaram",
    "HSR Layout", "BTM Layout", "Electronic City", "Marathahalli", "Hebbal",
    "Yelahanka", "Banashankari", "Bellandur", "Rajajinagar", "JP Nagar",
]

DOCTOR_NAMES = [
    "Dr. Priya Sharma",      "Dr. Rajesh Menon",       # Cardiologist
    "Dr. Sneha Iyer",        "Dr. Vikram Joshi",       # Neurologist
    "Dr. Ananya Das",        "Dr. Suresh Patil",       # Pulmonologist
    "Dr. Kavitha Rao",       "Dr. Arjun Nair",         # General Physician
    "Dr. Divya Shetty",      "Dr. Manoj Kumar",        # Internal Medicine
    "Dr. Lakshmi Reddy",     "Dr. Karthik Bhat",       # Dermatologist
    "Dr. Pooja Hegde",       "Dr. Ravi Prasad",        # Orthopedic Surgeon
    "Dr. Meghana Kulkarni",  "Dr. Siddharth Gowda",    # Pediatrician
    "Dr. Nandini Acharya",   "Dr. Anil Deshmukh",      # Psychiatrist
    "Dr. Swathi Mohan",      "Dr. Pranav Iyengar",     # Gastroenterologist
    "Dr. Rekha Venkatesh",   "Dr. Deepak Srinivas",    # Endocrinologist
    "Dr. Gayathri Ramesh",   "Dr. Harish Babu",        # Ophthalmologist
    "Dr. Suma Kamath",       "Dr. Nikhil Prabhu",      # ENT Specialist
    "Dr. Rashmi Naik",       "Dr. Girish Agarwal",     # Urologist
    "Dr. Bhavya Krishnan",   "Dr. Tarun Saxena",       # Oncologist
]

SHIFT_PATTERNS = [
    ("09:00", "17:00"),
    ("08:00", "16:00"),
    ("10:00", "18:00"),
    ("09:00", "17:00"),
    ("08:30", "16:30"),
]


def build_30_doctors():
    doctors = []
    for i in range(30):
        spec = SPECIALTIES[i // 2]
        area = AREAS[i % 15]
        safe_spec = spec.lower().replace(" ", "")
        safe_area = area.lower().replace(" ", "")
        shift_start, shift_end = SHIFT_PATTERNS[i % len(SHIFT_PATTERNS)]
        lat, lng = resolve_coords_sync(city="Bangalore", address=area)

        doctors.append({
            "full_name": DOCTOR_NAMES[i],
            "email": f"dr.{safe_spec}.{safe_area}@medassist.com",
            "password": "password123",
            "specialization": spec,
            "practice_city": "Bangalore",
            "practice_address": f"{area}, Bangalore",
            "practice_lat": lat,
            "practice_lng": lng,
            "experience_years": 5 + (i % 15),
            "consultation_fee": 500.0 + (i % 5) * 100,
            "bio": f"Experienced {spec} practicing at {area}, Bangalore.",
            "shift_start": shift_start,
            "shift_end": shift_end,
            "is_verified": True,
            "is_active": True,
        })
    return doctors


PENDING_DOCTORS = [
    {
        "full_name": "Dr. Meera Iyer",
        "email": "meera.iyer@medassist.com",
        "password": "doctor123",
        "specialization": "Dermatologist",
        "practice_city": "Bangalore",
        "practice_address": "Indiranagar, Bangalore",
        "experience_years": 8,
        "consultation_fee": 600.0,
    },
    {
        "full_name": "Dr. Kiran Reddy",
        "email": "kiran.reddy@medassist.com",
        "password": "doctor123",
        "specialization": "Pediatrician",
        "practice_city": "Bangalore",
        "practice_address": "Jayanagar, Bangalore",
        "experience_years": 12,
        "consultation_fee": 700.0,
    },
    {
        "full_name": "Dr. Rohan Bhat",
        "email": "rohan.bhat@medassist.com",
        "password": "doctor123",
        "specialization": "Psychiatrist",
        "practice_city": "Bangalore",
        "practice_address": "Koramangala, Bangalore",
        "experience_years": 9,
        "consultation_fee": 800.0,
    },
    {
        "full_name": "Dr. Nalini Krishnan",
        "email": "nalini.krishnan@medassist.com",
        "password": "doctor123",
        "specialization": "Gynecologist",
        "practice_city": "Bangalore",
        "practice_address": "Whitefield, Bangalore",
        "experience_years": 15,
        "consultation_fee": 900.0,
    },
    {
        "full_name": "Dr. Sanjay Hegde",
        "email": "sanjay.hegde@medassist.com",
        "password": "doctor123",
        "specialization": "Orthopedic Surgeon",
        "practice_city": "Bangalore",
        "practice_address": "Malleshwaram, Bangalore",
        "experience_years": 18,
        "consultation_fee": 1000.0,
    },
]

BUILTIN_SYMPTOMS = [
    # Cardiology
    ("chest pain", "Cardiologist", "high"),
    ("heart pain", "Cardiologist", "high"),
    ("palpitations", "Cardiologist", "medium"),
    ("heart attack", "Cardiologist", "critical"),
    ("chest tightness", "Cardiologist", "high"),
    # Neurology
    ("headache", "Neurologist", "medium"),
    ("migraine", "Neurologist", "medium"),
    ("seizure", "Neurologist", "high"),
    ("dizziness", "Neurologist", "medium"),
    ("numbness", "Neurologist", "medium"),
    ("stroke", "Neurologist", "critical"),
    # Pulmonology
    ("cough", "Pulmonologist", "low"),
    ("shortness of breath", "Pulmonologist", "high"),
    ("breathing", "Pulmonologist", "high"),
    ("asthma", "Pulmonologist", "medium"),
    ("wheezing", "Pulmonologist", "medium"),
    # Internal Medicine
    ("nausea", "Internal Medicine", "low"),
    ("nauseous", "Internal Medicine", "low"),
    ("stomach pain", "Internal Medicine", "medium"),
    ("abdominal pain", "Internal Medicine", "medium"),
    ("vomiting", "Internal Medicine", "low"),
    # General Physician
    ("fever", "General Physician", "low"),
    ("cold", "General Physician", "low"),
    ("flu", "General Physician", "low"),
    ("fatigue", "General Physician", "low"),
    ("weakness", "General Physician", "low"),
    # Orthopedics
    ("broken arm", "Orthopedic Surgeon", "high"),
    ("broke my arm", "Orthopedic Surgeon", "high"),
    ("fracture", "Orthopedic Surgeon", "high"),
    ("broken bone", "Orthopedic Surgeon", "high"),
    ("bone pain", "Orthopedic Surgeon", "medium"),
    ("joint pain", "Orthopedic Surgeon", "medium"),
    ("knee pain", "Orthopedic Surgeon", "medium"),
    ("back pain", "Orthopedic Surgeon", "medium"),
    ("backache", "Orthopedic Surgeon", "medium"),
    ("neck pain", "Orthopedic Surgeon", "medium"),
    ("neckpain", "Orthopedic Surgeon", "medium"),
    ("stiff neck", "Orthopedic Surgeon", "medium"),
    ("neck stiffness", "Orthopedic Surgeon", "medium"),
    ("neck ache", "Orthopedic Surgeon", "medium"),
    ("shoulder pain", "Orthopedic Surgeon", "medium"),
    ("shoulder ache", "Orthopedic Surgeon", "medium"),
    ("sprain", "Orthopedic Surgeon", "medium"),
    ("broken leg", "Orthopedic Surgeon", "high"),
    # Dermatology
    ("rash", "Dermatologist", "low"),
    ("skin rash", "Dermatologist", "low"),
    ("acne", "Dermatologist", "low"),
    ("eczema", "Dermatologist", "low"),
    ("psoriasis", "Dermatologist", "low"),
    ("itching", "Dermatologist", "low"),
    ("skin infection", "Dermatologist", "medium"),
    # Pediatrics
    ("child fever", "Pediatrician", "medium"),
    ("infant", "Pediatrician", "medium"),
    ("baby", "Pediatrician", "medium"),
    ("child rash", "Pediatrician", "low"),
    # Psychiatry
    ("anxiety", "Psychiatrist", "medium"),
    ("depression", "Psychiatrist", "medium"),
    ("panic attack", "Psychiatrist", "high"),
    ("mental health", "Psychiatrist", "medium"),
    ("insomnia", "Psychiatrist", "low"),
    ("stress", "Psychiatrist", "low"),
    # Gastroenterology
    ("diarrhea", "Gastroenterologist", "low"),
    ("constipation", "Gastroenterologist", "low"),
    ("bloating", "Gastroenterologist", "low"),
    ("acid reflux", "Gastroenterologist", "low"),
    ("heartburn", "Gastroenterologist", "low"),
    ("ibs", "Gastroenterologist", "medium"),
    # Endocrinology
    ("diabetes", "Endocrinologist", "medium"),
    ("thyroid", "Endocrinologist", "medium"),
    ("weight gain", "Endocrinologist", "low"),
    ("hormonal", "Endocrinologist", "medium"),
    # Ophthalmology
    ("eye pain", "Ophthalmologist", "medium"),
    ("blurry vision", "Ophthalmologist", "high"),
    ("vision loss", "Ophthalmologist", "critical"),
    ("red eye", "Ophthalmologist", "low"),
    # ENT
    ("ear pain", "ENT Specialist", "low"),
    ("hearing loss", "ENT Specialist", "medium"),
    ("sore throat", "ENT Specialist", "low"),
    ("nose bleed", "ENT Specialist", "medium"),
    ("sinusitis", "ENT Specialist", "low"),
    ("tonsils", "ENT Specialist", "medium"),
    # Urology
    ("urinary pain", "Urologist", "medium"),
    ("kidney stone", "Urologist", "high"),
    ("frequent urination", "Urologist", "medium"),
    # Oncology
    ("cancer", "Oncologist", "high"),
    ("tumor", "Oncologist", "high"),
    ("lump", "Oncologist", "medium"),
]

SPECIALIZATIONS_DATA = [
    {"name": "Cardiologist", "description": "Heart and cardiovascular system specialist", "common_conditions": ["Chest pain", "Hypertension", "Arrhythmia"]},
    {"name": "Neurologist", "description": "Brain, spinal cord, and nervous system specialist", "common_conditions": ["Migraine", "Epilepsy", "Neuropathy"]},
    {"name": "Pulmonologist", "description": "Lungs and respiratory system specialist", "common_conditions": ["Asthma", "COPD", "Pneumonia"]},
    {"name": "General Physician", "description": "Primary healthcare and general adult medical conditions", "common_conditions": ["Fever", "Flu", "Fatigue"]},
    {"name": "Internal Medicine", "description": "Comprehensive prevention and treatment of adult diseases", "common_conditions": ["Abdominal pain", "Metabolic disorders"]},
    {"name": "Dermatologist", "description": "Skin, hair, and nail disorder specialist", "common_conditions": ["Acne", "Eczema", "Psoriasis"]},
    {"name": "Orthopedic Surgeon", "description": "Bones, joints, ligaments, and musculoskeletal specialist", "common_conditions": ["Fractures", "Arthritis", "Back pain"]},
    {"name": "Pediatrician", "description": "Infant, child, and adolescent healthcare specialist", "common_conditions": ["Childhood infections", "Growth milestones"]},
    {"name": "Psychiatrist", "description": "Mental health, emotional, and behavioral disorders", "common_conditions": ["Depression", "Anxiety", "Insomnia"]},
    {"name": "Gastroenterologist", "description": "Digestive tract, liver, and gastrointestinal specialist", "common_conditions": ["Acid reflux", "IBS", "Gastritis"]},
    {"name": "Endocrinologist", "description": "Hormones, metabolism, and endocrine system specialist", "common_conditions": ["Diabetes", "Thyroid disorders"]},
    {"name": "Ophthalmologist", "description": "Eye and vision care specialist", "common_conditions": ["Cataracts", "Glaucoma", "Vision loss"]},
    {"name": "ENT Specialist", "description": "Ear, nose, and throat medical specialist", "common_conditions": ["Sinusitis", "Hearing loss", "Tonsillitis"]},
    {"name": "Urologist", "description": "Urinary tract and male reproductive system specialist", "common_conditions": ["Kidney stones", "UTI"]},
    {"name": "Oncologist", "description": "Cancer diagnosis, therapy, and oncology care", "common_conditions": ["Tumors", "Carcinomas"]},
    {"name": "Gynecologist", "description": "Female reproductive health and obstetrics specialist", "common_conditions": ["PCOS", "Pregnancy care"]},
]


def seed_database():
    db = SessionLocal()

    try:
        print("=" * 60)
        print("  MedAssist - Database Seeder (6-Table Split)")
        print("=" * 60)

        # 1. Wipe existing data
        print("\n[clean] Removing stale seed data...")
        db.query(Appointment).delete()
        db.query(User).delete()
        db.query(Doctor).delete()
        db.query(AdminUser).delete()
        db.query(SymptomMapping).delete()
        db.query(Specialization).delete()
        db.commit()

        # 2. Seed Admin
        admin = AdminUser(
            full_name="System Admin",
            email="admin@medassist.com",
            hashed_password=hash_password("admin123"),
            role="admin",
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print("\n[ok] Admin created: admin@medassist.com / admin123")

        # 3. Seed Primary Doctor
        lat, lng = resolve_coords_sync("Bangalore", "Koramangala, Bangalore")
        primary_doctor = Doctor(
            full_name="Dr. Anjali Sharma",
            email="doctor@medassist.com",
            hashed_password=hash_password("doctor123"),
            specialization="Cardiologist",
            experience_years=10,
            qualifications="MBBS, MD (Cardiology)",
            license_number="KMC-48291",
            phone="9876543210",
            practice_city="Bangalore",
            practice_address="Koramangala, Bangalore",
            practice_lat=lat,
            practice_lng=lng,
            consultation_fee=700.0,
            bio="Senior Cardiologist with 10+ years of clinical excellence.",
            is_verified=True,
            is_active=True,
            shift_start="09:00",
            shift_end="17:00",
        )
        db.add(primary_doctor)
        db.commit()
        db.refresh(primary_doctor)
        print("[ok] Primary Doctor created: doctor@medassist.com / doctor123")

        # 4. Seed Patients
        p1_lat, p1_lng = resolve_coords_sync("Bangalore", "Indiranagar, Bangalore")
        p1 = User(
            full_name="Test Patient",
            email="test1@gmail.com",
            hashed_password=hash_password("test1@123"),
            age=28,
            gender="Male",
            phone="9123456780",
            home_city="Bangalore",
            home_address="Indiranagar, Bangalore",
            home_lat=p1_lat,
            home_lng=p1_lng,
        )
        p2 = User(
            full_name="Second Patient",
            email="patient2@gmail.com",
            hashed_password=hash_password("patient123"),
            age=32,
            gender="Female",
            phone="9123456781",
            home_city="Bangalore",
            home_address="Whitefield, Bangalore",
        )
        db.add_all([p1, p2])
        db.commit()
        db.refresh(p1)
        print("[ok] Patients created: test1@gmail.com / test1@123")

        # 5. Seed 30 Verified Specialty Doctors
        print(f"\n[seed] Creating 30 verified specialty doctors...")
        specialist_doctors = build_30_doctors()
        for doc_data in specialist_doctors:
            doc = Doctor(
                full_name=doc_data["full_name"],
                email=doc_data["email"],
                hashed_password=hash_password(doc_data["password"]),
                specialization=doc_data["specialization"],
                practice_city=doc_data["practice_city"],
                practice_address=doc_data["practice_address"],
                practice_lat=doc_data["practice_lat"],
                practice_lng=doc_data["practice_lng"],
                experience_years=doc_data["experience_years"],
                consultation_fee=doc_data["consultation_fee"],
                bio=doc_data["bio"],
                shift_start=doc_data["shift_start"],
                shift_end=doc_data["shift_end"],
                is_verified=True,
                is_active=True,
            )
            db.add(doc)
        db.commit()
        print("[ok] 30 Verified doctors added.")

        # 6. Seed Pending Doctors
        print(f"[seed] Creating 5 pending doctors...")
        for p_doc in PENDING_DOCTORS:
            lat, lng = resolve_coords_sync(p_doc["practice_city"], p_doc["practice_address"])
            doc = Doctor(
                full_name=p_doc["full_name"],
                email=p_doc["email"],
                hashed_password=hash_password(p_doc["password"]),
                specialization=p_doc["specialization"],
                practice_city=p_doc["practice_city"],
                practice_address=p_doc["practice_address"],
                practice_lat=lat,
                practice_lng=lng,
                experience_years=p_doc["experience_years"],
                consultation_fee=p_doc["consultation_fee"],
                is_verified=False,
                is_active=True,
            )
            db.add(doc)
        db.commit()
        print("[ok] 5 Pending doctors added.")

        # 7. Seed Demo Appointments
        print(f"[seed] Creating demo appointments...")
        tomorrow = date.today() + timedelta(days=1)
        demo_appts = [
            Appointment(
                patient_id=p1.id,
                doctor_id=primary_doctor.id,
                appointment_date=tomorrow,
                slot_time="09:30",
                symptoms_summary="AI Pre-Consultation: Patient reports chest tightness and shortness of breath.",
                status="Pending",
            ),
            Appointment(
                patient_id=p1.id,
                doctor_id=primary_doctor.id,
                appointment_date=tomorrow,
                slot_time="14:00",
                symptoms_summary="Follow-up consultation for recurring palpitations.",
                status="Pending",
            ),
        ]
        db.add_all(demo_appts)
        db.commit()
        print("[ok] Demo appointments added.")

        # 8. Seed Symptom Mappings
        print(f"[seed] Seeding {len(BUILTIN_SYMPTOMS)} symptom mappings...")
        for sym, spec, urg in BUILTIN_SYMPTOMS:
            mapping = SymptomMapping(
                symptom=sym.lower().strip(),
                specialist=spec,
                urgency=urg,
                is_custom=False,
                added_by="seed_script",
            )
            db.add(mapping)
        db.commit()
        print("[ok] Symptom mappings seeded.")

        # 9. Seed Specializations
        print(f"[seed] Seeding {len(SPECIALIZATIONS_DATA)} specializations...")
        for sp in SPECIALIZATIONS_DATA:
            spec_obj = Specialization(
                name=sp["name"],
                description=sp["description"],
                common_conditions=sp["common_conditions"],
            )
            db.add(spec_obj)
        db.commit()
        print("[ok] Specializations seeded.")

        print("\n" + "=" * 60)
        print("  Database Seeding Completed Successfully!")
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