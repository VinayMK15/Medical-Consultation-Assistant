"""
The doctors.specialization foreign key.

`specialization` was free text on `doctors` even though a `specializations`
table existed. Nothing enforced the relationship, so a typo would make a
doctor silently disappear from search results -- `find_doctors` filters on that
column and a misspelled value matches no row.

These tests cover the constraint itself, the RESTRICT delete action, and the
admin validation that turns a bad value into a 400 rather than a 500.
"""

import sqlite3

import pytest

DB_PATH = "medical_app.db"

DOCTOR_INSERT = (
    "INSERT INTO doctors (email, hashed_password, full_name, specialization, "
    "qualifications, license_number, phone, practice_city, practice_address, "
    "shift_start, shift_end, slot_duration_minutes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
)
VALID_DOCTOR = (
    "doc@example.com", "h", "Doc", "Cardiologist", "MBBS", "LIC-1", "+910000000000",
    "Bangalore", "MG Road", "09:00", "17:00", 30,
)


@pytest.fixture
def raw():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=ON")
    yield conn
    conn.rollback()
    conn.close()


def _attempt(conn, sql, params):
    try:
        conn.execute(sql, params)
    except sqlite3.IntegrityError as exc:
        return exc
    return None


class TestSpecializationForeignKey:
    def test_unknown_specialization_rejected(self, raw):
        """The core case: a value with no matching specializations row."""
        params = list(VALID_DOCTOR)
        params[3] = "Cardiologis"  # one letter off
        assert _attempt(raw, DOCTOR_INSERT, params) is not None

    def test_empty_specialization_rejected(self, raw):
        params = list(VALID_DOCTOR)
        params[3] = ""
        assert _attempt(raw, DOCTOR_INSERT, params) is not None

    def test_valid_specialization_accepted(self, raw):
        assert _attempt(raw, DOCTOR_INSERT, VALID_DOCTOR) is None

    def test_every_seeded_specialization_is_valid(self, raw):
        """
        The seed data must satisfy the constraint. A specialty in
        SPECIALIZATIONS_DATA that is not in the table would break seeding.
        """
        rows = raw.execute("SELECT DISTINCT specialization FROM doctors").fetchall()
        for (specialization,) in rows:
            match = raw.execute(
                "SELECT 1 FROM specializations WHERE name = ?", (specialization,)
            ).fetchone()
            assert match is not None, (
                f"doctor specialization {specialization!r} has no specializations row"
            )

    def test_fk_is_declared_in_the_schema(self):
        conn = sqlite3.connect(DB_PATH)
        try:
            fks = conn.execute("PRAGMA foreign_key_list(doctors)").fetchall()
        finally:
            conn.close()

        targets = {(row[3], row[2], row[4]) for row in fks}
        assert ("specialization", "specializations", "name") in targets

    def test_on_delete_is_restrict(self):
        """Removing a specialty that doctors hold must fail, not cascade."""
        conn = sqlite3.connect(DB_PATH)
        try:
            fks = conn.execute("PRAGMA foreign_key_list(doctors)").fetchall()
        finally:
            conn.close()

        for row in fks:
            if row[3] == "specialization":
                assert row[6] == "RESTRICT", (
                    f"expected RESTRICT, got {row[6]!r}"
                )

    def test_deleting_a_used_specialization_is_blocked(self, raw):
        """
        RESTRICT means the delete fails while any doctor holds the specialty.
        Without it, the specialty would vanish and every doctor's search
        result with it.
        """
        used = raw.execute(
            "SELECT specialization FROM doctors LIMIT 1"
        ).fetchone()[0]

        assert _attempt(
            raw, "DELETE FROM specializations WHERE name = ?", (used,)
        ) is not None

    def test_deleting_an_unused_specialization_is_allowed(self, raw):
        """RESTRICT must not block a specialty no doctor holds."""
        raw.execute(
            "INSERT INTO specializations (name, description) VALUES ('Temp Spec', 'x')"
        )
        assert _attempt(
            raw, "DELETE FROM specializations WHERE name = ?", ("Temp Spec",)
        ) is None


class TestAdminValidation:
    """
    The admin routes must reject an unknown specialization with a 400.

    The FK alone would produce an IntegrityError at commit, which surfaces as a
    500. The route checks first so the operator gets a useful message.
    """

    def test_create_doctor_with_unknown_specialization_is_400(
        self, client, admin_token
    ):
        resp = client.post("/api/admin/users", json={
            "role": "doctor",
            "email": "newdoc@example.com",
            "password": "Str0ngPass!",
            "full_name": "New Doc",
            "specialization": "Cardiologis",
            "qualifications": "MBBS",
            "license_number": "LIC-NEW-1",
            "phone": "+910000000000",
            "practice_city": "Bangalore",
            "practice_address": "MG Road",
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 400
        assert "specialization" in resp.json()["detail"].lower()

    def test_create_doctor_with_valid_specialization_succeeds(
        self, client, db, admin_token
    ):
        resp = client.post("/api/admin/users", json={
            "role": "doctor",
            "email": "newdoc@example.com",
            "password": "Str0ngPass!",
            "full_name": "New Doc",
            "specialization": "Cardiologist",
            "qualifications": "MBBS",
            "license_number": "LIC-NEW-1",
            "phone": "+910000000000",
            "practice_city": "Bangalore",
            "practice_address": "MG Road",
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 201, resp.text

        import models
        db.expire_all()
        assert db.query(models.Doctor).filter_by(
            email="newdoc@example.com"
        ).first().specialization == "Cardiologist"

    def test_update_doctor_to_unknown_specialization_is_400(
        self, client, admin_token, doctor
    ):
        resp = client.put(f"/api/admin/users/{doctor.id}?role=doctor", json={
            "specialization": "Neurosurgeon",
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 400

    def test_update_doctor_to_valid_specialization_succeeds(
        self, client, db, admin_token, doctor
    ):
        resp = client.put(f"/api/admin/users/{doctor.id}?role=doctor", json={
            "specialization": "Neurologist",
        }, headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200, resp.text

        db.expire_all()
        from models import Doctor
        assert db.query(Doctor).filter_by(id=doctor.id).first().specialization == "Neurologist"

    def test_specialization_change_is_visible_in_search(
        self, client, db, admin_token, doctor
    ):
        """
        The point of the constraint: a doctor whose specialty is valid must
        actually appear when that specialty is searched for.
        """
        client.put(f"/api/admin/users/{doctor.id}?role=doctor", json={
            "specialization": "Neurologist",
        }, headers={"Authorization": f"Bearer {admin_token}"})

        from services.doctor_search import find_doctors
        results = find_doctors("Bangalore", None, "Neurologist", db=db)
        assert [d["id"] for d in results] == [doctor.id]
