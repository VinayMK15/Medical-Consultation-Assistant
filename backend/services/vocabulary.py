"""
The symptom and city vocabularies, and the logic that builds them.

Two things live here rather than in `nlp_processor`:

1. **The data.** Static aliases -- city names, regional-script city names --
   and the regional vocabulary loaded from the database.

2. **The loading.** Every vocabulary is built by an explicit `warm*` call
   rather than at import time.

Why that matters: `nlp_processor` used to call `_load_symptom_keywords()` at
module scope, which opened a database connection during `import`. That broke
three things quietly rather than loudly:

- a read-only replica, where the write of a learned symptom cannot happen
- a worker process that starts before migrations have run
- every test, which had to clear the module globals by hand afterwards

Now nothing touches the database until `warm_all()` is called from the FastAPI
lifespan handler, or `warm_*` is called directly. A caller that forgets gets an
empty vocabulary and the regex fallback degrades to "General Physician" -- a
visible, logged failure rather than an import-time connection attempt.

The vocabularies are cached in module globals because they are read on every
extraction and rebuilt only when the underlying data changes. `invalidate()`
drops them; `warm_all()` rebuilds.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# City aliases (static)
# ---------------------------------------------------------------------------
# Lower-cased raw text -> canonical display name. Includes both city names and
# neighbourhood names, because a patient says "Whitefield" far more often than
# "Bangalore", and both have to resolve to the same place for `find_doctors` to
# match the doctors seeded there.
_CITY_ALIASES: dict[str, str] = {
    # Major cities
    "bangalore": "Bangalore",
    "bengaluru": "Bangalore",
    "mumbai": "Mumbai",
    "bombay": "Mumbai",
    "delhi": "Delhi",
    "new delhi": "Delhi",
    "chennai": "Chennai",
    "madras": "Chennai",
    "kolkata": "Kolkata",
    "calcutta": "Kolkata",
    "hyderabad": "Hyderabad",
    "pune": "Pune",
    "ahmedabad": "Ahmedabad",
    "jaipur": "Jaipur",
    "surat": "Surat",
    "lucknow": "Lucknow",
    "kanpur": "Kanpur",
    "nagpur": "Nagpur",
    "indore": "Indore",
    "bhopal": "Bhopal",
    "london": "London",
    "new york": "New York",
    # Bangalore neighbourhoods
    "whitefield": "Bangalore",
    "koramangala": "Bangalore",
    "indiranagar": "Bangalore",
    "jayanagar": "Bangalore",
    "malleswaram": "Bangalore",
    "hsr layout": "Bangalore",
    "btm layout": "Bangalore",
    "electronic city": "Bangalore",
    "marathahalli": "Bangalore",
    "hebbal": "Bangalore",
    "yelahanka": "Bangalore",
    "banashankari": "Bangalore",
    "bellandur": "Bangalore",
    "rajajinagar": "Bangalore",
    "jp nagar": "Bangalore",
    # Mumbai neighbourhoods
    "bandra": "Mumbai",
    "andheri": "Mumbai",
    "worli": "Mumbai",
    "dadar": "Mumbai",
    "powai": "Mumbai",
    "juhu": "Mumbai",
    "malad": "Mumbai",
    "vashi": "Mumbai",
}


# ---------------------------------------------------------------------------
# Regional-script city aliases (static)
# ---------------------------------------------------------------------------
# Native-script city names -> the same canonical values _CITY_ALIASES uses.
# Without these, a patient who says their area in Hindi gets symptom matching
# but is then asked for their location anyway, because the city never
# resolves.
_REGIONAL_CITY_ALIASES: dict[str, list[tuple[str, str]]] = {
    "hi": [
        ("बेंगलूरू", "Bangalore"),
        ("बैंगलोर", "Bangalore"),
        ("बंगळूरु", "Bangalore"),
        ("व्हाइटफील्ड", "Bangalore"),
        ("कोरमंगला", "Bangalore"),
        ("इंदिरानगर", "Bangalore"),
        ("जयनगर", "Bangalore"),
        ("मुंबई", "Mumbai"),
        ("मुम्बई", "Mumbai"),
        ("दिल्ली", "Delhi"),
        ("चेन्नई", "Chennai"),
        ("कोलकाता", "Kolkata"),
        ("हैदराबाद", "Hyderabad"),
        ("पुणे", "Pune"),
    ],
    "ta": [
        ("பெங்கலூர்", "Bangalore"),
        ("பெங்களூர்", "Bangalore"),
        ("மும்பை", "Mumbai"),
        ("டெல்லி", "Delhi"),
        ("சென்னை", "Chennai"),
    ],
    "te": [
        ("బెంగళూరు", "Bangalore"),
        ("ముంబై", "Mumbai"),
        ("దిల్లీ", "Delhi"),
        ("చెన్నై", "Chennai"),
    ],
    "kn": [
        ("ಬೆಂಗಳೂರು", "Bangalore"),
        ("ಮುಂಬೈ", "Mumbai"),
        ("ದೆಹಲಿ", "Delhi"),
        ("ಚೆನ್ನೈ", "Chennai"),
    ],
    "ml": [
        ("ബംഗളൂരു", "Bangalore"),
        ("മുംബൈ", "Mumbai"),
        ("ഡൽഹി", "Delhi"),
        ("ചെന്നൈ", "Chennai"),
    ],
    "mr": [
        ("बेंगळुरू", "Bangalore"),
        ("मुंबई", "Mumbai"),
        ("दिल्ली", "Delhi"),
        ("चेन्नई", "Chennai"),
    ],
    "bn": [
        ("বেঙ্গালুরু", "Bangalore"),
        ("মুম্বাই", "Mumbai"),
        ("দিল্লি", "Delhi"),
        ("চেন্নাই", "Chennai"),
    ],
    "gu": [
        ("બેંગલુરુ", "Bangalore"),
        ("મુંબઈ", "Mumbai"),
        ("દિલ્હી", "Delhi"),
        ("ચેન્નઈ", "Chennai"),
    ],
    "pa": [
        ("ਬੰਗਲੂਰੂ", "Bangalore"),
        ("ਮੁੰਬਈ", "Mumbai"),
        ("ਦਿੱਲੀ", "Delhi"),
        ("ਚੈਨਈ", "Chennai"),
    ],
}


# ---------------------------------------------------------------------------
# Database-backed vocabularies (cached)
# ---------------------------------------------------------------------------
# Symptom keyword -> canonical symptom, longest first so greedy matching picks
# the most specific term. Built from three tables:
#   symptom_mappings.symptom     curated canonical forms
#   condition_symptoms.symptom   reference dataset phrases
#   symptom_aliases.alias        alternative phrasings -> canonical
_symptom_keywords: list[tuple[str, str]] = []

# Language -> [(regional term, canonical symptom)], each list longest-first.
# Loaded from regional_symptom_keywords. The offline fallback vocabulary, so a
# voice input in a regional script still routes when translation is
# unavailable.
_regional_symptom_keywords: dict[str, list[tuple[str, str]]] = {}

# Distinct symptom phrases from condition_symptoms, longest-first. The richest
# vocabulary and the last matching tier.
_dataset_symptoms: list[str] = []


# ---------------------------------------------------------------------------
# Accessors
# ---------------------------------------------------------------------------
def symptom_keywords() -> list[tuple[str, str]]:
    return _symptom_keywords


def regional_symptom_keywords() -> dict[str, list[tuple[str, str]]]:
    return _regional_symptom_keywords


def dataset_symptoms() -> list[str]:
    return _dataset_symptoms


def city_aliases() -> dict[str, str]:
    """City and neighbourhood aliases, lower-cased key -> canonical name."""
    return _CITY_ALIASES


def regional_city_aliases() -> dict[str, list[tuple[str, str]]]:
    return _REGIONAL_CITY_ALIASES


def add_symptom_keyword(keyword: str, canonical: str) -> None:
    """
    Insert a newly learned keyword, keeping the longest-first ordering.

    `record_learned_symptom` calls this after persisting a mapping the NLP
    layer discovered, so the next extraction can match it without waiting for
    a restart.
    """
    global _symptom_keywords
    lowered = keyword.lower().strip()
    if not lowered:
        return
    if any(kw == lowered for kw, _ in _symptom_keywords):
        return
    _symptom_keywords.append((lowered, canonical))
    _symptom_keywords.sort(key=lambda pair: len(pair[0]), reverse=True)


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def warm_symptom_keywords() -> int:
    """
    Build the English symptom vocabulary. Returns the number of entries.

    Uses raw SQL rather than the ORM: importing `models` inside this function
    would re-run the declarative base against already-registered metadata.
    """
    global _symptom_keywords

    from database import engine

    pairs: list[tuple[str, str]] = []

    with engine.connect() as conn:
        # Canonical forms: each maps to itself.
        for table in ("symptom_mappings", "condition_symptoms"):
            for row in conn.exec_driver_sql(
                f"SELECT DISTINCT symptom FROM {table} WHERE symptom IS NOT NULL"
            ):
                symptom = row[0].lower().strip()
                if symptom:
                    pairs.append((symptom, symptom))

        # Aliases: the pairs where the two sides differ, e.g.
        # ("blood pressure", "hypertension"). Without these a patient saying
        # "blood pressure" matches nothing and is routed to a General
        # Physician.
        for row in conn.exec_driver_sql("SELECT alias, canonical FROM symptom_aliases"):
            alias = row[0].lower().strip()
            canonical = row[1].lower().strip()
            if alias and canonical:
                pairs.append((alias, canonical))

    # Dedupe on the keyword, then longest-first for greedy matching.
    seen: set[str] = set()
    unique: list[tuple[str, str]] = []
    for keyword, canonical in pairs:
        if keyword not in seen:
            seen.add(keyword)
            unique.append((keyword, canonical))

    _symptom_keywords = sorted(unique, key=lambda pair: len(pair[0]), reverse=True)
    return len(_symptom_keywords)


def warm_regional_keywords() -> int:
    """
    Build the regional symptom vocabulary. Returns the total term count.

    Longest-first within each language, matching the greedy matching the
    English tier uses.
    """
    global _regional_symptom_keywords

    from database import engine

    with engine.connect() as conn:
        rows = conn.exec_driver_sql(
            "SELECT language, regional_term, english_canonical "
            "FROM regional_symptom_keywords"
        ).all()

    regional: dict[str, list[tuple[str, str]]] = {}
    for language, term, canonical in rows:
        regional.setdefault(language, []).append((term, canonical))

    for language in regional:
        regional[language].sort(key=lambda pair: len(pair[0]), reverse=True)

    _regional_symptom_keywords = regional
    return sum(len(terms) for terms in regional.values())


def warm_dataset_symptoms() -> int:
    """Build the reference-dataset symptom list. Returns the phrase count."""
    global _dataset_symptoms

    from database import engine

    with engine.connect() as conn:
        rows = conn.exec_driver_sql(
            "SELECT DISTINCT symptom FROM condition_symptoms WHERE symptom IS NOT NULL"
        ).all()

    _dataset_symptoms = sorted(
        (row[0].lower().strip() for row in rows if row[0]),
        key=len,
        reverse=True,
    )
    return len(_dataset_symptoms)


def warm_all(db: object | None = None) -> dict[str, int]:
    """
    Build every database-backed vocabulary.

    Called from the FastAPI lifespan handler at startup. `db` is accepted for
    symmetry with the other loaders and so a caller holding a session can pass
    it; the raw-SQL loaders use the engine instead, because importing `models`
    inside this function would collide with registered metadata.

    A failure in any one vocabulary is logged and swallowed rather than
    aborting startup: a missing regional table degrades regional matching, but
    the English path still works, and refusing to boot would be worse.
    """
    counts: dict[str, int] = {}

    for name, loader in (
        ("symptom_keywords", warm_symptom_keywords),
        ("regional_symptom_keywords", warm_regional_keywords),
        ("dataset_symptoms", warm_dataset_symptoms),
    ):
        try:
            counts[name] = loader()
        except Exception as exc:
            counts[name] = 0
            logger.warning("Could not load %s: %s", name, exc)

    logger.info(
        "Vocabulary warmed: %d symptom keywords, %d regional terms, "
        "%d dataset phrases.",
        counts["symptom_keywords"],
        counts["regional_symptom_keywords"],
        counts["dataset_symptoms"],
    )
    return counts


def invalidate() -> None:
    """
    Drop every database-backed vocabulary.

    The next access rebuilds it. Used by tests, and by admin routes that change
    the underlying rows.
    """
    global _symptom_keywords, _regional_symptom_keywords, _dataset_symptoms
    _symptom_keywords = []
    _regional_symptom_keywords = {}
    _dataset_symptoms = []


def ensure_loaded() -> None:
    """
    Build any vocabulary that is still empty.

    The safety net for a caller that reached the extraction path without going
    through `warm_all` -- a worker, a script, a test. Loading on demand rather
    than at import is what lets this exist without reintroducing the original
    problem.
    """
    if not _symptom_keywords:
        try:
            warm_symptom_keywords()
        except Exception as exc:
            logger.warning("Could not load symptom keywords: %s", exc)
    if not _regional_symptom_keywords:
        try:
            warm_regional_keywords()
        except Exception as exc:
            logger.warning("Could not load regional keywords: %s", exc)
