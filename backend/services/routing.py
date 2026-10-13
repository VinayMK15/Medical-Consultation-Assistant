"""
Symptom-to-specialist routing.

Answers one question: given what a patient described, which specialties should
be recommended? Two tiers:

- **Single symptom** resolves through `symptom_mappings`, the curated table.
  Authoritative and hand-maintained, so a one-symptom description is never
  second-guessed by scoring.
- **Multiple symptoms** score the whole set against `condition_symptoms` with
  inverse-document-frequency weighting. This is what resolves "fever and cough",
  where the curated table has a row for each symptom separately and no way to
  arbitrate between them.

The IDF weighting matters because symptom specificity varies enormously.
"Fever" appears in a large share of the dataset's diseases and carries almost
no diagnostic signal; "cyanosis" appears in few and points somewhere specific.
Scoring on raw frequency would rank the common symptoms highest, which is
exactly backwards.

Nothing here reads the database at import time. The caches are built by
`warm_caches()`, called from the FastAPI lifespan handler.
"""

from __future__ import annotations

import collections
import logging
import math
import re
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

GENERAL_PHYSICIAN = "General Physician"


# ---------------------------------------------------------------------------
# Caches
# ---------------------------------------------------------------------------
# Curated symptom -> specialist, lower-cased. Read on every lookup.
_symptom_cache: dict[str, str] = {}

# Alternative phrasing -> canonical symptom, so "blood pressure" resolves to
# "hypertension" even when the LLM extracts the alias rather than the
# canonical form.
_alias_cache: dict[str, str] = {}

# The IDF index built from condition_symptoms. Shape:
#   df:           symptom -> number of diseases mentioning it
#   sym_spec:     symptom -> specialties whose diseases mention it
#   spec_diseases: specialty -> the diseases it covers
#   n_diseases:   total distinct diseases, the IDF denominator
_condition_index: dict[str, Any] = {}

# Specialties with at least one verified, active doctor. A dataset specialty
# with no doctors can never return a result, so it is excluded from ranking.
_available_specialties: set[str] = set()


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def load_symptom_cache(db: Session | None = None) -> int:
    """Build the curated symptom cache. Returns the number of entries."""
    global _symptom_cache

    from database import SessionLocal
    from models import SymptomMapping

    close_db = db is None
    if db is None:
        db = SessionLocal()
    try:
        mappings = db.query(SymptomMapping).all()
        _symptom_cache = {
            str(m.symptom).lower().strip(): str(m.specialist) for m in mappings
        }
        logger.info("Loaded %d symptom mappings into cache.", len(_symptom_cache))
        return len(_symptom_cache)
    except Exception as exc:
        logger.warning("Could not load symptom cache from DB: %s", exc)
        return 0
    finally:
        if close_db:
            db.close()


def load_alias_cache(db: Session | None = None) -> int:
    """Build the alias cache. Returns the number of entries."""
    global _alias_cache

    from database import SessionLocal
    from models import SymptomAlias

    close_db = db is None
    if db is None:
        db = SessionLocal()
    try:
        rows = db.query(SymptomAlias).all()
        _alias_cache = {
            r.alias.lower().strip(): r.canonical.lower().strip() for r in rows
        }
        logger.info("Loaded %d symptom aliases into cache.", len(_alias_cache))
        return len(_alias_cache)
    except Exception as exc:
        logger.warning("Could not load alias cache from DB: %s", exc)
        return 0
    finally:
        if close_db:
            db.close()


def build_condition_index(db: Session | None = None) -> int:
    """
    Build the IDF index from `condition_symptoms`. Returns the symptom count.

    Also collects the specialties that currently have a bookable doctor, which
    ranking filters against: recommending a Nephrologist when no nephrologist
    is on the platform is a worse answer than recommending nothing.
    """
    global _condition_index, _available_specialties

    from database import SessionLocal
    from models import ConditionSymptom, Doctor

    close_db = db is None
    if db is None:
        db = SessionLocal()
    try:
        rows = db.query(ConditionSymptom).all()

        df: dict[str, int] = collections.Counter()
        sym_spec: dict[str, set] = collections.defaultdict(set)
        spec_diseases: dict[str, set] = collections.defaultdict(set)
        diseases: set[str] = set()

        for row in rows:
            symptom = row.symptom.lower().strip()
            specialty = row.specialist.strip()
            disease = row.disease.lower().strip()
            if not symptom or not specialty:
                continue
            df[symptom] += 1
            sym_spec[symptom].add(specialty)
            spec_diseases[specialty].add(disease)
            diseases.add(disease)

        _condition_index = {
            "df": df,
            "sym_spec": sym_spec,
            "spec_diseases": spec_diseases,
            "n_diseases": len(diseases),
        }

        specs = (
            db.query(Doctor.specialization)
            .filter(Doctor.is_verified == True, Doctor.is_active == True)  # noqa: E712
            .distinct()
            .all()
        )
        _available_specialties = {row[0] for row in specs if row[0]}

        logger.info(
            "Built condition index: %d symptoms, %d diseases, %d available specialties",
            len(df), len(diseases), len(_available_specialties),
        )
        return len(df)
    except Exception as exc:
        logger.warning("Could not build condition index: %s", exc)
        return 0
    finally:
        if close_db:
            db.close()


def warm_caches(db: Session | None = None) -> None:
    """
    Build every routing cache.

    Called from the FastAPI lifespan handler at startup, and by the tests.
    Each loader swallows its own failure so a missing table degrades one tier
    of routing rather than preventing the app from starting.
    """
    load_symptom_cache(db)
    load_alias_cache(db)
    build_condition_index(db)


def invalidate_symptom_cache() -> None:
    """Reload the curated symptom cache from the database.

    Called by the admin routes after they add or remove a mapping, so the
    change takes effect without waiting for a restart.
    """
    load_symptom_cache()


def ensure_loaded() -> None:
    """
    Build any cache that is still empty.

    The safety net for a caller that reached this module without going through
    `warm_caches` -- a script, a worker, a test.
    """
    if not _symptom_cache:
        load_symptom_cache()
    if not _alias_cache:
        load_alias_cache()
    if not _condition_index:
        build_condition_index()


# ---------------------------------------------------------------------------
# Lookup
# ---------------------------------------------------------------------------
def resolve_alias(symptom: str) -> str:
    """
    Return the canonical form of a symptom, or the input unchanged.

    Exact match on the normalised string, not a substring scan: the caller
    passes an already-extracted short symptom, and a substring match here
    would rewrite unrelated text that merely contains an alias.
    """
    if not symptom:
        return symptom
    if not _alias_cache:
        load_alias_cache()
    return _alias_cache.get(symptom.lower().strip(), symptom)


def save_learned_symptom(symptom: str, specialist: str, added_by: str = "NLP") -> None:
    """
    Persist a symptom mapping the NLP layer discovered, and cache it.

    Only called for symptoms that already match something -- see
    `nlp_processor.record_learned_symptom`, which declines to persist a
    symptom that matches nothing, because doing so would lock in the General
    Physician fallback as if it were a real mapping.
    """
    global _symptom_cache

    from database import SessionLocal
    from models import SymptomMapping

    cleaned = symptom.lower().strip()
    if not cleaned:
        return

    db = SessionLocal()
    try:
        existing = (
            db.query(SymptomMapping).filter(SymptomMapping.symptom == cleaned).first()
        )
        if existing is None:
            db.add(SymptomMapping(
                symptom=cleaned,
                specialist=specialist,
                is_custom=True,
                added_by=added_by,
            ))
            db.commit()
        _symptom_cache[cleaned] = specialist
    except Exception as exc:
        logger.warning("Failed to persist learned symptom %r: %s", symptom, exc)
    finally:
        db.close()


def get_specialist(symptoms: str) -> str:
    """
    Return the single best-matching specialist for a symptom string.

    Scans the curated cache longest-keyword-first, so a specific symptom beats
    a substring of itself. Falls back to General Physician rather than
    guessing.
    """
    if not symptoms:
        return GENERAL_PHYSICIAN

    if not _symptom_cache:
        load_symptom_cache()

    # Resolve aliases first, so "blood pressure" -> "hypertension".
    lowered = resolve_alias(symptoms).lower()

    for keyword in sorted(_symptom_cache, key=len, reverse=True):
        if keyword in lowered:
            return _symptom_cache[keyword]

    return GENERAL_PHYSICIAN


def format_specialists(specialists: list[str]) -> str:
    """
    Format a specialist list for display: 'A', 'A and B', 'A, B and C'.

    Used to build the reply sentence the chat endpoint returns.
    """
    if not specialists:
        return "specialist"
    if len(specialists) == 1:
        return specialists[0]
    if len(specialists) == 2:
        return f"{specialists[0]} and {specialists[1]}"
    return ", ".join(specialists[:-1]) + f" and {specialists[-1]}"


def format_specialists_count(specialists: list[str], count: int) -> str:
    """`format_specialists` output, pluralised when it is a single specialty.

    Pluralising a compound phrase is not meaningful — there is no correct
    plural for "A and B" read as one noun — so multi-specialty and
    zero-specialty results are returned unchanged.
    """
    label = format_specialists(specialists)
    if len(specialists) != 1 or count == 1:
        return label
    if label.endswith("y"):
        return label[:-1] + "ies"
    if label.endswith(("s", "x", "z", "ch", "sh")):
        return label + "es"
    return label + "s"


def _split_symptoms(text: str) -> list[str]:
    """
    Split a symptom string into individual symptoms.

    The LLM returns one string even for multi-symptom input, so split on the
    separators a patient or model actually uses.
    """
    if not text:
        return []
    parts = re.split(r"[,;+]|\band\b", text, flags=re.IGNORECASE)
    return [part.strip().lower() for part in parts if part.strip()]


def get_specialists(symptoms: str) -> list[str]:
    """
    Return a ranked list of specialties for a symptom string.

    One symptom delegates to the curated table. Several score the whole set
    against the condition dataset, which arbitrates conflicts the curated table
    cannot: "fever and cough" should reach Pulmonology rather than whichever
    keyword happens to sort first.

    Always returns at least one entry, so a caller never has to handle an
    empty result.
    """
    if not symptoms:
        return [GENERAL_PHYSICIAN]

    parts = _split_symptoms(symptoms)
    if len(parts) <= 1:
        return [get_specialist(symptoms)]

    if not _condition_index or not _available_specialties:
        return [get_specialist(symptoms)]

    n = _condition_index["n_diseases"]
    df = _condition_index["df"]
    sym_spec = _condition_index["sym_spec"]
    spec_diseases = _condition_index["spec_diseases"]

    scores: dict[str, float] = collections.defaultdict(float)
    for symptom in parts:
        if symptom not in sym_spec:
            continue
        # Inverse disease frequency. A symptom appearing in many diseases
        # ("fever") carries less signal than one appearing in few.
        weight = math.log(n / df[symptom])
        for specialty in sym_spec[symptom]:
            breadth = len(spec_diseases.get(specialty, ()))
            if breadth == 0:
                continue
            # Dampen by breadth, so a specialty covering many diseases for a
            # common symptom does not outrank one that specifically explains
            # it.
            scores[specialty] += weight / math.sqrt(breadth)

    if not scores:
        return [get_specialist(symptoms)]

    ranked = [
        specialty
        for specialty, _score in sorted(scores.items(), key=lambda kv: -kv[1])
        if specialty in _available_specialties
    ]
    return ranked or [get_specialist(symptoms)]
