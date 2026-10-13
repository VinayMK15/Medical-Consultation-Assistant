"""Create or reset the local development admin account."""
from sqlalchemy.orm import Session

from auth_utils import get_password_hash
from database import SessionLocal, engine
from models import AdminUser, Base

# Ensure tables exist (no-op if already created)
Base.metadata.create_all(bind=engine)

EMAIL    = "admin@medassist.com"
PASSWORD = "admin123"
NAME     = "Admin"
ROLE = "admin"

db: Session = SessionLocal()
try:
    existing = db.query(AdminUser).filter(AdminUser.email == EMAIL).first()
    if existing:
        existing.hashed_password = get_password_hash(PASSWORD)
        existing.full_name = NAME
        existing.role = ROLE
        existing.is_active = True
        db.commit()
        print(f"[OK] Admin account reset: id={existing.id}, email={existing.email}, role={existing.role}")
    else:
        admin = AdminUser(
            email=EMAIL,
            hashed_password=get_password_hash(PASSWORD),
            full_name=NAME,
            role=ROLE,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        print(f"[OK] Admin account created: id={admin.id}, email={admin.email}, role={admin.role}")

finally:
    db.close()
