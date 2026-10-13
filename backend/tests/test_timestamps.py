"""
Timestamps: created_at and updated_at.

Before migration 0005, seven mutable tables recorded when a row was created but
not when it last changed, so "when was this record last touched?" was
unanswerable for any of them. `appointments` had neither.

The mechanism is the ORM's `onupdate`, not a SQLite trigger. That choice is
load-bearing and is tested here: triggers are dropped by Alembic's batch mode
whenever it recreates a table, which the two follow-up phases must do, so a
trigger-based updated_at would silently stop updating partway through the
upgrade path with no error raised.
"""

import sqlite3

import pytest
from test_appointments import future_weekday_obj

DB_PATH = "medical_app.db"

# Tables that track created_at and updated_at.
MUTABLE_TABLES = (
    "users",
    "doctors",
    "admin_users",
    "appointments",
    "contact_messages",
    "specializations",
    "symptom_mappings",
)

# Load-once reference data. Inserted by scripts/load_*.py and never updated, so
# updated_at could only ever equal created_at.
REFERENCE_TABLES = ("condition_symptoms", "regional_symptom_keywords", "symptom_aliases")


def _columns(conn, table):
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


class TestColumnPresence:
    @pytest.mark.parametrize("table", MUTABLE_TABLES)
    def test_mutable_tables_have_both_timestamps(self, table):
        conn = sqlite3.connect(DB_PATH)
        try:
            cols = _columns(conn, table)
        finally:
            conn.close()
        assert "created_at" in cols, f"{table} has no created_at"
        assert "updated_at" in cols, f"{table} has no updated_at"

    @pytest.mark.parametrize("table", REFERENCE_TABLES)
    def test_reference_tables_deliberately_excluded(self, table):
        """
        Not an oversight. These tables are load-once, so updated_at would be a
        column that can never differ from created_at.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            cols = _columns(conn, table)
        finally:
            conn.close()
        assert "updated_at" not in cols

    def test_patient_settings_kept_its_existing_column(self):
        """Phase E added columns elsewhere; this one already existed."""
        conn = sqlite3.connect(DB_PATH)
        try:
            assert "updated_at" in _columns(conn, "patient_settings")
        finally:
            conn.close()


class TestSetOnWrite:
    """updated_at is written by the ORM, so it must move on every ORM path."""

    def test_insert_sets_both(self, db, patient):
        assert patient.created_at is not None
        assert patient.updated_at is not None

    def test_inserted_timestamps_are_within_a_microsecond(self, db, patient):
        """
        A freshly inserted row has not been modified, so the two must be within
        microseconds of each other.

        They are not exactly equal, and should not be: the two columns each hold
        their own `default=_utcnow` callable, so the INSERT evaluates them as two
        separate clock reads. Asserting strict equality here would be asserting
        an accident of implementation.
        """
        delta = abs((patient.updated_at - patient.created_at).total_seconds())
        assert delta < 0.001, f"insert timestamps differ by {delta}s"

    def test_attribute_mutation_advances_updated_at(self, db, patient):
        before_created = patient.created_at
        before_updated = patient.updated_at

        patient.phone = "9999999999"
        db.commit()
        db.refresh(patient)

        assert patient.updated_at > before_updated
        assert patient.created_at == before_created, "created_at must never move"

    def test_query_update_advances_updated_at(self, db, patient):
        """
        `Query.update()` is a single bulk UPDATE that bypasses the ORM's change
        detection entirely. onupdate still has to fire, or every admin route
        that writes that way would leave a stale timestamp.
        """
        db.query(type(patient)).filter_by(id=patient.id).update({"phone": "8888888888"})
        db.commit()
        db.refresh(patient)

        assert patient.updated_at > patient.created_at

    def test_appointment_status_change_advances_updated_at(self, db, patient, doctor):
        """
        The main real-world case: an appointment moves Pending -> Confirmed.
        Appointments are the most audit-worthy rows in the schema, which is why
        this table gained both columns rather than only updated_at.
        """
        import models

        appt = models.Appointment(
            patient_id=patient.id,
            doctor_id=doctor.id,
            appointment_date=future_weekday_obj(),
            slot_time="10:00",
            symptoms_summary="x",
            status="Pending",
        )
        db.add(appt)
        db.commit()

        appt.status = "Completed"
        db.commit()
        db.refresh(appt)

        assert appt.status == "Completed"
        assert appt.updated_at > appt.created_at

    def test_no_op_update_does_not_advance(self, db, patient):
        """
        SQLAlchemy issues no UPDATE when nothing changed, so a no-op must leave
        the timestamp alone. A trigger-based implementation would advance it on
        every write regardless.
        """
        before = patient.updated_at
        db.commit()
        db.refresh(patient)
        assert patient.updated_at == before

    def test_timestamps_are_naive_utc(self, db, patient):
        """
        `_utcnow` strips tzinfo. A tz-aware value would be written to SQLite and
        read back as naive anyway, so mixing the two silently shifts timestamps
        by the offset.
        """
        assert patient.created_at.tzinfo is None
        assert patient.updated_at.tzinfo is None


class TestBackfill:
    """
    Existing rows were backfilled in the migration. These run against the live
    database, which is the only place the backfill actually happened.
    """

    @pytest.mark.parametrize("table", MUTABLE_TABLES)
    def test_no_orphan_nulls_where_created_at_exists(self, table):
        """
        updated_at is backfilled from created_at. A row with a created_at but a
        NULL updated_at means the backfill missed it.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            orphans = conn.execute(
                f"SELECT COUNT(*) FROM {table} "
                "WHERE created_at IS NOT NULL AND updated_at IS NULL"
            ).fetchone()[0]
        finally:
            conn.close()
        assert orphans == 0, f"{table}: {orphans} rows have created_at but no updated_at"

    @pytest.mark.parametrize("table", MUTABLE_TABLES)
    def test_no_row_is_updated_before_it_was_created(self, table):
        """
        updated_at can legitimately differ from created_at -- that is the whole
        point of the column, once a row has been written to. What must never
        happen is the reverse: a row whose last-modified time precedes its
        creation time.

        This was originally asserted as "every row still has updated_at ==
        created_at", which only holds until anything writes to the dev
        database. It failed here because a user row really had been updated.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            impossible = conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE updated_at < created_at"
            ).fetchone()[0]
        finally:
            conn.close()
        assert impossible == 0, (
            f"{table}: {impossible} rows have updated_at before created_at"
        )

    def test_rows_without_created_at_keep_null_updated_at(self, db):
        """
        The backfill copies created_at into updated_at. Where created_at is NULL
        the honest answer is no value at all -- inventing one would be a guess
        presented as data.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            count = conn.execute(
                "SELECT COUNT(*) FROM symptom_mappings "
                "WHERE created_at IS NULL AND updated_at IS NOT NULL"
            ).fetchone()[0]
        finally:
            conn.close()
        assert count == 0

    def test_appointments_created_at_was_backfilled(self):
        """
        appointments had no created_at at all. The migration stamped the
        migration time, which is the only value available -- the real booking
        time is not recorded anywhere in the schema.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            total, stamped = conn.execute(
                "SELECT COUNT(*), COUNT(created_at) FROM appointments"
            ).fetchone()
        finally:
            conn.close()
        assert total > 0, "no appointments in the dev database"
        assert stamped == total, "appointments.created_at was not backfilled"


class TestFreshMigrationsAgreeWithModels:
    def test_migrated_schema_has_the_columns(self, fresh_db):
        """A database built from migrations alone carries the same columns."""
        from test_migrations import _alembic

        result = _alembic("upgrade", "head", url=fresh_db)
        assert result.returncode == 0, result.stderr

        conn = sqlite3.connect(fresh_db.replace("sqlite:///", ""))
        try:
            for table in MUTABLE_TABLES:
                cols = _columns(conn, table)
                assert "updated_at" in cols, f"{table} missing updated_at after migration"
                assert "created_at" in cols, f"{table} missing created_at after migration"
        finally:
            conn.close()

    def test_downgrade_removes_the_columns(self, fresh_db):
        """
        Round-trip. A downgrade that left the columns behind would be worse than
        useless -- the next upgrade would try to add them again and fail.
        """
        from test_migrations import _alembic

        _alembic("upgrade", "head", url=fresh_db)
        result = _alembic("downgrade", "0004_doctors_verified_active_city_idx", url=fresh_db)
        assert result.returncode == 0, result.stderr

        conn = sqlite3.connect(fresh_db.replace("sqlite:///", ""))
        try:
            for table in MUTABLE_TABLES:
                assert "updated_at" not in _columns(conn, table), (
                    f"{table}.updated_at survived the downgrade"
                )
            assert "created_at" not in _columns(conn, "appointments"), (
                "appointments.created_at survived the downgrade"
            )
        finally:
            conn.close()

    def test_reupgrade_after_downgrade_works(self, fresh_db):
        """
        The full cycle. Without this, a downgrade that half-dropped something
        would only surface on the next deployment.
        """
        from test_migrations import _alembic

        _alembic("upgrade", "head", url=fresh_db)
        _alembic("downgrade", "0004_doctors_verified_active_city_idx", url=fresh_db)

        result = _alembic("upgrade", "head", url=fresh_db)
        assert result.returncode == 0, result.stderr

        conn = sqlite3.connect(fresh_db.replace("sqlite:///", ""))
        try:
            assert "updated_at" in _columns(conn, "users")
            assert "created_at" in _columns(conn, "appointments")
        finally:
            conn.close()
