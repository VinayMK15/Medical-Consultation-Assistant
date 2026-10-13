"""
Runtime SQLite configuration: connection pragmas, transaction modes, WAL
checkpointing, and incremental vacuum.

These assert on behaviour that is invisible at the HTTP layer. A regression
here shows up as a slow endpoint or a spurious "database is locked" under
load, not as a failing request -- which is exactly why it needs pinning.
"""

import sqlite3
import threading

import pytest
from conftest import auth_header
from sqlalchemy import text
from test_appointments import book, future_weekday, future_weekday_obj

import database


def _pragmas(db):
    """Read the pragmas in force on the session's connection."""
    conn = db.connection()
    return {
        name: conn.exec_driver_sql(f"PRAGMA {name}").scalar()
        for name in (
            "journal_mode",
            "synchronous",
            "busy_timeout",
            "foreign_keys",
            "cache_size",
            "mmap_size",
            "auto_vacuum",
        )
    }


# ---------------------------------------------------------------------------
# Connection pragmas
# ---------------------------------------------------------------------------
class TestConnectionPragmas:
    def test_wal_is_enabled(self, db):
        assert _pragmas(db)["journal_mode"] == "wal"

    def test_synchronous_is_normal_not_full(self, db):
        """
        FULL (2) fsyncs on every commit. NORMAL (1) still survives an
        application crash and is the documented setting for WAL; only an OS
        crash or power loss can lose a transaction.
        """
        assert _pragmas(db)["synchronous"] == 1

    def test_foreign_keys_are_enforced(self, db):
        assert _pragmas(db)["foreign_keys"] == 1

    def test_busy_timeout_is_set(self, db):
        """
        5000ms, from the explicit PRAGMA rather than only connect_args. A
        short timeout turns ordinary write contention into user-visible 500s.
        """
        assert _pragmas(db)["busy_timeout"] == 5000

    def test_cache_is_larger_than_the_default(self, db):
        """
        Default cache_size is -2000, about 2 MB. This project sets -64000
        (~64 MB) so hot pages stay resident.
        """
        assert _pragmas(db)["cache_size"] == -64000

    def test_memory_mapped_io_is_enabled(self, db):
        assert _pragmas(db)["mmap_size"] == 268435456

    def test_every_new_connection_gets_the_pragmas(self, db):
        """
        journal_mode persists on the file; the rest are per-connection. A
        second connection from the pool must not come up with defaults.
        """
        other = database.SessionLocal()
        try:
            assert _pragmas(other)["foreign_keys"] == 1
            assert _pragmas(other)["cache_size"] == -64000
        finally:
            other.close()


# ---------------------------------------------------------------------------
# Foreign key enforcement actually bites
# ---------------------------------------------------------------------------
class TestForeignKeyEnforcement:
    def test_orphan_appointment_is_rejected(self, db, doctor):
        """
        Proves `foreign_keys=ON` is load-bearing rather than decorative: with
        the pragma off this insert would succeed and leave an appointment
        pointing at a patient that does not exist.
        """
        from sqlalchemy.exc import IntegrityError

        import models

        db.add(models.Appointment(
            patient_id=99999,          # no such user
            doctor_id=doctor.id,
            appointment_date=future_weekday_obj(),
            slot_time="09:00",
            symptoms_summary="orphan",
            status="Pending",
        ))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_cascade_from_patient_settings_works(self, db, patient):
        """
        patient_settings is declared ON DELETE CASCADE, so removing the
        patient must remove the preferences row with it.
        """
        import models

        db.add(models.PatientSettings(user_id=patient.id, appointment_emails=True))
        db.commit()
        assert db.query(models.PatientSettings).count() == 1

        db.delete(db.query(models.User).filter_by(id=patient.id).first())
        db.commit()

        assert db.query(models.PatientSettings).count() == 0

    def test_appointments_do_not_cascade(self, db, doctor):
        """
        The counter-case, and the reason the admin routes delete appointments
        explicitly. This FK is NO ACTION, so the delete must fail while a
        child row exists.
        """
        from sqlalchemy.exc import IntegrityError

        import models

        patient = models.User(
            email="cascade-test@example.com", hashed_password="h",
            full_name="Cascade Test",
        )
        db.add(patient)
        db.commit()

        db.add(models.Appointment(
            patient_id=patient.id, doctor_id=doctor.id,
            appointment_date=future_weekday_obj(), slot_time="10:00",
            symptoms_summary="x", status="Pending",
        ))
        db.commit()

        db.delete(db.query(models.User).filter_by(id=patient.id).first())
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


# ---------------------------------------------------------------------------
# Transaction modes
# ---------------------------------------------------------------------------
class TestBeginImmediate:
    def test_booking_uses_immediate(self, db):
        """
        The booking route reads the doctor, checks both double-booking guards,
        then inserts. Under a deferred transaction that pattern can deadlock;
        BEGIN IMMEDIATE takes the write lock up front instead.
        """
        conn = database.begin_immediate(db)
        db.execute(text("SELECT 1"))
        assert conn.info["last_begin_mode"] == "IMMEDIATE"

    def test_default_transactions_are_deferred(self, db):
        conn = db.connection()
        db.execute(text("SELECT 1"))
        assert conn.info["last_begin_mode"] == "DEFERRED"

    def test_flag_is_consumed_not_persisted(self, db):
        """
        Connections are pooled and requests share threads. If the request
        survived one transaction, every later transaction on that thread --
        including read-only ones -- would take a write lock and serialise the
        application behind itself.
        """
        conn = database.begin_immediate(db)
        db.execute(text("SELECT 1"))
        assert conn.info["last_begin_mode"] == "IMMEDIATE"
        assert not getattr(database._begin_mode, "immediate", False)

    def test_second_transaction_on_same_connection_is_deferred(self):
        """
        The regression test for the leak above, stated as behaviour.

        A rollback returns the connection to the pool, so the next transaction
        may even be a different physical connection. Either way the mode must
        be DEFERRED again.
        """
        session = database.SessionLocal()
        try:
            database.begin_immediate(session)
            session.execute(text("SELECT 1"))
            assert session.connection().info["last_begin_mode"] == "IMMEDIATE"

            session.rollback()
            session.execute(text("SELECT 1"))
            assert session.connection().info["last_begin_mode"] == "DEFERRED"
        finally:
            session.close()

    def test_flag_does_not_survive_a_rolled_back_first_transaction(self):
        """
        A rollback returns the connection to the pool mid-request. The next
        transaction must not inherit IMMEDIATE.
        """
        session = database.SessionLocal()
        try:
            database.begin_immediate(session)
            session.execute(text("SELECT 1"))
            session.rollback()

            session.execute(text("SELECT 1"))
            assert session.connection().info["last_begin_mode"] == "DEFERRED"
        finally:
            session.close()

    def test_concurrent_reads_do_not_serialise(self):
        """
        Four readers, each with its own session and thread, must all complete
        quickly. If every transaction took a write lock they would queue behind
        one another and the run would take several times the busy_timeout.
        """
        import time

        results = []
        lock = threading.Lock()

        def read():
            session = database.SessionLocal()
            try:
                session.execute(text("SELECT COUNT(*) FROM users")).scalar()
                with lock:
                    results.append("ok")
            finally:
                session.close()

        started = time.monotonic()
        threads = [threading.Thread(target=read) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15)
        elapsed = time.monotonic() - started

        assert results == ["ok"] * 4
        assert elapsed < 5.0, f"concurrent reads took {elapsed:.2f}s"


# ---------------------------------------------------------------------------
# WAL checkpoint
# ---------------------------------------------------------------------------
class TestCheckpointWal:
    def test_returns_progress_tuple(self):
        """
        The raw (busy, log_pages, checkpointed) tuple, so a caller choosing an
        exclusive mode can tell whether it actually got the lock.
        """
        busy, log_pages, checkpointed = database.checkpoint_wal("PASSIVE")
        assert busy in (0, 1)
        assert log_pages >= 0
        assert checkpointed >= 0

    def test_committed_data_is_readable_after_checkpoint(self, db):
        import models

        db.add(models.SymptomMapping(symptom="checkpoint-probe",
                                    specialist="Cardiology"))
        db.commit()
        database.checkpoint_wal("PASSIVE")

        db.expire_all()
        assert db.query(models.SymptomMapping).filter_by(
            symptom="checkpoint-probe").first() is not None

    def test_passive_does_not_block_on_an_open_reader(self, db):
        """
        TRUNCATE and RESTART need exclusive access and would sit for the full
        busy_timeout here. PASSIVE is the default for exactly this reason --
        on a running server some request always holds a read transaction.
        """
        import time

        other = database.SessionLocal()
        try:
            other.execute(text("SELECT COUNT(*) FROM users")).scalar()
            assert other.in_transaction(), "expected a read snapshot to be open"

            started = time.monotonic()
            busy, log_pages, checkpointed = database.checkpoint_wal("PASSIVE")
            elapsed = time.monotonic() - started

            # The point of the assertion is the timing. TRUNCATE measured
            # 5.5s against this database's 5000ms busy_timeout; PASSIVE must
            # not wait at all.
            assert elapsed < 1.0, f"PASSIVE blocked for {elapsed:.2f}s"
            assert log_pages >= 0 and checkpointed >= 0
        finally:
            other.close()

    def test_truncate_would_block_where_passive_does_not(self, db):
        """
        Documents why the default is PASSIVE. The assertion is that TRUNCATE is
        materially slower, not that it fails -- it eventually succeeds once the
        reader's transaction ends.
        """
        import time

        other = database.SessionLocal()
        try:
            other.execute(text("SELECT COUNT(*) FROM users")).scalar()

            started = time.monotonic()
            database.checkpoint_wal("TRUNCATE")
            slow = time.monotonic() - started
        finally:
            other.close()

        assert slow > 1.0, (
            "TRUNCATE completed suspiciously fast; if SQLite ever gains a "
            "non-blocking exclusive mode this test should be revisited"
        )


# ---------------------------------------------------------------------------
# Incremental vacuum
# ---------------------------------------------------------------------------
class TestIncrementalVacuum:
    def test_is_a_noop_without_incremental_auto_vacuum(self, db):
        """
        The test database is created with the default auto_vacuum mode, so
        this documents the guard rather than the reclaim.
        """
        assert db.connection().exec_driver_sql("PRAGMA auto_vacuum").scalar() != 2
        assert database.incremental_vacuum() == 0

    def test_reclaims_pages_when_enabled(self, db):
        """
        The real behaviour, on a throwaway database with
        auto_vacuum=INCREMENTAL. Builds a freelist by inserting and deleting
        rows, then checks the pages come back.
        """
        import os
        import tempfile

        path = os.path.join(tempfile.mkdtemp(prefix="medassist_vacuum_"), "vac.db")
        raw = sqlite3.connect(path, isolation_level=None)
        raw.execute("PRAGMA auto_vacuum=INCREMENTAL")
        raw.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT)")
        raw.execute("PRAGMA wal_checkpoint(TRUNCATE)")

        freed_before = 0
        try:
            raw.execute("BEGIN")
            for i in range(400):
                raw.execute("INSERT INTO t (body) VALUES (?)", ("x" * 200,))
            raw.execute("COMMIT")
            raw.execute("DELETE FROM t")
            freed_before = raw.execute("PRAGMA freelist_count").fetchone()[0]
        finally:
            raw.close()

        assert freed_before > 0, "expected the delete to leave a freelist"

        from sqlalchemy import create_engine

        engine = create_engine(f"sqlite:///{path}")
        original_engine = database.engine
        try:
            database.engine = engine
            reclaimed = database.incremental_vacuum()
        finally:
            database.engine = original_engine
            engine.dispose()

        check = sqlite3.connect(path)
        try:
            freed_after = check.execute("PRAGMA freelist_count").fetchone()[0]
        finally:
            check.close()

        assert reclaimed > 0, "incremental_vacuum reclaimed nothing"
        assert freed_after == 0, f"{freed_after} pages still on the freelist"

    def test_bounded_mode_leaves_the_remainder(self, db):
        """
        `pages=N` caps the work, which is how the reclaim gets spread across
        requests instead of holding a lock for the whole freelist.
        """
        import os
        import tempfile

        from sqlalchemy import create_engine

        path = os.path.join(tempfile.mkdtemp(prefix="medassist_vacuum2_"), "vac.db")
        raw = sqlite3.connect(path, isolation_level=None)
        raw.execute("PRAGMA auto_vacuum=INCREMENTAL")
        raw.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT)")
        try:
            raw.execute("BEGIN")
            for i in range(400):
                raw.execute("INSERT INTO t (body) VALUES (?)", ("x" * 200,))
            raw.execute("COMMIT")
            raw.execute("DELETE FROM t")
            total = raw.execute("PRAGMA freelist_count").fetchone()[0]
        finally:
            raw.close()

        engine = create_engine(f"sqlite:///{path}")
        original_engine = database.engine
        try:
            database.engine = engine
            reclaimed = database.incremental_vacuum(pages=3)
        finally:
            database.engine = original_engine
            engine.dispose()

        check = sqlite3.connect(path)
        try:
            remaining = check.execute("PRAGMA freelist_count").fetchone()[0]
        finally:
            check.close()

        assert total > 3
        assert reclaimed == 3, "bounded mode should stop at the requested cap"
        assert remaining == total - 3
