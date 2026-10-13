"""Patient profile and notification settings."""

import pytest
from conftest import auth_header


class TestProfileRead:
    def test_returns_own_profile(self, client, patient_token, patient):
        resp = client.get("/api/patient/profile", headers=auth_header(patient_token))
        assert resp.status_code == 200
        assert resp.json()["email"] == patient.email

    def test_requires_authentication(self, client):
        assert client.get("/api/patient/profile").status_code == 401


class TestProfileUpdate:
    def test_updates_basic_fields(self, client, patient_token):
        resp = client.put("/api/patient/profile", json={
            "full_name": "Renamed Patient",
            "phone": "+919999999999",
        }, headers=auth_header(patient_token))
        assert resp.status_code == 200, resp.text
        assert resp.json()["full_name"] == "Renamed Patient"

    def test_cannot_change_role_id_or_email(self, client, patient_token, patient):
        """
        Mass-assignment guard: `role`, `id` and `email` are absent from
        PatientProfileUpdate, so a client sending them has them ignored rather
        than applied. This is the difference between an allowlist schema and
        binding straight to the model.
        """
        resp = client.put("/api/patient/profile", json={
            "full_name": "Still Fine",
            "role": "admin",
            "id": 999,
            "email": "attacker@example.com",
        }, headers=auth_header(patient_token))
        assert resp.status_code == 200, resp.text

        follow = client.get("/api/patient/profile", headers=auth_header(patient_token))
        assert follow.json()["email"] == patient.email

    def test_age_bounds_are_enforced(self, client, patient_token):
        """age has ge=0, le=120 in the schema."""
        assert client.put("/api/patient/profile", json={"age": -1},
                          headers=auth_header(patient_token)).status_code == 422
        assert client.put("/api/patient/profile", json={"age": 500},
                          headers=auth_header(patient_token)).status_code == 422


class TestSettings:
    def test_defaults_created_on_first_read(self, client, db, patient_token):
        import models

        resp = client.get("/api/patient/settings", headers=auth_header(patient_token))
        assert resp.status_code == 200
        assert resp.json()["appointment_emails"] is True

        row = db.query(models.PatientSettings).first()
        assert row is not None

    def test_read_is_idempotent(self, client, db, patient_token):
        for _ in range(3):
            client.get("/api/patient/settings", headers=auth_header(patient_token))

        import models
        # Lazy creation must not accumulate duplicate rows.
        assert db.query(models.PatientSettings).count() == 1

    def test_update_persists(self, client, patient_token):
        resp = client.put("/api/patient/settings", json={"appointment_emails": False},
                          headers=auth_header(patient_token))
        assert resp.status_code == 200
        assert resp.json()["appointment_emails"] is False

        again = client.get("/api/patient/settings", headers=auth_header(patient_token))
        assert again.json()["appointment_emails"] is False

    def test_settings_are_per_patient(self, client, patient_token, patient2_token):
        client.put("/api/patient/settings", json={"appointment_emails": False},
                   headers=auth_header(patient_token))

        other = client.get("/api/patient/settings", headers=auth_header(patient2_token))
        assert other.json()["appointment_emails"] is True

    def test_requires_authentication(self, client):
        assert client.get("/api/patient/settings").status_code == 401
