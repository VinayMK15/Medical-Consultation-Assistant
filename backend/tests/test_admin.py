"""Admin portal: verification queue, user management, platform stats."""

from datetime import date

import pytest
from conftest import auth_header


@pytest.fixture
def pending_doctor(db, doctor):
    doctor.is_verified = False
    db.commit()
    db.refresh(doctor)
    return doctor


class TestVerificationQueue:
    def test_lists_only_unverified(self, client, admin_token, pending_doctor, doctor2):
        resp = client.get("/api/admin/pending-doctors", headers=auth_header(admin_token))
        assert resp.status_code == 200
        ids = [d["id"] for d in resp.json()]
        assert pending_doctor.id in ids
        assert doctor2.id not in ids  # already verified

    def test_approve_sets_verified(self, client, db, admin_token, pending_doctor):
        resp = client.put(f"/api/admin/approve-doctor/{pending_doctor.id}",
                          headers=auth_header(admin_token))
        assert resp.status_code == 200

        db.expire_all()
        from models import Doctor
        assert db.query(Doctor).filter_by(id=pending_doctor.id).first().is_verified is True

    def test_approve_unknown_doctor_404(self, client, admin_token):
        resp = client.put("/api/admin/approve-doctor/99999", headers=auth_header(admin_token))
        assert resp.status_code == 404

    def test_reject_removes_doctor_and_their_appointments(self, client, db, admin_token,
                                                            patient, pending_doctor):
        import models

        appt = models.Appointment(
            patient_id=patient.id, doctor_id=pending_doctor.id,
            appointment_date=date(2030, 1, 1), slot_time="10:00",
            symptoms_summary="x", status="Pending",
        )
        db.add(appt)
        db.commit()

        resp = client.delete(f"/api/admin/reject-doctor/{pending_doctor.id}",
                             headers=auth_header(admin_token))
        assert resp.status_code == 200

        db.expire_all()
        assert db.query(models.Doctor).filter_by(id=pending_doctor.id).first() is None
        # Orphaned appointments must not survive their doctor.
        assert db.query(models.Appointment).filter_by(doctor_id=pending_doctor.id).count() == 0

    def test_reject_unknown_doctor_404(self, client, admin_token):
        resp = client.delete("/api/admin/reject-doctor/99999", headers=auth_header(admin_token))
        assert resp.status_code == 404

    def test_requires_admin_role(self, client, patient_token):
        resp = client.get("/api/admin/pending-doctors", headers=auth_header(patient_token))
        assert resp.status_code == 401


class TestStats:
    def test_counts_reflect_state(self, client, admin_token, pending_doctor, doctor2, patient, patient2):
        resp = client.get("/api/admin/stats", headers=auth_header(admin_token))
        assert resp.status_code == 200
        body = resp.json()
        assert body["pending_doctors"] == 1
        assert body["active_doctors"] == 1
        assert body["total_patients"] == 2


class TestUserManagement:
    def test_create_patient(self, client, db, admin_token):
        resp = client.post("/api/admin/users", json={
            "role": "patient",
            "email": "created@example.com",
            "password": "Str0ngPass!",
            "full_name": "Created Patient",
        }, headers=auth_header(admin_token))
        assert resp.status_code == 201, resp.text

        import models
        assert db.query(models.User).filter_by(email="created@example.com").first()

    def test_create_requires_core_fields(self, client, admin_token):
        resp = client.post("/api/admin/users", json={"role": "patient", "email": "x@y.com"},
                          headers=auth_header(admin_token))
        assert resp.status_code == 400

    def test_duplicate_email_rejected(self, client, admin_token, patient):
        resp = client.post("/api/admin/users", json={
            "role": "patient",
            "email": patient.email,
            "password": "Str0ngPass!",
            "full_name": "Clash",
        }, headers=auth_header(admin_token))
        assert resp.status_code == 400

    def test_doctor_requires_license_and_phone(self, client, admin_token):
        resp = client.post("/api/admin/users", json={
            "role": "doctor",
            "email": "newdoc@example.com",
            "password": "Str0ngPass!",
            "full_name": "New Doc",
        }, headers=auth_header(admin_token))
        assert resp.status_code == 400

    def test_delete_patient_removes_their_appointments(self, client, db, admin_token, patient, doctor):
        """
        The route requires an explicit ?role= because user_id alone is
        ambiguous across the doctors and patients tables.
        """
        import models

        appt = models.Appointment(
            patient_id=patient.id, doctor_id=doctor.id,
            appointment_date=date(2030, 1, 1), slot_time="10:00",
            symptoms_summary="x", status="Pending",
        )
        db.add(appt)
        db.commit()

        resp = client.delete(f"/api/admin/users/{patient.id}?role=patient",
                             headers=auth_header(admin_token))
        assert resp.status_code == 200

        db.expire_all()
        assert db.query(models.User).filter_by(id=patient.id).first() is None
        assert db.query(models.Appointment).filter_by(patient_id=patient.id).count() == 0

    def test_delete_requires_explicit_role(self, client, admin_token, patient):
        """Omitting ?role= is a validation error, not a silent no-op."""
        resp = client.delete(f"/api/admin/users/{patient.id}", headers=auth_header(admin_token))
        assert resp.status_code == 422

    def test_delete_unknown_user_404(self, client, admin_token):
        resp = client.delete("/api/admin/users/99999?role=patient",
                             headers=auth_header(admin_token))
        assert resp.status_code == 404


class TestSymptomMappingAdmin:
    def test_create_and_list(self, client, db, admin_token):
        resp = client.post("/api/admin/symptoms", json={
            "symptom": "Wibble",
            "specialist": "Neurology",
        }, headers=auth_header(admin_token))
        assert resp.status_code == 201, resp.text

        listing = client.get("/api/admin/symptoms", headers=auth_header(admin_token))
        assert listing.status_code == 200
        assert any(s["symptom"] == "wibble" for s in listing.json())

    def test_duplicate_symptom_rejected(self, client, admin_token):
        payload = {"symptom": "Wobble", "specialist": "Cardiology"}
        assert client.post("/api/admin/symptoms", json=payload,
                           headers=auth_header(admin_token)).status_code == 201

        # Second attempt, differing only in case: the lookup is ilike, so this
        # must still be caught as a duplicate.
        again = client.post("/api/admin/symptoms",
                            json={"symptom": "WOBBLE", "specialist": "Cardiology"},
                            headers=auth_header(admin_token))
        assert again.status_code == 400

    def test_new_symptom_is_immediately_routable(self, client, db, admin_token):
        """
        Creating a mapping calls invalidate_symptom_cache(). If the cache were
        not invalidated, the NLP layer would keep routing the old way.
        """
        from main import get_specialist

        client.post("/api/admin/symptoms",
                    json={"symptom": "Zark", "specialist": "Dermatology"},
                    headers=auth_header(admin_token))

        assert "dermatology" in get_specialist("I have a zark").lower()

    def test_delete_mapping(self, client, db, admin_token):
        created = client.post("/api/admin/symptoms",
                              json={"symptom": "Blorp", "specialist": "Neurology"},
                              headers=auth_header(admin_token))
        mapping_id = created.json()["id"]

        resp = client.delete(f"/api/admin/symptoms/{mapping_id}",
                             headers=auth_header(admin_token))
        assert resp.status_code == 200

        import models
        db.expire_all()
        assert db.query(models.SymptomMapping).filter_by(id=mapping_id).first() is None

    def test_requires_admin_role(self, client, doctor_token):
        resp = client.get("/api/admin/symptoms", headers=auth_header(doctor_token))
        assert resp.status_code == 401
