"""
Token security: secret-key validation, id-based subjects, and revocation.

Covers the changes made in the auth-hardening phase -- refusing to start with
a weak signing key, keying tokens on account id rather than email, and
invalidating outstanding tokens via `token_version`.
"""

import importlib
import os
import subprocess
import sys

import pytest
from conftest import TEST_PASSWORD, auth_header, login
from jose import jwt

import auth_utils

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ---------------------------------------------------------------------------
# Secret key validation
# ---------------------------------------------------------------------------
class TestSecretKeyValidation:
    """
    `_load_secret_key` must refuse to return a weak key.

    Run in a subprocess: the check happens at import time, so testing it in
    process would mean reimporting the module with mutated environment.
    """

    def _start_with(self, secret_value):
        env = dict(os.environ)
        env["SECRET_KEY"] = secret_value
        env["PYTHONPATH"] = BACKEND_DIR
        return subprocess.run(
            [sys.executable, "-c", "import auth_utils; print('STARTED')"],
            cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=90,
        )

    def test_valid_key_starts(self):
        result = self._start_with("a" * 64)
        assert "STARTED" in result.stdout, result.stderr

    def test_missing_key_refuses_to_start(self):
        result = self._start_with("")
        assert result.returncode != 0
        assert "SECRET_KEY is not set" in result.stderr

    def test_placeholder_key_refuses_to_start(self):
        """
        The value shipped in .env.example must not be accepted -- it is in
        every clone of this repository, so it is not a secret.
        """
        result = self._start_with("change-me-to-something-random")
        assert result.returncode != 0
        assert "placeholder" in result.stderr

    def test_short_key_refuses_to_start(self):
        result = self._start_with("short-key")
        assert result.returncode != 0
        assert "characters" in result.stderr

    def test_no_random_fallback_is_generated(self):
        """
        The old behaviour warned and substituted `secrets.token_hex(32)`, which
        silently invalidated every token on each restart. Nothing random should
        be produced now.
        """
        result = self._start_with("")
        combined = result.stdout + result.stderr
        # A substituted key would show up as an actual hex string. The message
        # legitimately mentions token_hex as the remedy, so check the shape
        # rather than the word.
        assert "STARTED" not in result.stdout
        assert not any(
            len(word) == 64 and all(c in "0123456789abcdef" for c in word)
            for word in combined.replace('"', " ").replace("(", " ").split()
        )

    def test_error_names_the_fix(self):
        """A startup error should tell the operator what to do."""
        result = self._start_with("")
        assert "secrets.token_hex(32)" in result.stderr


# ---------------------------------------------------------------------------
# Token subject
# ---------------------------------------------------------------------------
class TestTokenSubject:
    def test_subject_is_the_account_id(self, client, patient):
        token = login(client, patient.email)
        claims = jwt.decode(token, auth_utils.SECRET_KEY, algorithms=["HS256"])
        assert claims["sub"] == str(patient.id)

    def test_token_carries_role_and_version(self, client, patient):
        token = login(client, patient.email)
        claims = jwt.decode(token, auth_utils.SECRET_KEY, algorithms=["HS256"])
        assert claims["role"] == "patient"
        assert claims["ver"] == 0

    def test_token_survives_an_email_change(self, client, db, patient, patient_token):
        """
        The reason `sub` is the id. A token keyed on email stops resolving the
        moment the address changes -- including the admin route that changes
        it, which would lock the user out of their own session.
        """
        patient.email = "renamed@example.com"
        db.commit()

        resp = client.get("/api/patient/profile", headers=auth_header(patient_token))
        assert resp.status_code == 200
        assert resp.json()["email"] == "renamed@example.com"

    def test_email_is_only_a_hint_not_the_subject(self, client, patient):
        """
        Tampering with the email claim must not change who the token
        identifies. The id does.
        """
        token = login(client, patient.email)
        claims = jwt.decode(token, auth_utils.SECRET_KEY, algorithms=["HS256"])
        assert claims["email"] == patient.email
        assert claims["sub"] != patient.email


# ---------------------------------------------------------------------------
# Revocation
# ---------------------------------------------------------------------------
class TestTokenRevocation:
    def test_password_change_invalidates_other_sessions(self, client, db,
                                                          doctor, doctor_token):
        """
        The doctor signs in twice. Changing the password must kill the older
        token while the new one, returned by the endpoint, keeps working.
        """
        other_token = login(client, doctor.email, path="/api/auth/doctor/login")

        resp = client.post("/api/doctor/change-password", json={
            "current_password": TEST_PASSWORD,
            "new_password": "N3wStr0ngPass!",
        }, headers=auth_header(doctor_token))
        assert resp.status_code == 200, resp.text

        fresh = resp.json()["access_token"]

        # The token used to make the change still works -- it was replaced.
        still_ok = client.get("/api/doctor/profile", headers=auth_header(fresh))
        assert still_ok.status_code == 200

        # The other session is dead.
        revoked = client.get("/api/doctor/profile", headers=auth_header(other_token))
        assert revoked.status_code == 401

    def test_old_password_stops_working_after_a_change(self, client, doctor, doctor_token):
        client.post("/api/doctor/change-password", json={
            "current_password": TEST_PASSWORD,
            "new_password": "N3wStr0ngPass!",
        }, headers=auth_header(doctor_token))

        resp = client.post("/api/auth/doctor/login",
                           data={"username": doctor.email,
                                 "password": TEST_PASSWORD})
        assert resp.status_code == 403

    def test_password_reset_invalidates_sessions(self, client, db, patient,
                                                 patient_token):
        """
        A reset is the response to a suspected compromise, so it must end
        every session. Without the version bump, a stolen token would outlive
        the reset meant to revoke it.
        """
        patient.reset_token = "a-link-token-for-the-test"
        patient.reset_token_expires = auth_utils._utcnow() + __import__(
            "datetime").timedelta(minutes=15)
        db.commit()

        resp = client.post("/api/auth/reset-password", json={
            "token": "a-link-token-for-the-test",
            "new_password": "Res3tStr0ngPass!",
        })
        assert resp.status_code == 200

        after = client.get("/api/patient/profile", headers=auth_header(patient_token))
        assert after.status_code == 401

    def test_reset_password_sets_a_new_version(self, client, db, patient):
        patient.reset_token = "another-token"
        patient.reset_token_expires = auth_utils._utcnow() + __import__(
            "datetime").timedelta(minutes=15)
        db.commit()

        client.post("/api/auth/reset-password", json={
            "token": "another-token",
            "new_password": "Res3tStr0ngPass!",
        })

        db.expire_all()
        from models import User
        assert db.query(User).filter_by(id=patient.id).first().token_version >= 1

    def test_admin_deactivation_kills_live_sessions(self, client, db, admin_token,
                                                    doctor, doctor_token):
        """
        Revoking access must end existing sessions, not just block the next
        login. This is the case where it matters most -- a deactivated doctor
        still holding a valid token.
        """
        resp = client.put(f"/api/admin/users/{doctor.id}?role=doctor", json={
            "is_active": False,
        }, headers=auth_header(admin_token))
        assert resp.status_code == 200, resp.text

        after = client.get("/api/doctor/profile", headers=auth_header(doctor_token))
        assert after.status_code == 401

    def test_deactivation_still_allows_reactivation_login(self, client, db,
                                                          admin_token, doctor):
        client.put(f"/api/admin/users/{doctor.id}?role=doctor", json={
            "is_active": False,
        }, headers=auth_header(admin_token))

        blocked = client.post("/api/auth/doctor/login",
                              data={"username": doctor.email,
                                    "password": TEST_PASSWORD})
        assert blocked.status_code == 403

        doctor.is_active = True
        db.commit()

        allowed = client.post("/api/auth/doctor/login",
                              data={"username": doctor.email,
                                    "password": TEST_PASSWORD})
        assert allowed.status_code == 200

    def test_admin_set_password_kills_sessions(self, client, admin_token,
                                                patient, patient_token):
        resp = client.put(f"/api/admin/users/{patient.id}?role=patient", json={
            "password": "AdminSetP4ss!",
        }, headers=auth_header(admin_token))
        assert resp.status_code == 200, resp.text

        after = client.get("/api/patient/profile", headers=auth_header(patient_token))
        assert after.status_code == 401

    def test_reactivation_does_not_grant_back_stale_tokens(self, client, db,
                                                          admin_token, doctor,
                                                          doctor_token):
        """
        Revoking twice must not cycle the version back to a value an old token
        already carries. The counter only moves forward.
        """
        client.put(f"/api/admin/users/{doctor.id}?role=doctor", json={
            "is_active": False,
        }, headers=auth_header(admin_token))
        doctor.is_active = True
        db.commit()

        # The doctor logged in again, so has a current token.
        current = login(client, doctor.email, path="/api/auth/doctor/login")
        assert client.get("/api/doctor/profile",
                          headers=auth_header(current)).status_code == 200

        client.put(f"/api/admin/users/{doctor.id}?role=doctor", json={
            "is_active": False,
        }, headers=auth_header(admin_token))
        doctor.is_active = True
        db.commit()

        assert client.get("/api/doctor/profile",
                          headers=auth_header(current)).status_code == 401

    def test_version_survives_across_reuse(self, client, db, admin_token, patient):
        """The counter is monotonic on the row, not per-login."""
        for _ in range(3):
            client.put(f"/api/admin/users/{patient.id}?role=patient", json={
                "password": "AnotherP4ss!",
            }, headers=auth_header(admin_token))

        db.expire_all()
        from models import User
        assert db.query(User).filter_by(id=patient.id).first().token_version == 3


# ---------------------------------------------------------------------------
# Role verification
# ---------------------------------------------------------------------------
class TestRoleVerification:
    def test_role_must_match_the_account_kind(self, client, db, patient):
        """
        A patient token claiming to be an admin must be refused. The signature
        is valid, so only the database row can settle it.
        """
        token = auth_utils.create_access_token({
            "sub": str(patient.id),
            "role": "admin",
            "ver": patient.token_version,
        })

        resp = client.get("/api/admin/pending-doctors",
                          headers=auth_header(token))
        assert resp.status_code == 401

    def test_unknown_role_is_rejected(self, client, patient):
        token = auth_utils.create_access_token({
            "sub": str(patient.id),
            "role": "superuser",
            "ver": patient.token_version,
        })
        assert client.get("/api/admin/stats",
                          headers=auth_header(token)).status_code == 401

    def test_stale_version_claim_is_rejected(self, client, db, patient,
                                             patient_token):
        """A token minted against an old version must not validate."""
        db.query(type(patient)).filter_by(id=patient.id).update(
            {"token_version": 5})
        db.commit()

        resp = client.get("/api/patient/profile", headers=auth_header(patient_token))
        assert resp.status_code == 401

    def test_missing_version_claim_is_tolerated(self, client, patient):
        """
        A token with no `ver` is from before this change and still resolves.
        Being strict here would log out every existing session on deploy.
        """
        token = auth_utils.create_access_token({
            "sub": str(patient.id),
            "role": "patient",
        })
        assert client.get("/api/patient/profile",
                          headers=auth_header(token)).status_code == 200

    def test_token_for_deleted_account_is_rejected(self, client, db, patient):
        token = auth_utils.create_access_token({
            "sub": str(patient.id),
            "role": "patient",
            "ver": 0,
        })

        db.delete(db.query(type(patient)).filter_by(id=patient.id).first())
        db.commit()

        assert client.get("/api/patient/profile",
                          headers=auth_header(token)).status_code == 401

    def test_non_numeric_subject_is_rejected(self, client):
        token = auth_utils.create_access_token({"sub": "not-an-id",
                                                "role": "patient"})
        assert client.get("/api/patient/profile",
                          headers=auth_header(token)).status_code == 401


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
class TestPasswordHashing:
    def test_hash_is_not_the_plaintext(self):
        hashed = auth_utils.get_password_hash("swordfish-123")
        assert hashed != "swordfish-123"
        assert auth_utils.verify_password("swordfish-123", hashed)

    def test_wrong_password_fails(self):
        hashed = auth_utils.get_password_hash("swordfish-123")
        assert not auth_utils.verify_password("swordfish-124", hashed)

    def test_same_password_hashes_differently_each_time(self):
        """bcrypt salts per hash, so equal passwords must not collide."""
        first = auth_utils.get_password_hash("same-password")
        second = auth_utils.get_password_hash("same-password")
        assert first != second

    def test_cost_factor_is_explicit(self):
        """
        Stated as a constant rather than inherited from passlib's default, so
        it is a decision that can be seen and changed.
        """
        assert auth_utils.BCRYPT_ROUNDS >= 12
