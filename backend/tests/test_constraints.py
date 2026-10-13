"""
CHECK constraints.

These assert the database rejects values the API happens to validate but the
schema did not. Before this migration a negative consultation fee, a
500-year-old patient, a 0-minute slot and a misspelled appointment status all
inserted cleanly -- the failure would have surfaced much later as a wrong price
on the map or a silently unmatched status filter.

Each test uses a raw connection rather than the ORM, because the point is that
the constraint holds for *any* writer, not just the one the app uses.
"""

import sqlite3

import pytest
from test_appointments import future_weekday_obj

DB_PATH = "medical_app.db"

# (label, SQL, params) -- each must raise IntegrityError.
DOCTOR_INSERT = (
    "INSERT INTO doctors (email, hashed_password, full_name, specialization, "
    "qualifications, license_number, phone, practice_city, practice_address, "
    "shift_start, shift_end, slot_duration_minutes, consultation_fee, "
    "experience_years) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
)
DOCTOR_PARAMS = (
    "doc@example.com", "h", "Doc", "Cardiologist", "MBBS", "LIC-1", "+910000000000",
    "Bangalore", "MG Road", "09:00", "17:00", 30, 100.0, 5,
)

USER_INSERT = "INSERT INTO users (email, hashed_password, full_name, age) VALUES (?,?,?,?)"
APPT_INSERT = (
    "INSERT INTO appointments (patient_id, doctor_id, appointment_date, slot_time, "
    "symptoms_summary, status) VALUES (?,?,?,?,?,?)"
)
CONTACT_INSERT = (
    "INSERT INTO contact_messages (name, email, message, status) VALUES (?,?,?,?)"
)


@pytest.fixture
def raw():
    """A raw connection with FK enforcement on, as any writer would have."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=ON")
    yield conn
    conn.rollback()
    conn.close()


def _attempt(conn, sql, params):
    """Run an insert and return the exception type, or None if it succeeded."""
    try:
        conn.execute(sql, params)
    except sqlite3.IntegrityError as exc:
        return exc
    return None


class TestDoctorConstraints:
    def test_negative_consultation_fee_rejected(self, raw):
        params = list(DOCTOR_PARAMS)
        params[12] = -5.0
        assert _attempt(raw, DOCTOR_INSERT, params) is not None

    def test_negative_experience_years_rejected(self, raw):
        params = list(DOCTOR_PARAMS)
        params[13] = -1
        assert _attempt(raw, DOCTOR_INSERT, params) is not None

    def test_zero_slot_duration_rejected(self, raw):
        params = list(DOCTOR_PARAMS)
        params[11] = 0
        assert _attempt(raw, DOCTOR_INSERT, params) is not None

    def test_inverted_shift_window_rejected(self, raw):
        params = list(DOCTOR_PARAMS)
        params[9], params[10] = "17:00", "09:00"
        assert _attempt(raw, DOCTOR_INSERT, params) is not None

    def test_equal_shift_bounds_rejected(self, raw):
        params = list(DOCTOR_PARAMS)
        params[9], params[10] = "09:00", "09:00"
        assert _attempt(raw, DOCTOR_INSERT, params) is not None

    def test_valid_doctor_still_inserts(self, raw):
        assert _attempt(raw, DOCTOR_INSERT, DOCTOR_PARAMS) is None


class TestUserConstraints:
    @pytest.mark.parametrize("age", [-1, 121, 500])
    def test_out_of_range_age_rejected(self, raw, age):
        assert _attempt(raw, USER_INSERT, ("u@example.com", "h", "U", age)) is not None

    @pytest.mark.parametrize("age", [0, 30, 120])
    def test_in_range_age_accepted(self, raw, age):
        assert _attempt(raw, USER_INSERT, ("u@example.com", "h", "U", age)) is None

    def test_null_age_accepted(self, raw):
        """age is nullable; the constraint must not turn that into a violation."""
        assert _attempt(raw, USER_INSERT, ("u@example.com", "h", "U", None)) is None


class TestStatusConstraints:
    @pytest.mark.parametrize("status", ["Pending ", "pending", "PENDING", "archived", ""])
    def test_misspelled_appointment_status_rejected(self, raw, status):
        assert _attempt(raw, APPT_INSERT, (1, 1, "2030-01-01", "10:00", "x", status)) is not None

    @pytest.mark.parametrize("status", ["Pending", "Completed", "Cancelled"])
    def test_valid_appointment_status_accepted(self, raw, status):
        assert _attempt(raw, APPT_INSERT, (1, 1, "2030-01-01", "10:00", "x", status)) is None

    def test_misspelled_contact_status_rejected(self, raw):
        assert _attempt(raw, CONTACT_INSERT, ("N", "a@b.c", "m", "archived")) is not None

    def test_valid_contact_status_accepted(self, raw):
        assert _attempt(raw, CONTACT_INSERT, ("N", "a@b.c", "m", "new")) is None


class TestDoctorSearchIndex:
    """
    The composite index on the doctors filter columns.

    find_doctors, the map endpoint and the verification queue all filter on
    is_verified and is_active. Before this index every one was a full table
    scan -- invisible at 36 doctors, a problem at 10,000.
    """

    EXPECTED_INDEX = "ix_doctors_verified_active_city"

    def test_index_exists(self):
        conn = sqlite3.connect(DB_PATH)
        try:
            names = {
                row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='doctors'"
                )
            }
        finally:
            conn.close()
        assert self.EXPECTED_INDEX in names

    def test_index_columns_are_in_selectivity_order(self):
        """
        is_verified, is_active, practice_city.

        The two boolean flags lead because they are the common denominator
        across all three queries; practice_city trails because it is the most
        selective and because trailing it still serves city-only lookups.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            sql = conn.execute(
                "SELECT sql FROM sqlite_master WHERE type='index' AND name=?",
                (self.EXPECTED_INDEX,),
            ).fetchone()[0]
        finally:
            conn.close()

        assert "is_verified" in sql
        assert "is_active" in sql
        assert "practice_city" in sql
        assert sql.index("is_verified") < sql.index("is_active") < sql.index("practice_city")

    @pytest.mark.parametrize("label,sql", [
        ("find_doctors", "SELECT * FROM doctors WHERE is_verified=1 AND is_active=1 AND practice_city LIKE '%bangalore%'"),
        ("map_endpoint", "SELECT * FROM doctors WHERE is_verified=1 AND is_active=1"),
        ("pending_queue", "SELECT * FROM doctors WHERE is_verified=0"),
    ])
    def test_doctor_queries_use_the_index(self, label, sql):
        """
        EXPLAIN QUERY PLAN must show a SEARCH, not a SCAN.

        Asserting on the plan rather than on timing: the dataset is too small for
        timing to be meaningful, but a SCAN means the index is not being used.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            plan = [row[-1] for row in conn.execute("EXPLAIN QUERY PLAN " + sql)]
        finally:
            conn.close()

        assert plan, f"{label}: no query plan"
        assert plan[0].startswith("SEARCH"), (
            f"{label} is not using the index: {plan[0]}"
        )

    def test_models_produce_the_same_index(self):
        """
        The migration and the models are the two sources of truth for the
        schema; this keeps them agreed.
        """
        import os
        import tempfile

        from sqlalchemy import create_engine

        import models  # noqa: F401  -- registers every table

        path = os.path.join(tempfile.mkdtemp(prefix="medassist_idx_"), "idx.db")
        engine = create_engine(f"sqlite:///{path}")
        models.Base.metadata.create_all(bind=engine)
        engine.dispose()

        conn = sqlite3.connect(path)
        try:
            names = {
                row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='doctors'"
                )
            }
        finally:
            conn.close()

        assert self.EXPECTED_INDEX in names


class TestForeignKeyDeleteActions:
    """
    The delete actions are intentionally split, and this pins that.

    appointments is NO ACTION (medical history survives until explicitly
    cleared); patient_settings is CASCADE (derived preference data dies with
    the account). A future refactor that "tidies" these into agreement would
    either destroy appointment history or leave orphaned settings rows, so the
    behaviour is asserted rather than left to convention.
    """

    def test_appointments_block_delete_of_referenced_user(self, db, patient, doctor):
        from sqlalchemy.exc import IntegrityError

        import models

        db.add(models.Appointment(
            patient_id=patient.id, doctor_id=doctor.id,
            appointment_date=future_weekday_obj(), slot_time="10:00",
            symptoms_summary="x", status="Pending",
        ))
        db.commit()

        db.delete(patient)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_appointments_block_delete_of_referenced_doctor(self, db, patient, doctor):
        from sqlalchemy.exc import IntegrityError

        import models

        db.add(models.Appointment(
            patient_id=patient.id, doctor_id=doctor.id,
            appointment_date=future_weekday_obj(), slot_time="10:00",
            symptoms_summary="x", status="Pending",
        ))
        db.commit()

        db.delete(doctor)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_patient_settings_cascade_with_account(self, db, patient):
        """The counter-case: settings are derived, so they die with the account."""
        import models

        db.add(models.PatientSettings(user_id=patient.id, appointment_emails=True))
        db.commit()
        assert db.query(models.PatientSettings).count() == 1

        db.delete(patient)
        db.commit()

        assert db.query(models.PatientSettings).count() == 0

    def test_delete_actions_are_as_declared(self):
        """
        Read the actions back from the schema, so a change to models.py cannot
        silently alter what happens on delete.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            appt_fks = conn.execute(
                "PRAGMA foreign_key_list(appointments)").fetchall()
            settings_fks = conn.execute(
                "PRAGMA foreign_key_list(patient_settings)").fetchall()
        finally:
            conn.close()

        assert {row[6] for row in appt_fks} == {"NO ACTION"}
        assert settings_fks[0][6] == "CASCADE"


class TestConstraintPresence:
    """
    The constraints must exist in the schema, not just in the migration file.

    A migration that is edited after being applied leaves the database and the
    revision disagreeing; this catches that.
    """

    EXPECTED = {
        "doctors": [
            "ck_doctors_consultation_fee_nonneg",
            "ck_doctors_experience_years_nonneg",
            "ck_doctors_slot_duration_positive",
            "ck_doctors_shift_window",
        ],
        "users": ["ck_users_age_range"],
        "appointments": ["ck_appointments_status"],
        "contact_messages": ["ck_contact_messages_status"],
    }

    def test_all_constraints_are_in_the_schema(self):
        conn = sqlite3.connect(DB_PATH)
        try:
            for table, names in self.EXPECTED.items():
                sql = conn.execute(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
                    (table,),
                ).fetchone()[0]
                for name in names:
                    assert name in sql, f"{name} missing from {table}"
        finally:
            conn.close()

    def test_constraints_match_the_models(self):
        """
        `Base.metadata.create_all` must produce the same constraints.

        The migration and the models are the two sources of truth for the
        schema; `test_migrations.py` already compares tables and indexes, and
        this extends that to constraints.
        """
        import os
        import tempfile

        from sqlalchemy import create_engine

        import models  # noqa: F401  -- registers every table

        path = os.path.join(tempfile.mkdtemp(prefix="medassist_ck_"), "ck.db")
        engine = create_engine(f"sqlite:///{path}")
        models.Base.metadata.create_all(bind=engine)
        engine.dispose()

        conn = sqlite3.connect(path)
        try:
            for table, names in self.EXPECTED.items():
                sql = conn.execute(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
                    (table,),
                ).fetchone()[0]
                for name in names:
                    assert name in sql, (
                        f"{name} in the migration but not in the models for {table}"
                    )
        finally:
            conn.close()
