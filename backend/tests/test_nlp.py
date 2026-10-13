"""
NLP routing: symptom extraction, alias resolution, city normalisation, and the
`/process` chat endpoint.

These run with OLLAMA_ENABLED=false (set in conftest) so the deterministic
regex tier is exercised. That is the tier that must work regardless of whether
a local model is installed.
"""

import pytest

import models
from services.nlp_processor import extract_medical_info, normalize_city

# A minimal vocabulary so the regex tier has something to match. In production
# these rows come from the seed scripts; the test database starts empty.
SEED_SYMPTOMS = [
    ("chest pain", "Cardiologist", "high"),
    ("headache", "Neurology", "medium"),
    ("fever", "General Physician", "low"),
    ("skin rash", "Dermatology", "medium"),
    ("abdominal pain", "Gastroenterology", "medium"),
    ("cough", "Pulmonology", "low"),
]


def _reload_all_caches(db):
    """
    Rebuild every in-memory cache from the test database.

    Both the vocabularies and the routing tables are process-wide caches now
    built by an explicit warm call rather than at import time. Reloading them
    is what lets these tests seed data and then assert on the routing result.
    """
    from services import routing, vocabulary

    vocabulary.warm_all()
    routing.warm_caches(db)


@pytest.fixture(autouse=True)
def warm_caches(db):
    """Seed the vocabulary and rebuild caches before and after each test."""
    for symptom, specialist, urgency in SEED_SYMPTOMS:
        db.add(models.SymptomMapping(symptom=symptom, specialist=specialist, urgency=urgency))
    db.commit()

    _reload_all_caches(db)
    yield
    _reload_all_caches(db)


# ---------------------------------------------------------------------------
# Single-symptom routing via the curated mapping table
# ---------------------------------------------------------------------------
class TestSymptomRouting:
    # These rely on the vocabulary the autouse fixture seeds, so they do not
    # insert their own rows -- `symptom` is uniquely indexed.

    def test_known_symptom_routes_to_its_specialist(self):
        import main
        assert main.get_specialist("I have chest pain") == "Cardiologist"

    def test_matching_is_case_insensitive(self):
        import main
        assert main.get_specialist("CHEST PAIN") == "Cardiologist"

    def test_symptom_embedded_in_a_sentence_matches(self):
        import main
        assert main.get_specialist("severe headache since morning") == "Neurology"

    def test_unknown_symptom_falls_back_to_general(self):
        import main
        assert main.get_specialist("something entirely unrelated") == "General Physician"

    def test_empty_input_returns_general(self):
        import main
        assert main.get_specialist("") == "General Physician"
        assert main.get_specialist(None) == "General Physician"

    def test_longest_symptom_wins(self, db):
        """
        The cache is scanned longest-keyword-first, so a more specific
        symptom must beat a substring of it.
        """
        db.add(models.SymptomMapping(symptom="pain", specialist="General Physician"))
        db.commit()
        _reload_all_caches(db)

        import main
        assert main.get_specialist("severe chest pain") == "Cardiologist"


# ---------------------------------------------------------------------------
# Alias resolution
# ---------------------------------------------------------------------------
class TestAliasResolution:
    def test_alias_maps_to_canonical_symptom(self, db):
        db.add(models.SymptomAlias(alias="blood pressure", canonical="hypertension"))
        db.add(models.SymptomMapping(symptom="hypertension", specialist="Cardiologist"))
        db.commit()
        _reload_all_caches(db)

        import main
        # "blood pressure" is not itself a mapping, but resolves to one.
        assert main.get_specialist("blood pressure") == "Cardiologist"

    def test_alias_resolution_requires_whole_string_match(self, db):
        """
        `resolve_alias` is an exact lookup on the normalised string, not a
        substring scan. A phrase containing the alias is left alone.
        """
        db.add(models.SymptomAlias(alias="blood pressure", canonical="hypertension"))
        db.commit()
        _reload_all_caches(db)

        from services.routing import resolve_alias
        assert resolve_alias("my blood pressure is high") == "my blood pressure is high"

    def test_resolve_alias_returns_canonical_form(self, db):
        db.add(models.SymptomAlias(alias="blood pressure", canonical="hypertension"))
        db.commit()
        _reload_all_caches(db)

        from services.routing import resolve_alias
        assert resolve_alias("blood pressure") == "hypertension"

    def test_resolve_alias_passes_through_unaliased(self, db):
        db.add(models.SymptomAlias(alias="blood pressure", canonical="hypertension"))
        db.commit()
        _reload_all_caches(db)

        from services.routing import resolve_alias
        assert resolve_alias("headache") == "headache"


# ---------------------------------------------------------------------------
# City normalisation
# ---------------------------------------------------------------------------
class TestCityNormalisation:
    @pytest.mark.parametrize("raw,expected", [
        ("bangalore", "Bangalore"),
        # "Bengaluru" is the other common name for the same city and is
        # canonicalised to the same display value.
        ("Bengaluru", "Bangalore"),
        ("whitefield", "Bangalore"),
        ("koramangala", "Bangalore"),
        ("bandra", "Mumbai"),
    ])
    def test_known_neighbourhoods_roll_up(self, raw, expected):
        assert normalize_city(raw) == expected

    def test_unknown_city_passes_through(self):
        assert normalize_city("Atlantis") == "Atlantis"

    def test_none_stays_none(self):
        assert normalize_city(None) is None
        assert normalize_city("") is None


# ---------------------------------------------------------------------------
# Extraction (regex tier, no LLM)
# ---------------------------------------------------------------------------
class TestExtraction:
    def test_empty_text_yields_nothing(self):
        assert extract_medical_info("") == {"symptoms": None, "city": None, "area": None}
        assert extract_medical_info("   ") == {"symptoms": None, "city": None, "area": None}

    def test_result_always_has_the_three_keys(self):
        result = extract_medical_info("my head hurts a lot")
        assert set(result) == {"symptoms", "city", "area"}

    def test_extracts_symptom_and_city(self):
        result = extract_medical_info("I have chest pain and I live in Bangalore")
        assert result["city"] == "Bangalore"
        assert result["symptoms"]

    def test_area_is_rolled_up_to_its_city(self):
        result = extract_medical_info("fever, I am in Whitefield")
        assert result["city"] == "Bangalore"
        assert result["area"] == "Whitefield"


# ---------------------------------------------------------------------------
# The /process chat endpoint
# ---------------------------------------------------------------------------
class TestProcessEndpoint:
    def test_requires_authentication(self, client):
        resp = client.post("/process", json={"text": "chest pain", "session_id": "s1"})
        assert resp.status_code == 401

    def test_responds_with_the_documented_envelope(self, client, patient_token, doctor):
        resp = client.post("/process", json={
            "text": "I have chest pain and live in Bengaluru",
            "session_id": "sess-1",
        }, headers={"Authorization": f"Bearer {patient_token}"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert set(body) >= {"reply", "status", "city", "area", "doctors",
                             "patient_lat", "patient_lng"}
        assert body["status"] in {"complete", "incomplete"}

    def test_symptom_plus_city_yields_doctors(self, client, patient_token, doctor):
        """
        The full path: a symptom is extracted, the patient's profile supplies
        the city, and the matching verified doctor comes back.
        """
        resp = client.post("/process", json={
            "text": "I have chest pain",
            "session_id": "sess-2",
        }, headers={"Authorization": f"Bearer {patient_token}"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "complete"
        assert [d["id"] for d in body["doctors"]] == [doctor.id]

    def test_symptom_without_city_asks_for_location(self, db, client, patient_token, doctor):
        """A patient with no city on profile cannot be routed yet."""
        from models import User

        patient = db.query(User).filter_by(email="patient@example.com").first()
        patient.home_city = None
        patient.home_address = None
        db.commit()

        resp = client.post("/process", json={
            "text": "I have chest pain",
            "session_id": "sess-3",
        }, headers={"Authorization": f"Bearer {patient_token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "incomplete"
        assert body["doctors"] == []

    def test_session_accumulates_across_turns(self, db, client, patient_token, doctor):
        """
        The endpoint is a multi-turn chat: symptoms given on one turn must
        still be remembered when a later turn supplies the location.
        """
        from models import User

        patient = db.query(User).filter_by(email="patient@example.com").first()
        patient.home_city = None
        patient.home_address = None
        db.commit()

        headers = {"Authorization": f"Bearer {patient_token}"}

        first = client.post("/process", json={
            "text": "I have chest pain", "session_id": "sess-4",
        }, headers=headers)
        assert first.status_code == 200
        assert first.json()["doctors"] == []  # no city yet

        second = client.post("/process", json={
            "text": "I live in Bengaluru", "session_id": "sess-4",
        }, headers=headers)
        assert second.status_code == 200
        body = second.json()
        # The symptom from turn one is still in play.
        assert body["status"] == "complete"
        assert [d["id"] for d in body["doctors"]] == [doctor.id]

    def test_empty_message_is_handled(self, client, patient_token):
        resp = client.post("/process", json={"text": "", "session_id": "brand-new"},
                           headers={"Authorization": f"Bearer {patient_token}"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "incomplete"

    def test_explicit_coordinates_take_priority(self, client, patient_token, doctor):
        """Live coordinates from the browser beat the stored profile city."""
        resp = client.post("/process", json={
            "text": "I have chest pain",
            "session_id": "sess-5",
            "patient_lat": 12.9716,
            "patient_lng": 77.5946,
        }, headers={"Authorization": f"Bearer {patient_token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["patient_lat"] == 12.9716
        assert body["patient_lng"] == 77.5946

    def test_saved_home_location_counts_as_the_city(self, client, patient_token, doctor):
        """
        Regression: a patient whose home location is already on their profile
        must never be asked for a city.

        The dashboard always sends coordinates once a location is resolved --
        the home pin counts. City and coordinates used to be resolved in one
        if/elif chain, so those coordinates took the branch that would have
        read the profile, `city` stayed None, and the chat replied "which city
        are you in" over a profile that already answered it.
        """
        resp = client.post("/process", json={
            "text": "I have chest pain",
            "session_id": "sess-6",
            "patient_lat": 12.9716,
            "patient_lng": 77.5946,
        }, headers={"Authorization": f"Bearer {patient_token}"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Without the fix this pair was ("incomplete", []).
        assert body["city"] == "Bangalore"
        assert body["status"] == "complete"
        assert [d["id"] for d in body["doctors"]] == [doctor.id]
        # The browser's coordinates are still the ones used for distance.
        assert body["patient_lat"] == 12.9716
        assert body["patient_lng"] == 77.5946

    def test_coordinates_do_not_suppress_a_typed_city(self, client, patient_token, doctor):
        """
        The mirror of the above: coordinates decide proximity, but a city the
        patient typed still decides which doctors are candidates. A Bangalore
        profile must not scope the search when the patient says Mumbai.
        """
        resp = client.post("/process", json={
            "text": "I have chest pain and I live in Mumbai",
            "session_id": "sess-7",
            "patient_lat": 12.9716,
            "patient_lng": 77.5946,
        }, headers={"Authorization": f"Bearer {patient_token}"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["city"] == "Mumbai"
        assert body["doctors"] == []  # the seeded doctor is in Bangalore


# ---------------------------------------------------------------------------
# Doctor search
# ---------------------------------------------------------------------------
class TestDoctorSearch:
    def test_map_endpoint_lists_verified_active_only(self, client, db, doctor, doctor2):
        resp = client.get("/api/doctors")
        assert resp.status_code == 200
        ids = [d["id"] for d in resp.json()]
        assert doctor.id in ids
        assert doctor2.id in ids

        # An unverified doctor must not appear on the public map.
        db.query(models.Doctor).filter(models.Doctor.id == doctor2.id).update(
            {"is_verified": False}
        )
        db.commit()

        after = [d["id"] for d in client.get("/api/doctors").json()]
        assert doctor2.id not in after

    def test_find_doctors_filters_by_verification(self, db, doctor):
        from main import find_doctors

        doctor.is_verified = False
        db.commit()

        assert find_doctors("Bangalore", None, "Cardiologist", db=db) == []

    def test_find_doctors_requires_a_city(self, db, doctor):
        from main import find_doctors

        assert find_doctors(None, None, "Cardiologist", db=db) == []

    def test_find_doctors_matches_specialty(self, db, doctor, doctor2):
        from main import find_doctors

        results = find_doctors("Bangalore", None, "Cardiologist", db=db)
        assert [d["id"] for d in results] == [doctor.id]

    def test_find_doctors_is_city_scoped(self, db, doctor):
        from main import find_doctors

        assert find_doctors("Mumbai", None, "Cardiologist", db=db) == []

    def test_find_doctors_accepts_a_ranked_specialty_list(self, db, doctor, doctor2):
        """A multi-specialty union is the normal call shape from /process."""
        from main import find_doctors

        results = find_doctors("Bangalore", None, ["Cardiologist", "Neurologist"], db=db)
        assert {d["id"] for d in results} == {doctor.id, doctor2.id}


# ---------------------------------------------------------------------------
# Health endpoints
# ---------------------------------------------------------------------------
class TestHealth:
    def test_root(self, client):
        assert client.get("/").status_code == 200

    def test_health(self, client):
        assert client.get("/health").json() == {"status": "ok"}

    def test_security_headers_present(self, client):
        resp = client.get("/health")
        assert resp.headers["X-Content-Type-Options"] == "nosniff"
        assert resp.headers["X-Frame-Options"] == "DENY"
        assert "Content-Security-Policy" in resp.headers
