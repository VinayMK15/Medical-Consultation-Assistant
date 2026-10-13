"""
AUTOINCREMENT on the surrogate primary keys.

This is a security control, not a tidiness one.

The JWT `sub` claim is the account id, and `get_current_account` resolves it
with `WHERE id == <sub>`. A plain INTEGER PRIMARY KEY in SQLite issues
`max(rowid) + 1`, so deleting the highest-numbered account frees its id for the
next signup. A still-unexpired token minted for the deleted account then
resolves to whoever inherited the id.

That was confirmed end-to-end against the running app before the migration was
written: a deleted patient's live JWT returned HTTP 200 with the *new* account's
profile. `TestDeletedAccountsTokenIsRejected` below is that scenario, kept as a
regression test.

AUTOINCREMENT keeps a high-water mark in `sqlite_sequence`, so an id is never
reissued after its row is gone.
"""

import os
import sqlite3
import tempfile

import pytest

DB_PATH = "medical_app.db"

# Every table with a surrogate integer primary key.
AUTOINCREMENT_TABLES = (
    "users",
    "doctors",
    "admin_users",
    "appointments",
    "contact_messages",
    "specializations",
    "symptom_mappings",
    "condition_symptoms",
    "regional_symptom_keywords",
    "symptom_aliases",
)

# Primary key is a foreign key, not a surrogate id.
NO_AUTOINCREMENT_TABLES = ("patient_settings",)


def _ddl(conn, table):
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE name = ?", (table,)
    ).fetchone()
    return (row[0] or "") if row else ""


def _has_autoincrement(conn, table):
    return "AUTOINCREMENT" in _ddl(conn, table).upper()


class TestSchema:
    @pytest.mark.parametrize("table", AUTOINCREMENT_TABLES)
    def test_table_has_autoincrement(self, table):
        conn = sqlite3.connect(DB_PATH)
        try:
            assert _has_autoincrement(conn, table), (
                f"{table} is missing AUTOINCREMENT; a deleted row's id can be "
                "reissued and any live token for it will authenticate as "
                "whoever inherits it"
            )
        finally:
            conn.close()

    @pytest.mark.parametrize("table", NO_AUTOINCREMENT_TABLES)
    def test_foreign_key_pk_excluded(self, table):
        """
        patient_settings is keyed on user_id. AUTOINCREMENT is meaningless on a
        foreign key and would be a mistake, not an omission.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            assert not _has_autoincrement(conn, table)
        finally:
            conn.close()

    @pytest.mark.parametrize("table", AUTOINCREMENT_TABLES)
    def test_sqlite_sequence_has_exactly_one_row(self, table):
        """
        A duplicate row makes the next issued id undefined.

        An earlier draft of the migration seeded the mark with
        `INSERT ... SELECT MAX(id) ... WHERE NOT EXISTS (...)`, which inserted a
        second row per table: SQLite materialises the SELECT before the
        NOT EXISTS guard is consulted, so the guard never held. This test is
        why that bug cannot come back.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            rows = conn.execute(
                "SELECT COUNT(*) FROM sqlite_sequence WHERE name = ?", (table,)
            ).fetchone()[0]
        finally:
            conn.close()
        assert rows <= 1, f"{table}: {rows} rows in sqlite_sequence, expected at most 1"

    @pytest.mark.parametrize("table", AUTOINCREMENT_TABLES)
    def test_sequence_mark_is_at_least_max_id(self, table):
        """
        If the mark sits below the highest surviving id, SQLite will issue a
        duplicate the next time that row is deleted. The rebuild's copy raises
        the mark to the highest id ever issued, which is why
        symptom_mappings is 91 and not 89.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            seq = conn.execute(
                "SELECT seq FROM sqlite_sequence WHERE name = ?", (table,)
            ).fetchone()
            max_id = conn.execute(
                f"SELECT COALESCE(MAX(id), 0) FROM {table}"
            ).fetchone()[0]
        finally:
            conn.close()
        if max_id == 0:
            pytest.skip(f"{table} is empty")
        assert seq is not None, f"{table} has no sqlite_sequence row"
        assert seq[0] >= max_id, (
            f"{table}: sqlite_sequence is {seq[0]} but max(id) is {max_id}; "
            "that id could be issued twice"
        )


class testIdIsNeverReissued:
    """
    The actual guarantee. These run against a scratch database built by
    `create_all`, so they exercise the models rather than the dev file.
    """

    @pytest.fixture
    def scratch(self):
        from sqlalchemy import create_engine

        import models

        path = os.path.join(tempfile.mkdtemp(prefix="medassist_autoinc_"), "a.db")
        engine = create_engine(f"sqlite:///{path}")
        models.Base.metadata.create_all(bind=engine)
        yield path
        engine.dispose()

    def test_delete_highest_id_then_insert(self, scratch):
        conn = sqlite3.connect(scratch)
        try:
            conn.executescript(
                "INSERT INTO users (email, hashed_password, full_name, "
                "reset_failed_attempts, token_version) "
                "VALUES ('a@x.com','h','A',0,0),('b@x.com','h','B',0,0);"
            )
            conn.commit()
            highest = conn.execute("SELECT MAX(id) FROM users").fetchone()[0]

            conn.execute("DELETE FROM users WHERE id = ?", (highest,))
            conn.commit()
            conn.execute(
                "INSERT INTO users (email, hashed_password, full_name, "
                "reset_failed_attempts, token_version) "
                "VALUES ('c@x.com','h','C',0,0)"
            )
            conn.commit()

            new_id = conn.execute(
                "SELECT id FROM users WHERE email = 'c@x.com'"
            ).fetchone()[0]
        finally:
            conn.close()

        assert new_id != highest, (
            f"id {highest} was reissued after its row was deleted"
        )
        assert new_id > highest

    def test_delete_middle_id_then_insert(self, scratch):
        """A freed middle id must also not come back."""
        conn = sqlite3.connect(scratch)
        try:
            conn.executescript(
                "INSERT INTO users (email, hashed_password, full_name, "
                "reset_failed_attempts, token_version) "
                "VALUES ('a@x.com','h','A',0,0),('b@x.com','h','B',0,0),"
                "('c@x.com','h','C',0,0);"
            )
            conn.commit()
            conn.execute("DELETE FROM users WHERE id = 2")
            conn.commit()
            conn.execute(
                "INSERT INTO users (email, hashed_password, full_name, "
                "reset_failed_attempts, token_version) "
                "VALUES ('d@x.com','h','D',0,0)"
            )
            conn.commit()
            rows = [r[0] for r in conn.execute("SELECT id FROM users ORDER BY id")]
        finally:
            conn.close()

        assert 2 not in rows
        assert len(rows) == len(set(rows)), f"duplicate ids: {rows}"


class TestDeletedAccountsTokenIsRejected:
    """
    The vulnerability this migration closes, as an end-to-end regression test.

    Uses the real router, the real JWT helpers and the real dependency wiring.
    """

    def test_deleted_accounts_token_is_rejected(self, client, db, patient):
        import models
        from auth_utils import create_access_token

        patient_id = patient.id
        token = create_access_token({
            "sub": str(patient_id), "role": "patient",
            "email": patient.email, "ver": patient.token_version or 0,
        })

        # The token authenticates before the account is deleted.
        ok = client.get("/api/patient/profile",
                        headers={"Authorization": f"Bearer {token}"})
        assert ok.status_code == 200

        # Admin deletes the account (admin_delete_user).
        db.delete(patient)
        db.commit()

        # A new patient registers.
        replacement = models.User(
            email="replacement@example.com", hashed_password="h",
            full_name="Replacement",
        )
        db.add(replacement)
        db.commit()
        db.refresh(replacement)

        if replacement.id == patient_id:
            pytest.fail(
                f"replacement inherited id {patient_id}; AUTOINCREMENT is not "
                "in effect and the deleted patient's token now authenticates "
                "as them"
            )

        after = client.get("/api/patient/profile",
                           headers={"Authorization": f"Bearer {token}"})
        assert after.status_code == 401, (
            f"deleted patient's token returned {after.status_code} after a new "
            "account took over its id"
        )


class TestMigrationPreservesEverything:
    """
    The rebuild touches every table, so these guard against collateral damage.
    Run against a database built by Alembic alone.
    """

    @pytest.fixture
    def migrated(self, fresh_db):
        from conftest import _alembic

        result = _alembic("upgrade", "head", url=fresh_db)
        assert result.returncode == 0, result.stderr
        return fresh_db

    @pytest.mark.parametrize("table", AUTOINCREMENT_TABLES)
    def test_migration_produces_autoincrement(self, migrated, table):
        conn = sqlite3.connect(migrated.replace("sqlite:///", ""))
        try:
            assert _has_autoincrement(conn, table)
        finally:
            conn.close()

    def test_migration_preserves_check_constraints(self, migrated):
        """A rebuild that drops CHECKs would undo Phase A."""
        conn = sqlite3.connect(migrated.replace("sqlite:///", ""))
        try:
            conn.execute("PRAGMA foreign_keys=ON")
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO users (email, hashed_password, full_name, age, "
                    "reset_failed_attempts, token_version) "
                    "VALUES ('a@x.com','h','A',500,0,0)"
                )
            conn.rollback()

            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO appointments (patient_id, doctor_id, "
                    "appointment_date, slot_time, symptoms_summary, status) "
                    "VALUES (1,1,'2030-01-01','10:00','x','Bogus')"
                )
            conn.rollback()
        finally:
            conn.close()

    def test_migration_preserves_foreign_keys(self, migrated):
        conn = sqlite3.connect(migrated.replace("sqlite:///", ""))
        try:
            conn.execute("PRAGMA foreign_keys=ON")
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO doctors (email, hashed_password, full_name, "
                    "specialization, qualifications, license_number, phone, "
                    "practice_city, practice_address, shift_start, shift_end, "
                    "slot_duration_minutes, token_version) VALUES "
                    "('d@x.com','h','D','Cardiologis','MBBS','L1','+91',"
                    "'Bangalore','MG Road','09:00','17:00',30,0)"
                )
            conn.rollback()
        finally:
            conn.close()

    def test_migration_preserves_the_partial_index(self, migrated):
        """
        SQLAlchemy's Index cannot express a WHERE clause, so the partial index
        is recreated as raw DDL by the migration. If that were dropped, a
        cancelled booking could never be rebooked.
        """
        conn = sqlite3.connect(migrated.replace("sqlite:///", ""))
        try:
            sql = conn.execute(
                "SELECT sql FROM sqlite_master WHERE name = 'uq_doctor_date_slot'"
            ).fetchone()
            assert sql is not None, "uq_doctor_date_slot was dropped by the rebuild"
            assert "Cancelled" in sql[0], (
                f"index is no longer partial: {sql[0]}"
            )
        finally:
            conn.close()

    def test_migration_preserves_indexes(self, migrated):
        expected = {
            "users": {"ix_users_email", "ix_users_reset_token"},
            "doctors": {"ix_doctors_email", "ix_doctors_reset_token",
                        "ix_doctors_verified_active_city"},
            "appointments": {"ix_appointments_patient_id",
                             "ix_appointments_doctor_date", "uq_doctor_date_slot"},
            "condition_symptoms": {"ix_condition_symptoms_disease",
                                   "ix_condition_symptoms_symptom",
                                   "uq_condition_symptom"},
        }
        conn = sqlite3.connect(migrated.replace("sqlite:///", ""))
        try:
            for table, names in expected.items():
                actual = {
                    r[0] for r in conn.execute(
                        "SELECT name FROM sqlite_master WHERE type='index' "
                        "AND tbl_name = ?", (table,)
                    )
                }
                missing = names - actual
                assert not missing, f"{table}: missing indexes {missing}"
        finally:
            conn.close()

    def test_migration_preserves_phase_e_timestamps(self, migrated):
        """
        Phase E's updated_at is ORM-managed, so a rebuild cannot break the
        column -- but it can silently drop it if the table definition drifts.
        """
        conn = sqlite3.connect(migrated.replace("sqlite:///", ""))
        try:
            for table in ("users", "doctors", "appointments", "admin_users",
                          "contact_messages", "specializations",
                          "symptom_mappings"):
                cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
                assert "created_at" in cols, f"{table} lost created_at"
                assert "updated_at" in cols, f"{table} lost updated_at"
        finally:
            conn.close()


class TestModelsMatchMigrations:
    def test_create_all_produces_the_same_autoincrement_set(self):
        """
        models.py and the migrations are the two sources of truth. This is what
        keeps them from drifting on AUTOINCREMENT specifically, which
        test_migrations.py's table-and-index comparison does not cover.
        """
        from sqlalchemy import create_engine

        import models

        path = os.path.join(tempfile.mkdtemp(prefix="medassist_ai_models_"), "m.db")
        engine = create_engine(f"sqlite:///{path}")
        models.Base.metadata.create_all(bind=engine)
        engine.dispose()

        conn = sqlite3.connect(path)
        try:
            for (table,) in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version' "
                "ORDER BY name"
            ):
                expected = table not in NO_AUTOINCREMENT_TABLES
                assert _has_autoincrement(conn, table) == expected, (
                    f"{table}: create_all and the migration disagree on "
                    "AUTOINCREMENT"
                )
        finally:
            conn.close()

    def test_live_database_matches_models(self):
        conn = sqlite3.connect(DB_PATH)
        try:
            for table in AUTOINCREMENT_TABLES + NO_AUTOINCREMENT_TABLES:
                expected = table not in NO_AUTOINCREMENT_TABLES
                assert _has_autoincrement(conn, table) == expected, (
                    f"{table}: live database disagrees with the models"
                )
        finally:
            conn.close()
