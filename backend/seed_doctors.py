from database import SessionLocal, engine
import models
from models import User
from auth_utils import get_password_hash

# Ensure tables exist
models.Base.metadata.create_all(bind=engine)

def seed_database():
    db = SessionLocal()
    
    # 15 Distinct Specialties
    specialties = [
        "Cardiologist", "Neurologist", "Pulmonologist", "General Physician",
        "Internal Medicine", "Dermatologist", "Orthopedist", "Pediatrician",
        "Psychiatrist", "Gastroenterologist", "Endocrinologist", "Ophthalmologist",
        "ENT Specialist", "Urologist", "Oncologist"
    ]
    
    # 15 Major Bangalore Hubs
    areas = [
        "Whitefield", "Koramangala", "Indiranagar", "Jayanagar", "Malleswaram", 
        "HSR Layout", "BTM Layout", "Electronic City", "Marathahalli", "Hebbal",
        "Yelahanka", "Banashankari", "Bellandur", "Rajajinagar", "JP Nagar"
    ]
    
    added_count = 0
    
    # Loop 30 times to create 2 doctors per specialty
    for i in range(30):
        spec = specialties[i // 2]  # Groups them in pairs (0,0, 1,1, 2,2...)
        area = areas[i % 15]        # Distributes them across the 15 areas
        
        # Create a highly readable, predictable email
        safe_spec = spec.lower().replace(" ", "")
        safe_area = area.lower().replace(" ", "")
        email = f"dr.{safe_spec}.{safe_area}@medassist.com"
        
        existing_user = db.query(User).filter(User.email == email).first()
        
        if not existing_user:
            new_doc = User(
                email=email,
                hashed_password=get_password_hash("password123"),
                full_name=f"Dr. {spec} ({area})",
                age=35 + (i % 20),
                gender="Female" if i % 2 == 0 else "Male",
                role="doctor",
                specialization=spec,
                city="Bangalore",
                address=f"{area}, Bangalore",
                is_verified=True
            )
            db.add(new_doc)
            added_count += 1

    db.commit()
    db.close()
    print(f"[OK] Successfully seeded {added_count} verified doctors across 15 specialties into the database!")

if __name__ == "__main__":
    seed_database()
