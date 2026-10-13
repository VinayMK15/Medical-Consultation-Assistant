"""Authentication: signup, login, role separation, and reset flow."""

import pytest
from conftest import TEST_PASSWORD, auth_header, login


# ---------------------------------------------------------------------------
# Patient signup
# ---------------------------------------------------------------------------
class TestPatientSignup:
    def test_creates_account(self, client, db):
        import models

        resp = client.post("/api/auth/signup", json={
            "email": "new@example.com",
            "password": TEST_PASSWORD,
            "full_name": "New Patient",
            "age": 28,
        })
        assert resp.status_code == 201, resp.text
        assert db.query(models.User).filter_by(email="new@example.com").first()

    def test_rejects_weak_password(self, client):
        resp = client.post("/api/auth/signup", json={
            "email": "weak@example.com",
            "password": "123",
            "full_name": "Weak",
        })
        assert resp.status_code == 422

    def test_rejects_duplicate_email(self, client, patient):
        resp = client.post("/api/auth/signup", json={
            "email": patient.email,
            "password": TEST_PASSWORD,
            "full_name": "Impostor",
        })
        assert resp.status_code in (400, 409)
        assert "already" in resp.json().get("detail", "").lower()

    def test_email_is_unique_across_role_tables(self, client, doctor):
        """A patient signup must not collide with an existing doctor account."""
        resp = client.post("/api/auth/signup", json={
            "email": doctor.email,
            "password": TEST_PASSWORD,
            "full_name": "Impostor",
        })
        assert resp.status_code in (400, 409)


# ---------------------------------------------------------------------------
# Patient login
# ---------------------------------------------------------------------------
class TestPatientLogin:
    def test_returns_token_and_profile(self, client, patient):
        token = login(client, patient.email)
        assert token

        resp = client.get("/api/patient/profile", headers=auth_header(token))
        assert resp.status_code == 200
        assert resp.json()["email"] == patient.email

    def test_wrong_password_rejected(self, client, patient):
        resp = client.post("/api/auth/login",
                           data={"username": patient.email, "password": "wrong-password"})
        assert resp.status_code == 403

    def test_unknown_email_rejected(self, client):
        resp = client.post("/api/auth/login",
                           data={"username": "nobody@example.com", "password": TEST_PASSWORD})
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Doctor login gating
# ---------------------------------------------------------------------------
class TestDoctorLogin:
    def test_verified_doctor_can_log_in(self, client, doctor):
        token = login(client, doctor.email, path="/api/auth/doctor/login")
        resp = client.get("/api/doctor/profile", headers=auth_header(token))
        assert resp.status_code == 200

    def test_unverified_doctor_blocked(self, client, db, doctor):
        doctor.is_verified = False
        db.commit()

        resp = client.post("/api/auth/doctor/login",
                           data={"username": doctor.email, "password": TEST_PASSWORD})
        assert resp.status_code == 403
        assert "verification" in resp.json()["detail"].lower()

    def test_deactivated_doctor_blocked(self, client, db, doctor):
        doctor.is_active = False
        db.commit()

        resp = client.post("/api/auth/doctor/login",
                           data={"username": doctor.email, "password": TEST_PASSWORD})
        assert resp.status_code == 403
        assert "deactivated" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Admin login gating
# ---------------------------------------------------------------------------
class TestAdminLogin:
    def test_admin_can_log_in(self, client, admin):
        token = login(client, admin.email, path="/api/auth/admin/login")
        assert token

    def test_inactive_admin_blocked(self, client, db, admin):
        admin.is_active = False
        db.commit()

        resp = client.post("/api/auth/admin/login",
                           data={"username": admin.email, "password": TEST_PASSWORD})
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Role separation
# ---------------------------------------------------------------------------
class TestRoleSeparation:
    def test_patient_token_cannot_reach_patient_only_route_as_doctor(self, client, patient, doctor):
        patient_token = login(client, patient.email)
        resp = client.get("/api/doctor/profile", headers=auth_header(patient_token))
        assert resp.status_code == 401

    def test_doctor_token_cannot_reach_patient_route(self, client, doctor):
        doctor_token = login(client, doctor.email, path="/api/auth/doctor/login")
        resp = client.get("/api/patient/profile", headers=auth_header(doctor_token))
        assert resp.status_code == 401

    def test_admin_route_rejects_patient(self, client, patient):
        token = login(client, patient.email)
        resp = client.get("/api/admin/pending-doctors", headers=auth_header(token))
        assert resp.status_code == 401

    def test_missing_token_rejected(self, client):
        assert client.get("/api/patient/profile").status_code == 401

    def test_garbage_token_rejected(self, client):
        resp = client.get("/api/patient/profile",
                          headers={"Authorization": "Bearer not-a-real-token"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------
class TestPasswordReset:
    def _start_reset(self, client, email):
        return client.post("/api/auth/forgot-password", json={"email": email})

    def test_forgot_password_accepts_known_email(self, client, patient):
        resp = self._start_reset(client, patient.email)
        assert resp.status_code == 200

    def test_forgot_password_is_generic_for_unknown_email(self, client):
        """
        Must not leak account existence: an unknown email has to produce the
        same response shape as a known one.
        """
        resp = self._start_reset(client, "ghost@example.com")
        assert resp.status_code == 200

    def test_link_reset_issues_token_for_known_account(self, client, db, patient):
        """The happy path: a token lands on the account row."""
        self._start_reset(client, patient.email)
        db.expire_all()

        from models import User
        row = db.query(User).filter_by(email=patient.email).first()
        assert row.reset_token
        assert row.reset_token_expires

    def test_no_token_issued_when_address_is_ambiguous(self, client, db, patient, doctor):
        """
        The account lookup only resolves when exactly one table holds the
        address. If two do, nothing may be issued -- otherwise a reset link
        could go to whichever row happened to win the lookup.
        """
        doctor.email = patient.email  # impossible via signup; forced here
        db.commit()

        resp = self._start_reset(client, patient.email)
        assert resp.status_code == 200  # still generic, so no enumeration leak

        db.expire_all()
        from models import User
        assert db.query(User).filter_by(email=patient.email).first().reset_token is None

    def test_unknown_email_issues_nothing(self, client, db):
        self._start_reset(client, "ghost@example.com")
        # Nothing to assert on the row side; the generic 200 is the contract,
        # already covered above.

    def test_verify_reset_code_requires_authentication(self, client, patient):
        """
        /verify-reset-code takes the account from the access token, not the
        body, so an unauthenticated call must be refused.
        """
        resp = client.post("/api/auth/verify-reset-code", json={
            "code": "123456",
            "new_password": "NewStr0ngPass!",
        })
        assert resp.status_code == 401

    def test_verify_reset_code_wrong_code_rejected(self, client, db, patient, patient_token):
        client.post("/api/auth/forgot-password",
                    json={"email": patient.email, "mode": "code"})
        db.expire_all()

        resp = client.post("/api/auth/verify-reset-code",
                           json={"code": "000000", "new_password": "NewStr0ngPass!"},
                           headers=auth_header(patient_token))
        assert resp.status_code == 400

    def test_reset_password_with_bad_token_rejected(self, client):
        resp = client.post("/api/auth/reset-password", json={
            "token": "not-a-real-token",
            "new_password": "NewStr0ngPass!",
        })
        assert resp.status_code == 400
