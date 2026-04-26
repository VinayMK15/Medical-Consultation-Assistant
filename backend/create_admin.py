"""
One-off script: creates admin@medassist.com / admin123 in medical_app.db.
Run from the backend directory:
    python create_admin.py
"""
import sys
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Base, User
from auth_utils import get_password_hash

# Ensure tables exist (no-op if already created)
Base.metadata.create_all(bind=engine)

EMAIL    = "admin@medassist.com"
PASSWORD = "admin123"
NAME     = "Admin"
ROLE     = "admin"

db: Session = SessionLocal()
try:
    existing = db.query(User).filter(User.email == EMAIL).first()
    if existing:
        print(f"[INFO] User '{EMAIL}' already exists (role='{existing.role}'). No changes made.")
        sys.exit(0)

    admin = User(
        email=EMAIL,
        hashed_password=get_password_hash(PASSWORD),
        full_name=NAME,
        role=ROLE,
        is_verified=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    print(f"[OK] Admin account created: id={admin.id}, email={admin.email}, role={admin.role}")
finally:
    db.close()
