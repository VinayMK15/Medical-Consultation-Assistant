from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session

import schemas
from database import get_db
from models import User, Doctor, AdminUser, Appointment, SymptomMapping, Specialization
from auth_utils import get_current_admin, get_password_hash
from services.geo import resolve_coords_sync

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ---------------------------------------------------------------------------
# Doctor Approvals & Management
# ---------------------------------------------------------------------------

@router.get("/pending-doctors")
def get_pending_doctors(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    base_q = db.query(Doctor).filter(Doctor.is_verified == False)
    total = base_q.count()
    doctors = base_q.offset(skip).limit(limit).all()

    return [
        {
            "id": doc.id,
            "email": doc.email,
            "full_name": doc.full_name,
            "name": doc.full_name,
            "specialization": doc.specialization,
            "experience_years": doc.experience_years,
            "qualifications": doc.qualifications,
            "license_number": doc.license_number,
            "phone": doc.phone,
            "city": doc.practice_city,
            "address": doc.practice_address,
            "practice_city": doc.practice_city,
            "practice_address": doc.practice_address,
            "lat": doc.practice_lat,
            "lng": doc.practice_lng,
            "practice_lat": doc.practice_lat,
            "practice_lng": doc.practice_lng,
            "consultation_fee": doc.consultation_fee,
            "bio": doc.bio,
            "shift_start": doc.shift_start,
            "shift_end": doc.shift_end,
            "is_verified": doc.is_verified,
            "is_active": doc.is_active,
            "role": "doctor",
        }
        for doc in doctors
    ]


@router.delete("/reject-doctor/{doctor_id}")
def reject_doctor(
    doctor_id: int,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    # Clean up appointments
    db.query(Appointment).filter(Appointment.doctor_id == doctor_id).delete(synchronize_session=False)
    db.delete(doctor)
    db.commit()

    return {"message": f"Doctor '{doctor.full_name}' has been rejected and removed.", "doctor_id": doctor_id}


@router.put("/approve-doctor/{doctor_id}")
def approve_doctor(
    doctor_id: int,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Sets is_verified=True on Doctor."""
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found.",
        )

    doctor.is_verified = True
    db.commit()
    db.refresh(doctor)

    return {
        "message": f"Doctor '{doctor.full_name}' approved successfully.",
        "doctor_id": doctor.id,
        "is_verified": doctor.is_verified,
    }


# ---------------------------------------------------------------------------
# Unified User Listing
# ---------------------------------------------------------------------------

@router.get("/users")
def get_admin_users(
    role: str,
    is_verified: Optional[bool] = None,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if role == "doctor":
        base_q = db.query(Doctor)
        if is_verified is not None:
            base_q = base_q.filter(Doctor.is_verified == is_verified)
        doctors = base_q.order_by(Doctor.id.desc()).offset(skip).limit(limit).all()
        return [
            {
                "id": doc.id,
                "email": doc.email,
                "full_name": doc.full_name,
                "name": doc.full_name,
                "specialization": doc.specialization,
                "experience_years": doc.experience_years,
                "qualifications": doc.qualifications,
                "license_number": doc.license_number,
                "phone": doc.phone,
                "city": doc.practice_city,
                "address": doc.practice_address,
                "practice_city": doc.practice_city,
                "practice_address": doc.practice_address,
                "lat": doc.practice_lat,
                "lng": doc.practice_lng,
                "practice_lat": doc.practice_lat,
                "practice_lng": doc.practice_lng,
                "consultation_fee": doc.consultation_fee,
                "bio": doc.bio,
                "shift_start": doc.shift_start,
                "shift_end": doc.shift_end,
                "is_verified": doc.is_verified,
                "is_active": doc.is_active,
                "role": "doctor",
            }
            for doc in doctors
        ]

    elif role == "patient":
        base_q = db.query(User)
        patients = base_q.order_by(User.id.desc()).offset(skip).limit(limit).all()
        return [
            {
                "id": p.id,
                "email": p.email,
                "full_name": p.full_name,
                "name": p.full_name,
                "age": p.age,
                "gender": p.gender,
                "phone": p.phone,
                "city": p.home_city,
                "address": p.home_address,
                "home_city": p.home_city,
                "home_address": p.home_address,
                "lat": p.home_lat,
                "lng": p.home_lng,
                "home_lat": p.home_lat,
                "home_lng": p.home_lng,
                "role": "patient",
            }
            for p in patients
        ]

    elif role in ["admin", "superadmin"]:
        admins = db.query(AdminUser).order_by(AdminUser.id.desc()).offset(skip).limit(limit).all()
        return [
            {
                "id": a.id,
                "email": a.email,
                "full_name": a.full_name,
                "role": a.role,
                "is_active": a.is_active,
            }
            for a in admins
        ]

    return []


# ---------------------------------------------------------------------------
# Platform Stats
# ---------------------------------------------------------------------------

@router.get("/stats")
def get_admin_stats(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    pending_count = db.query(Doctor).filter(Doctor.is_verified == False).count()
    active_count = db.query(Doctor).filter(Doctor.is_verified == True).count()
    patient_count = db.query(User).count()

    return {
        "pending_doctors": pending_count,
        "active_doctors": active_count,
        "total_patients": patient_count,
    }


# ---------------------------------------------------------------------------
# CRUD User Management
# ---------------------------------------------------------------------------

@router.post("/users", status_code=status.HTTP_201_CREATED)
def admin_create_user(
    payload: Dict[str, Any],
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    role = payload.get("role", "patient")
    email = payload.get("email")
    password = payload.get("password")
    full_name = payload.get("full_name")

    if not email or not password or not full_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="email, password, and full_name are required.",
        )

    hashed_pw = get_password_hash(password)

    if role == "doctor":
        existing = db.query(Doctor).filter(Doctor.email == email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Doctor with this email already exists.")

        city = payload.get("practice_city") or payload.get("city")
        address = payload.get("practice_address") or payload.get("address")
        lat, lng = resolve_coords_sync(city=city, address=address)

        new_doc = Doctor(
            email=email,
            hashed_password=hashed_pw,
            full_name=full_name,
            specialization=payload.get("specialization", "General Physician"),
            experience_years=payload.get("experience_years", 0),
            qualifications=payload.get("qualifications"),
            license_number=payload.get("license_number"),
            phone=payload.get("phone"),
            practice_city=city,
            practice_address=address,
            practice_lat=lat,
            practice_lng=lng,
            consultation_fee=payload.get("consultation_fee", 0.0),
            bio=payload.get("bio"),
            shift_start=payload.get("shift_start", "09:00"),
            shift_end=payload.get("shift_end", "17:00"),
            is_verified=True,  # Admin-created doctors are auto-verified
            is_active=True,
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        return {
            "id": new_doc.id,
            "email": new_doc.email,
            "full_name": new_doc.full_name,
            "role": "doctor",
            "is_verified": new_doc.is_verified,
        }

    elif role == "patient":
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Patient with this email already exists.")

        city = payload.get("home_city") or payload.get("city")
        address = payload.get("home_address") or payload.get("address")
        lat, lng = resolve_coords_sync(city=city, address=address)

        new_user = User(
            email=email,
            hashed_password=hashed_pw,
            full_name=full_name,
            age=payload.get("age"),
            gender=payload.get("gender"),
            phone=payload.get("phone"),
            home_city=city,
            home_address=address,
            home_lat=lat,
            home_lng=lng,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return {
            "id": new_user.id,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": "patient",
        }

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported role '{role}'.")


@router.put("/users/{user_id}")
def admin_update_user(
    user_id: int,
    payload: Dict[str, Any],
    role: Optional[str] = Query(None),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    target_role = role or payload.get("role")

    # If role not specified, look in Doctor first, then User
    if target_role == "doctor" or target_role is None:
        doc = db.query(Doctor).filter(Doctor.id == user_id).first()
        if doc:
            if "email" in payload and payload["email"]:
                doc.email = payload["email"]
            if "password" in payload and payload["password"]:
                doc.hashed_password = get_password_hash(payload["password"])
            if "full_name" in payload and payload["full_name"] is not None:
                doc.full_name = payload["full_name"]
            if "specialization" in payload and payload["specialization"] is not None:
                doc.specialization = payload["specialization"]
            if "experience_years" in payload and payload["experience_years"] is not None:
                doc.experience_years = payload["experience_years"]
            if "qualifications" in payload:
                doc.qualifications = payload["qualifications"]
            if "license_number" in payload:
                doc.license_number = payload["license_number"]
            if "phone" in payload:
                doc.phone = payload["phone"]
            if "practice_city" in payload or "city" in payload:
                doc.practice_city = payload.get("practice_city") or payload.get("city")
            if "practice_address" in payload or "address" in payload:
                doc.practice_address = payload.get("practice_address") or payload.get("address")
            if "is_verified" in payload and payload["is_verified"] is not None:
                doc.is_verified = payload["is_verified"]
            if "is_active" in payload and payload["is_active"] is not None:
                doc.is_active = payload["is_active"]
            if "shift_start" in payload and payload["shift_start"]:
                doc.shift_start = payload["shift_start"]
            if "shift_end" in payload and payload["shift_end"]:
                doc.shift_end = payload["shift_end"]

            db.commit()
            db.refresh(doc)
            return {
                "id": doc.id,
                "email": doc.email,
                "full_name": doc.full_name,
                "role": "doctor",
                "is_verified": doc.is_verified,
            }

    if target_role == "patient" or target_role is None:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            if "email" in payload and payload["email"]:
                user.email = payload["email"]
            if "password" in payload and payload["password"]:
                user.hashed_password = get_password_hash(payload["password"])
            if "full_name" in payload and payload["full_name"] is not None:
                user.full_name = payload["full_name"]
            if "age" in payload:
                user.age = payload["age"]
            if "gender" in payload:
                user.gender = payload["gender"]
            if "phone" in payload:
                user.phone = payload["phone"]
            if "home_city" in payload or "city" in payload:
                user.home_city = payload.get("home_city") or payload.get("city")
            if "home_address" in payload or "address" in payload:
                user.home_address = payload.get("home_address") or payload.get("address")

            db.commit()
            db.refresh(user)
            return {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": "patient",
            }

    raise HTTPException(status_code=404, detail="User not found.")


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    role: Optional[str] = Query(None),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if role == "doctor" or role is None:
        doc = db.query(Doctor).filter(Doctor.id == user_id).first()
        if doc:
            db.query(Appointment).filter(Appointment.doctor_id == user_id).delete(synchronize_session=False)
            db.delete(doc)
            db.commit()
            return {"message": f"Doctor '{doc.full_name}' was successfully deleted.", "user_id": user_id}

    if role == "patient" or role is None:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            db.query(Appointment).filter(Appointment.patient_id == user_id).delete(synchronize_session=False)
            db.delete(user)
            db.commit()
            return {"message": f"Patient '{user.full_name}' was successfully deleted.", "user_id": user_id}

    raise HTTPException(status_code=404, detail="User not found.")


# ---------------------------------------------------------------------------
# Symptom Mapping Endpoints
# ---------------------------------------------------------------------------

@router.get("/symptoms", response_model=List[schemas.SymptomMappingResponse])
def list_symptom_mappings(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(SymptomMapping).order_by(SymptomMapping.symptom.asc()).all()


@router.post("/symptoms", response_model=schemas.SymptomMappingResponse, status_code=status.HTTP_201_CREATED)
def create_symptom_mapping(
    payload: schemas.SymptomMappingCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(SymptomMapping).filter(SymptomMapping.symptom.ilike(payload.symptom)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Symptom mapping already exists.")

    mapping = SymptomMapping(
        symptom=payload.symptom.lower().strip(),
        specialist=payload.specialist.strip(),
        urgency=payload.urgency or "medium",
        is_custom=payload.is_custom if payload.is_custom is not None else True,
        added_by=current_admin.email,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)

    from main import invalidate_symptom_cache
    invalidate_symptom_cache()

    return mapping


@router.delete("/symptoms/{symptom_id}")
def delete_symptom_mapping(
    symptom_id: int,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    mapping = db.query(SymptomMapping).filter(SymptomMapping.id == symptom_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Symptom mapping not found.")

    db.delete(mapping)
    db.commit()

    from main import invalidate_symptom_cache
    invalidate_symptom_cache()

    return {"message": f"Symptom '{mapping.symptom}' mapping deleted successfully."}


# ---------------------------------------------------------------------------
# Specialization Endpoints
# ---------------------------------------------------------------------------

@router.get("/specializations", response_model=List[schemas.SpecializationResponse])
def list_specializations(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(Specialization).order_by(Specialization.name.asc()).all()


@router.post("/specializations", response_model=schemas.SpecializationResponse, status_code=status.HTTP_201_CREATED)
def create_specialization(
    payload: schemas.SpecializationCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(Specialization).filter(Specialization.name.ilike(payload.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Specialization already exists.")

    spec = Specialization(
        name=payload.name.strip(),
        description=payload.description,
        common_conditions=payload.common_conditions or [],
    )
    db.add(spec)
    db.commit()
    db.refresh(spec)
    return spec


@router.delete("/specializations/{spec_id}")
def delete_specialization(
    spec_id: int,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    spec = db.query(Specialization).filter(Specialization.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Specialization not found.")

    db.delete(spec)
    db.commit()
    return {"message": f"Specialization '{spec.name}' deleted successfully."}
