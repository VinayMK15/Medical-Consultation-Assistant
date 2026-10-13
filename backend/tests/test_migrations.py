"""
Migration tests.

These run Alembic as a subprocess against a throwaway database file, then
compare the resulting schema against the one the models describe. That closes
the gap that let the original five-revision chain ship: nobody checked that
`alembic upgrade head` produced the schema the app actually runs on.

Each test builds a fresh file, so a failure names the specific divergence
rather than leaving the next run to trip over the last one's leftovers.
"""

import os
import sqlite3
import tempfile

import pytest
from conftest import _alembic  # noqa: F401  -- re-exported for this module's tests

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _schema_objects(url, kind):
    path = url.replace("sqlite:///", "")
    conn = sqlite3.connect(path)
    try:
        return {
            row[0]: row[1]
            for row in conn.execute(
                "SELECT name, sql FROM sqlite_master "
                "WHERE type = ? AND name NOT LIKE 'sqlite_%' "
                "ORDER BY name",
                (kind,),
            )
        }
    finally:
        conn.close()


def _tables(url):
    return set(_schema_objects(url, "table"))


def _indexes(url):
    return set(_schema_objects(url, "index"))


class TestUpgrade:
    def test_upgrade_head_succeeds_on_empty_file(self, fresh_db):
        result = _alembic("upgrade", "head", url=fresh_db)
        assert result.returncode == 0, result.stderr

    def test_creates_every_expected_table(self, fresh_db):
        _alembic("upgrade", "head", url=fresh_db)

        expected = {
            "users", "doctors", "admin_users", "appointments",
            "patient_settings", "specializations", "symptom_mappings",
            "condition_symptoms", "regional_symptom_keywords", "symptom_aliases",
            "alembic_version",
        }
        assert expected <= _tables(fresh_db)

    def test_creates_the_partial_unique_index(self, fresh_db):
        """
        The regression this whole phase exists for. A plain UNIQUE constraint
        would forbid a patient rebooking a slot they had just cancelled.
        """
        _alembic("upgrade", "head", url=fresh_db)

        idx = _schema_objects(fresh_db, "index").get("uq_doctor_date_slot", "")
        assert "UNIQUE INDEX" in idx.upper()
        assert "WHERE status != 'Cancelled'" in idx

    def test_creates_the_lookup_indexes_the_routes_need(self, fresh_db):
        """
        `EXPLAIN QUERY PLAN` on the live database showed a full SCAN for both
        of these paths before they were indexed.
        """
        _alembic("upgrade", "head", url=fresh_db)

        indexes = _indexes(fresh_db)
        assert "ix_appointments_patient_id" in indexes
        assert "ix_appointments_doctor_date" in indexes

    def test_records_the_revision(self, fresh_db):
        _alembic("upgrade", "head", url=fresh_db)

        path = fresh_db.replace("sqlite:///", "")
        conn = sqlite3.connect(path)
        try:
            rows = conn.execute("SELECT version_num FROM alembic_version").fetchall()
        finally:
            conn.close()
        assert rows == [("0006_autoincrement",)]

    def test_is_idempotent_when_already_at_head(self, fresh_db):
        _alembic("upgrade", "head", url=fresh_db)
        before = _tables(fresh_db)

        result = _alembic("upgrade", "head", url=fresh_db)
        assert result.returncode == 0, result.stderr
        assert _tables(fresh_db) == before

    def test_foreign_keys_are_declared(self, fresh_db):
        _alembic("upgrade", "head", url=fresh_db)

        path = fresh_db.replace("sqlite:///", "")
        conn = sqlite3.connect(path)
        try:
            appt_fks = conn.execute(
                "PRAGMA foreign_key_list(appointments)").fetchall()
            settings_fks = conn.execute(
                "PRAGMA foreign_key_list(patient_settings)").fetchall()
        finally:
            conn.close()

        assert {r[3] for r in appt_fks} == {"patient_id", "doctor_id"}
        # patient_settings cascades; appointments does not.
        assert settings_fks[0][2] == "users"
        assert settings_fks[0][6] == "CASCADE"

    def test_upgraded_schema_matches_the_models(self, fresh_db):
        """
        The core guarantee: `alembic upgrade head` produces exactly what
        `Base.metadata.create_all` produces. Any divergence between the
        migrations and the models is a bug in one of them.
        """
        _alembic("upgrade", "head", url=fresh_db)

        from sqlalchemy import create_engine

        import models  # noqa: F401  -- registers every table

        model_url = "sqlite:///" + os.path.join(
            tempfile.mkdtemp(prefix="medassist_models_"), "models.db"
        )
        engine = create_engine(model_url)
        models.Base.metadata.create_all(bind=engine)
        engine.dispose()

        migrated_tables = _tables(fresh_db) - {"alembic_version"}
        model_tables = _tables(model_url)

        assert migrated_tables == model_tables

        # Compare index names too: a missing index means a slow query that no
        # test would notice.
        migrated_indexes = _indexes(fresh_db)
        model_indexes = _indexes(model_url)
        # The models no longer declare index=True on primary keys, so a
        # divergence here is meaningful.
        assert migrated_indexes == model_indexes


class TestDataIntegrity:
    def test_partial_index_rejects_duplicate_active_bookings(self, fresh_db):
        """The invariant the booking route relies on."""
        _alembic("upgrade", "head", url=fresh_db)

        path = fresh_db.replace("sqlite:///", "")
        conn = sqlite3.connect(path)
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            # The FK on doctors.specialization requires a referenced row, and
            # this fresh database has none.
            conn.execute(
                "INSERT INTO specializations (name) VALUES ('Cardiologist')")
            conn.execute(
                "INSERT INTO users (id, email, hashed_password, full_name) "
                "VALUES (1, 'p@x.com', 'h', 'P')")
            conn.execute(
                "INSERT INTO doctors (id, email, hashed_password, full_name, "
                "specialization, qualifications, license_number, phone, "
                "practice_city, practice_address, shift_start, shift_end, "
                "slot_duration_minutes) VALUES "
                "(1, 'd@x.com', 'h', 'D', 'Cardiologist', 'MBBS', 'L1', "
                "'+91', 'Bangalore', 'MG Road', '09:00', '17:00', 30)")
            conn.execute(
                "INSERT INTO appointments (patient_id, doctor_id, "
                "appointment_date, slot_time, symptoms_summary, status) "
                "VALUES (1, 1, '2030-01-01', '10:00', 'x', 'Pending')")

            import sqlite3 as s3
            with pytest.raises(s3.IntegrityError):
                conn.execute(
                    "INSERT INTO appointments (patient_id, doctor_id, "
                    "appointment_date, slot_time, symptoms_summary, status) "
                    "VALUES (1, 1, '2030-01-01', '10:00', 'y', 'Pending')")
        finally:
            conn.rollback()
            conn.close()

    def test_partial_index_permits_rebooking_a_cancelled_slot(self, fresh_db):
        _alembic("upgrade", "head", url=fresh_db)

        path = fresh_db.replace("sqlite:///", "")
        conn = sqlite3.connect(path)
        try:
            conn.execute(
                "INSERT INTO users (id, email, hashed_password, full_name) "
                "VALUES (1, 'p@x.com', 'h', 'P')")
            conn.execute(
                "INSERT INTO doctors (id, email, hashed_password, full_name, "
                "specialization, qualifications, license_number, phone, "
                "practice_city, practice_address, shift_start, shift_end, "
                "slot_duration_minutes) VALUES "
                "(1, 'd@x.com', 'h', 'D', 'Cardiologist', 'MBBS', 'L1', "
                "'+91', 'Bangalore', 'MG Road', '09:00', '17:00', 30)")
            conn.execute(
                "INSERT INTO appointments (patient_id, doctor_id, "
                "appointment_date, slot_time, symptoms_summary, status) "
                "VALUES (1, 1, '2030-01-01', '10:00', 'x', 'Cancelled')")
            # Must not raise: the cancelled row is outside the index predicate.
            conn.execute(
                "INSERT INTO appointments (patient_id, doctor_id, "
                "appointment_date, slot_time, symptoms_summary, status) "
                "VALUES (1, 1, '2030-01-01', '10:00', 'y', 'Pending')")
            conn.commit()

            count = conn.execute(
                "SELECT COUNT(*) FROM appointments WHERE slot_time = '10:00'"
            ).fetchone()[0]
            assert count == 2
        finally:
            conn.close()


class TestDowngrade:
    def test_downgrade_drops_everything(self, fresh_db):
        _alembic("upgrade", "head", url=fresh_db)
        assert "users" in _tables(fresh_db)

        result = _alembic("downgrade", "base", url=fresh_db)
        assert result.returncode == 0, result.stderr

        remaining = _tables(fresh_db) - {"alembic_version"}
        assert remaining == set()

    def test_upgrade_after_downgrade_works(self, fresh_db):
        _alembic("upgrade", "head", url=fresh_db)
        _alembic("downgrade", "base", url=fresh_db)

        result = _alembic("upgrade", "head", url=fresh_db)
        assert result.returncode == 0, result.stderr
        assert "appointments" in _tables(fresh_db)


class TestCurrent:
    def test_live_database_is_at_head(self):
        """
        The checked-in dev database must not be stranded below head. If this
        fails, run `alembic stamp head` after confirming the file matches.
        """
        live = "sqlite:///" + os.path.join(BACKEND_DIR, "medical_app.db")
        if not os.path.exists(live.replace("sqlite:///", "")):
            pytest.skip("no local dev database present")

        result = _alembic("current", url=live)
        assert result.returncode == 0, result.stderr
        assert "0006_autoincrement" in result.stdout
