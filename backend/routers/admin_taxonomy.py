"""
Admin: symptom mappings and specializations.

Split out of `admin.py`. Route paths are unchanged.

Writing a symptom mapping invalidates the routing cache, because the curated
table is consulted on every extraction and a new row would otherwise not be
visible until a restart.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import schemas
from auth_utils import get_current_admin
from database import get_db
from models import AdminUser, Specialization, SymptomMapping

router = APIRouter(prefix="/api/admin", tags=["Admin - Taxonomy"])


def _invalidate_routing_cache() -> None:
    """
    Rebuild the routing cache after changing a symptom mapping.

    The curated table is read on every extraction, so an added mapping has to
    take effect immediately rather than at the next restart.
    """
    from services import routing

    routing.invalidate_symptom_cache()


# ---------------------------------------------------------------------------
# Symptom mappings
# ---------------------------------------------------------------------------
@router.get("/symptoms", response_model=list[schemas.SymptomMappingResponse])
def list_symptom_mappings(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Every symptom-to-specialist mapping, alphabetically."""
    return db.query(SymptomMapping).order_by(SymptomMapping.symptom.asc()).all()


@router.post(
    "/symptoms",
    response_model=schemas.SymptomMappingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_symptom_mapping(
    payload: schemas.SymptomMappingCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Add a symptom-to-specialist mapping.

    Duplicate detection is case-insensitive, matching the lookup the router
    performs on lower-cased input -- otherwise "Fever" and "fever" could both
    exist and which one won would depend on insertion order.
    """
    existing = (
        db.query(SymptomMapping)
        .filter(SymptomMapping.symptom.ilike(payload.symptom))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Symptom mapping already exists.",
        )

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

    _invalidate_routing_cache()
    return mapping


@router.delete("/symptoms/{symptom_id}")
def delete_symptom_mapping(
    symptom_id: int,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Remove a symptom mapping."""
    mapping = db.query(SymptomMapping).filter(SymptomMapping.id == symptom_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Symptom mapping not found.")

    symptom = mapping.symptom
    db.delete(mapping)
    db.commit()

    _invalidate_routing_cache()
    return {"message": f"Symptom '{symptom}' mapping deleted successfully."}


# ---------------------------------------------------------------------------
# Specializations
# ---------------------------------------------------------------------------
@router.get("/specializations", response_model=list[schemas.SpecializationResponse])
def list_specializations(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Every specialty, alphabetically."""
    return db.query(Specialization).order_by(Specialization.name.asc()).all()


@router.post(
    "/specializations",
    response_model=schemas.SpecializationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_specialization(
    payload: schemas.SpecializationCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Add a specialty. Names are unique, compared case-insensitively."""
    existing = (
        db.query(Specialization).filter(Specialization.name.ilike(payload.name)).first()
    )
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
    """
    Remove a specialty.

    Doctors keep their `specialization` string, so removing a specialty leaves
    them holding a value that no longer matches any row here. That is
    survivable -- the specialty comes from the doctor, not the reverse -- but it
    does mean the taxonomy and the doctor list can drift apart.
    """
    spec = db.query(Specialization).filter(Specialization.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="Specialization not found.")

    name = spec.name
    db.delete(spec)
    db.commit()
    return {"message": f"Specialization '{name}' deleted successfully."}
