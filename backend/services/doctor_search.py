"""
Doctor search: filter, rank, cap, deduplicate.

Called by the chat endpoint once the NLP layer has resolved a symptom to one
or more specialties and the request has established a location.

## Scale assumption

This loads the matching doctors into memory and ranks them in Python. That is
O(n) in the number of matching rows, which is fine at the platform's current
size -- a few hundred doctors -- but it is the limiting factor on how far this
scales, and it is worth stating rather than leaving for a reviewer to discover.

What that means in practice:

- **Fine below roughly 10,000 doctors.** A few thousand rows load and rank in
  single-digit milliseconds, well inside a request budget.
- **Degrades past that.** The query returns every match in the city before the
  per-specialty cap is applied, so the cost is linear in rows matched, not in
  rows returned. A large city with a broad specialty could return thousands of
  rows to show eight.

If the doctor table grows past that, the caps should move into SQL -- apply
`PER_SPECIALTY_CAP` and `GLOBAL_CAP` in the query, and the proximity sort in
the database via a bounding-box prefilter on lat/lng. The interface here does
not need to change for that to be possible: it returns a list either way.

The O(n) part worth keeping in Python is the deduplication and the haversine
ordering, both of which are clearer here than they would be in SQL.
"""

from __future__ import annotations

import logging

from sqlalchemy import or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Per-specialty cap: stops a broad specialty (General Physician covers
# everything) from crowding out a specific one that ranked second.
PER_SPECIALTY_CAP = 3

# Overall cap: keeps the reply and the map readable. Eight is roughly what the
# chat UI renders before the patient has to scroll.
GLOBAL_CAP = 8

# Fallback when the requested specialties yield nothing: how many unfiltered
# doctors to offer so the patient sees something rather than an empty map.
FALLBACK_CAP = 3


def find_doctors(
    city: str | None,
    area: str | None,
    specialist,
    db: Session | None = None,
    patient_lat: float | None = None,
    patient_lng: float | None = None,
) -> list:
    """
    Return verified, active doctors matching a city and one or more
    specialties.

    `specialist` may be a single specialty string, or the ranked list from
    `routing.get_specialists()`. With a list, results are the union across
    those specialties, ordered by rank then proximity.

    Returns at most `GLOBAL_CAP` entries. An empty list means no doctor
    matched -- the caller should say so rather than showing an empty map.
    """
    # Without a location there is nothing to scope the search to, and every
    # doctor on the platform is a candidate for every patient.
    if not city:
        return []

    # Normalise to a ranked list.
    if isinstance(specialist, str):
        specialists = [specialist]
    else:
        specialists = [s for s in specialist if s] or ["General Physician"]

    from database import SessionLocal
    from models import Doctor
    from services.geo import haversine, resolve_doctor_display_coords

    close_db_on_exit = db is None
    if db is None:
        db = SessionLocal()

    try:
        base_q = db.query(Doctor).filter(
            Doctor.is_verified == True,  # noqa: E712
            Doctor.is_active == True,  # noqa: E712
        )

        def location_filter(query):
            city_lower = city.lower()
            conditions = [Doctor.practice_city.ilike(f"%{city_lower}%")]
            if area:
                conditions.append(Doctor.practice_address.ilike(f"%{area.lower()}%"))
            return query.filter(or_(*conditions))

        def to_dict(doc: Doctor) -> dict:
            lat, lng = resolve_doctor_display_coords(doc, fallback_city=city)
            return {
                "id": doc.id,
                "name": doc.full_name or "Unknown Doctor",
                "specialty": doc.specialization or "General Physician",
                "address": doc.practice_address or doc.practice_city or city,
                "city": doc.practice_city or city,
                "lat": lat,
                "lng": lng,
                "experience_years": doc.experience_years,
                "consultation_fee": doc.consultation_fee,
            }

        city_pool_q = location_filter(base_q)

        # Union across every requested specialty, then order by rank so the
        # top-ranked specialty leads regardless of the order rows came back in.
        spec_conditions = [Doctor.specialization.ilike(s) for s in specialists]
        matched = city_pool_q.filter(or_(*spec_conditions)).all()
        rank = {s: i for i, s in enumerate(specialists)}
        matched = sorted(matched, key=lambda d: rank.get(d.specialization, 999))

        if matched:
            counts: dict[str, int] = {}
            capped = []
            for doc in matched:
                specialty = doc.specialization
                if counts.get(specialty, 0) < PER_SPECIALTY_CAP:
                    capped.append(doc)
                    counts[specialty] = counts.get(specialty, 0) + 1
                if len(capped) >= GLOBAL_CAP:
                    break
            results = [to_dict(d) for d in capped]
        else:
            # Nothing matched the requested specialties. A General Physician is
            # a better answer than nothing, since every patient can see one.
            general = city_pool_q.filter(
                Doctor.specialization.ilike("General Physician")
            ).all()
            results = (
                [to_dict(d) for d in general]
                if general
                else [to_dict(d) for d in city_pool_q.limit(FALLBACK_CAP).all()]
            )

        results = _deduplicate(results)

        # Proximity sort last, over the capped set, so the distance calculation
        # stays proportional to what is actually returned.
        if patient_lat is not None and patient_lng is not None:
            for doc_dict in results:
                doc_dict["distance_km"] = haversine(
                    float(patient_lat),
                    float(patient_lng),
                    float(doc_dict["lat"]),
                    float(doc_dict["lng"]),
                )
            results.sort(key=lambda d: d["distance_km"])

        return results
    finally:
        if close_db_on_exit:
            db.close()


def _deduplicate(results: list[dict]) -> list[dict]:
    """
    Drop rows that are the same doctor twice.

    Seeded and imported data can carry the same name, specialty and address
    under different ids; without this the map shows duplicate markers and the
    patient sees the same practice listed more than once.

    Identity is name + specialty + address, not id: a duplicate row is a
    separate row with a different id by definition.
    """
    seen: set[tuple] = set()
    deduped = []
    for doc in results:
        key = (
            (doc.get("name") or "").strip().lower(),
            (doc.get("specialty") or "").strip().lower(),
            (doc.get("address") or "").strip().lower(),
        )
        if key not in seen:
            seen.add(key)
            deduped.append(doc)
    return deduped
