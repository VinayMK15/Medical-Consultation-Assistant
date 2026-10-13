import os
import threading
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, declarative_base, sessionmaker

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "medical_app.db")

# `DATABASE_URL` is documented in .env.example but was previously ignored --
# the path below was hardcoded. Honouring the env var is what lets the test
# suite point the app at a throwaway database instead of the dev one.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{DEFAULT_DB_PATH}"

if SQLALCHEMY_DATABASE_URL.startswith("sqlite:///"):
    # Resolve relative paths against the backend directory so the value means
    # the same thing regardless of the shell's working directory.
    _raw_path = SQLALCHEMY_DATABASE_URL[len("sqlite:///"):]
    if _raw_path and not os.path.isabs(_raw_path):
        SQLALCHEMY_DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, _raw_path)}"

_is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # `check_same_thread` is required because FastAPI runs sync endpoints on a
    # threadpool, so one connection can be touched from more than one thread.
    # `timeout` maps to busy_timeout in milliseconds -- how long a writer waits
    # for the write lock before raising "database is locked".
    connect_args={"check_same_thread": False, "timeout": 15} if _is_sqlite else {},
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """
    Apply the per-connection pragmas SQLite needs for a web workload.

    journal_mode is persistent on the file itself, so setting it per connection
    is a no-op after the first time; the others are per-connection and must be
    re-applied every time the pool hands out a new connection.
    """
    if not _is_sqlite:
        return
    cursor = dbapi_connection.cursor()
    try:
        # Hand transaction control to SQLAlchemy rather than pysqlite. The
        # driver otherwise emits its own BEGIN before the first DML statement,
        # which is always DEFERRED -- and DEFERRED cannot be upgraded to a
        # write lock later, so `begin_immediate()` below would have nothing
        # to act on. See the "begin" listener.
        dbapi_connection.isolation_level = None
        # Let readers proceed while a writer holds the write lock.
        cursor.execute("PRAGMA journal_mode=WAL")
        # Durable across application crashes, not across OS crashes. Safe in WAL.
        cursor.execute("PRAGMA synchronous=NORMAL")
        # Explicit rather than relying on connect_args["timeout"] alone, so
        # there is a single source of truth for the lock-wait budget.
        cursor.execute("PRAGMA busy_timeout=5000")
        # SQLite disables FK enforcement by default, per connection.
        cursor.execute("PRAGMA foreign_keys=ON")
        # Negative value = KiB rather than page count. -64000 -> ~64 MB.
        cursor.execute("PRAGMA cache_size=-64000")
        cursor.execute("PRAGMA mmap_size=268435456")
    finally:
        cursor.close()


# Thread-local, because the "begin" event only receives a Connection and the
# caller that wants IMMEDIATE holds a Session. Requests are handled one at a
# time per thread by the session that started them, so this pairs them up.
#
# A flag on the connection itself would not work: SQLAlchemy begins the
# transaction inside `session.connection()`, so anything set beforehand would
# arrive too late, and anything set afterwards would leak into the next
# transaction to reuse that pooled connection.
_begin_mode = threading.local()


@event.listens_for(engine, "begin")
def _begin_transaction(connection):
    """
    Issue the BEGIN statement ourselves, honouring a per-transaction choice of
    IMMEDIATE over the default DEFERRED.

    pysqlite's implicit BEGIN is disabled in the connect listener, so this is
    the only place a transaction starts.

    Why IMMEDIATE matters: a deferred transaction takes a read lock on the
    first read and only asks for a write lock later. Two requests that both
    read before either writes can deadlock -- each holds the read lock the
    other needs in order to upgrade, and one fails with SQLITE_BUSY at commit.
    IMMEDIATE takes the write lock up front, so the loser waits on
    `busy_timeout` instead. With no contention the lock is free, so this costs
    nothing.

    The flag is consumed, not read. Left set, it would make every subsequent
    transaction start as IMMEDIATE -- including read-only ones, which would
    then hold a write lock for no reason and serialise the application behind
    itself.
    """
    immediate = getattr(_begin_mode, "immediate", False)
    _begin_mode.immediate = False
    mode = "IMMEDIATE" if immediate else "DEFERRED"
    connection.info["last_begin_mode"] = mode
    connection.exec_driver_sql(f"BEGIN {mode}")


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def begin_immediate(db: Session) -> Any:
    """
    Make this session's *next* transaction start as `BEGIN IMMEDIATE`.

    Returns the connection, whose `info["last_begin_mode"]` then reads back as
    `"IMMEDIATE"` once the transaction has begun:

        conn = begin_immediate(db)
        db.query(...)          # begins the transaction
        assert conn.info["last_begin_mode"] == "IMMEDIATE"

    Calling this also begins the transaction, so the flag is in place before
    any query runs. Returns the connection, whose
    `info["last_begin_mode"]` then reads back as `"IMMEDIATE"`:

        conn = begin_immediate(db)
        assert conn.info["last_begin_mode"] == "IMMEDIATE"

    Only meaningful on a read-then-write path. A write-only transaction gains
    nothing, and a read-only one pays for a write lock it never uses.

    The request applies to one transaction only and is cleared by the `begin`
    listener, so neither the pooled connection nor the next request inherits it.
    """
    _begin_mode.immediate = True
    return db.connection()


def checkpoint_wal(mode: str = "PASSIVE") -> tuple[int, int, int]:
    """
    Fold the WAL back into the main database file.

    WAL mode leaves committed pages in `medical_app.db-wal` until a checkpoint
    runs, so that sidecar grows and a plain copy of the `.db` alone is not a
    complete snapshot.

    Defaults to PASSIVE, which copies whatever it can and returns immediately.
    TRUNCATE and RESTART need exclusive access to reset the WAL file, so
    either will sit for the full `busy_timeout` if any other connection still
    holds a read transaction -- which on a running server is essentially
    always. Measured at 5.5s against this database's 5000ms timeout.

    Return the raw `(busy, log_pages, checkpointed)` tuple so a caller that
    does want TRUNCATE can tell whether it actually acquired the lock.
    """
    if not _is_sqlite:
        return (0, 0, 0)
    with engine.connect() as conn:
        row = conn.exec_driver_sql(f"PRAGMA wal_checkpoint({mode})").one()
        return (int(row[0]), int(row[1]), int(row[2]))


def incremental_vacuum(pages: int = 0) -> int:
    """
    Reclaim free pages at the end of the file without a table lock.

    A full `VACUUM` rewrites the entire database and needs exclusive access,
    which on a web app means downtime. `incremental_vacuum` does a bounded
    amount of work instead: `pages=0` frees everything reclaimable, any other
    value caps how many pages this call touches, which is how you spread the
    work across requests.

    Requires `PRAGMA auto_vacuum=INCREMENTAL`, set once with a full VACUUM
    before it can take effect. Returns the number of pages reclaimed.

    No-op on a database whose auto_vacuum mode is NONE.

    Note the loop: `PRAGMA incremental_vacuum` with no argument reclaims one
    page per statement, not the whole freelist, and only makes progress while a
    transaction is open. Issuing it once and moving on silently frees a single
    page, which looks like it worked.
    """
    if not _is_sqlite:
        return 0
    with engine.connect() as conn:
        if conn.exec_driver_sql("PRAGMA auto_vacuum").scalar() != 2:
            return 0  # not INCREMENTAL

        before = conn.exec_driver_sql("PRAGMA freelist_count").scalar() or 0
        limit = pages if pages else before
        reclaimed = 0

        while reclaimed < limit:
            conn.exec_driver_sql("PRAGMA incremental_vacuum(1)")
            reclaimed += 1
            # Stop early once there is nothing left to take.
            if (conn.exec_driver_sql("PRAGMA freelist_count").scalar() or 0) == 0:
                break

        # The pages are only really released once the transaction commits;
        # without this the connection closes and rolls the work back.
        conn.commit()
        return reclaimed


def get_db():
    """
    FastAPI dependency that yields a database session per request
    and ensures it is closed in a finally block.

    Usage:
        from database import get_db
        from sqlalchemy.orm import Session
        from fastapi import Depends

        @app.get("/example")
        def example(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
