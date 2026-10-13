"""
Pytest fixtures for the MedAssist backend test suite.

Every test runs against a throwaway SQLite file created in a pytest tmp dir.
The dev database (`backend/medical_app.db`) is never touched: `database.py`
reads `DATABASE_URL`, so the value must be set *before* anything imports it.
That happens at import time of this module, which pytest loads before test
modules.
"""

import os
import sqlite3
import tempfile

# ---------------------------------------------------------------------------
# Point the app at a temp database before `database` is imported anywhere.
# ---------------------------------------------------------------------------
_TEST_DB_DIR = tempfile.mkdtemp(prefix="medassist_tests_")
_TEST_DB_PATH = os.path.join(_TEST_DB_DIR, "test.db")

os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"

# Keep the suite offline and deterministic: no LLM calls, no outbound geocoding,
# no SMTP. The code under test reads these at call time, not import time, so
# they can also be set per-test if needed.
os.environ["OLLAMA_ENABLED"] = "false"
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-used-in-production-0123456789")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from passlib.context import CryptContext  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _alembic(*args, url):
    """Run an alembic subcommand against a specific database file."""
    import subprocess
    import sys

    env = dict(os.environ)
    env["DATABASE_URL"] = url
    env["PYTHONPATH"] = BACKEND_DIR
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )

import database  # noqa: E402
import models  # noqa: E402,F401  -- registers tables on Base.metadata
from auth_utils import get_password_hash  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema():
    """Create every table once for the whole session."""
    models.Base.metadata.create_all(bind=database.engine)
    yield
    models.Base.metadata.drop_all(bind=database.engine)


@pytest.fixture(autouse=True)
def clean_tables(_schema):
    """
    Empty every table between tests, leaving the schema in place.

    Rows are deleted child-first, in dependency order, so foreign keys stay
    satisfied throughout. `PRAGMA foreign_keys=OFF` is not an option here:
    SQLite documents that pragma as a no-op inside a transaction, and every
    statement below runs in one.
    """
    from sqlalchemy import text

    ordered = _deletion_order()
    with database.engine.begin() as conn:
        for table in ordered:
            conn.execute(text(f'DELETE FROM "{table}"'))
    yield


def _deletion_order():
    """
    Tables sorted so children are cleared before the parents they reference.

    Deleting a parent while its children still hold rows raises a FOREIGN KEY
    error, so a table is safe only once nothing still-present references it.

    That is the reverse of the usual dependency sort: `appointments` depends on
    `users`, which means `appointments` must be deleted first. Cycles cannot
    occur in this schema, and anything unresolvable is appended so a stray
    table still gets cleared.
    """
    metadata = models.Base.metadata
    remaining = set(metadata.tables)
    ordered = []

    def references(table_name):
        """Tables that `table_name` points at via a foreign key."""
        return {fk.column.table.name
                for fk in metadata.tables[table_name].foreign_keys}

    while remaining:
        # Referenced-by set, restricted to what is still present.
        still_referenced = set()
        for name in remaining:
            still_referenced |= references(name) & remaining

        ready = sorted(remaining - still_referenced)
        if not ready:
            # A cycle. Fall back to alphabetical so the run still completes.
            ordered.extend(sorted(remaining))
            break
        ordered.extend(ready)
        remaining -= set(ready)

    return ordered


@pytest.fixture
def db() -> Session:
    """A direct session for arranging fixtures and asserting on state."""
    session = database.SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _seed_specializations(db, clean_tables):
    """
    Seed the specializations table.

    doctors.specialization is a FK to specializations.name, so any test that
    creates a doctor needs at least one valid row to reference. Without this the
    doctor fixture itself would fail the constraint.

    Depends on `clean_tables` explicitly: both are autouse, and pytest does not
    guarantee ordering between them. `clean_tables` empties every table, so if
    it ran after this fixture the rows would already be gone.
    """
    import models

    names = [
        "Cardiologist", "Dermatologist", "ENT Specialist", "Endocrinologist",
        "Gastroenterologist", "General Physician", "Gynecologist",
        "Internal Medicine", "Neurologist", "Oncologist", "Ophthalmologist",
        "Orthopedic Surgeon", "Pediatrician", "Psychiatrist", "Pulmonologist",
        "Urologist",
    ]
    for name in names:
        if not db.query(models.Specialization).filter_by(name=name).first():
            db.add(models.Specialization(name=name))
    db.commit()
    yield


@pytest.fixture
def client(db: Session, _seed_specializations):
    """
    TestClient whose `get_db` dependency yields the shared session.

    The session is rolled back after each request rather than left open. This
    mirrors production, where `get_db` closes the session -- and it matters:
    database.py issues `BEGIN DEFERRED` explicitly, so every request opens a
    transaction even to read. Left open, those snapshots accumulate and stop
    WAL checkpoints from completing, which stalls the next write.
    """
    from main import app

    def _override_get_db():
        try:
            yield db
        finally:
            if db.in_transaction():
                db.rollback()

    app.dependency_overrides[database.get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Record factories
# ---------------------------------------------------------------------------
TEST_PASSWORD = "Str0ngPass!"


def _mk_patient(db: Session, **overrides):
    defaults: dict = dict(
        email="patient@example.com",
        hashed_password=get_password_hash(TEST_PASSWORD),
        full_name="Test Patient",
        age=30,
        gender="Other",
        # "Bangalore" rather than "Bengaluru": normalize_city canonicalises
        # both to "Bangalore", and find_doctors matches on that canonical
        # form, so a fixture using the other name would never match.
        home_city="Bangalore",
        home_address="MG Road, Bangalore",
        home_lat=12.9716,
        home_lng=77.5946,
    )
    defaults.update(overrides)
    user = models.User(**defaults)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _mk_doctor(db: Session, **overrides):
    defaults: dict = dict(
        email="doctor@example.com",
        hashed_password=get_password_hash(TEST_PASSWORD),
        full_name="Dr. Test",
        # Must match a row in the specializations table -- doctors.specialization
        # is a FK to specializations.name, so a doctor cannot be created with a
        # value that has no matching row.
        specialization="Cardiologist",
        experience_years=5,
        qualifications="MBBS, MD",
        license_number="LIC-001",
        phone="+910000000000",
        practice_city="Bangalore",
        practice_address="MG Road, Bangalore",
        practice_lat=12.9716,
        practice_lng=77.5946,
        shift_start="09:00",
        shift_end="17:00",
        slot_duration_minutes=30,
        blocked_dates=[],
        is_verified=True,
        is_active=True,
    )
    defaults.update(overrides)
    doctor = models.Doctor(**defaults)
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return doctor


def _mk_admin(db: Session, **overrides):
    defaults: dict = dict(
        email="admin@example.com",
        hashed_password=get_password_hash(TEST_PASSWORD),
        full_name="Test Admin",
        role="admin",
        is_active=True,
    )
    defaults.update(overrides)
    admin = models.AdminUser(**defaults)
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


@pytest.fixture
def patient(db):
    return _mk_patient(db)


@pytest.fixture
def patient2(db):
    return _mk_patient(db, email="patient2@example.com", full_name="Second Patient")


@pytest.fixture
def doctor(db, _seed_specializations):
    return _mk_doctor(db)


@pytest.fixture
def doctor2(db, _seed_specializations):
    return _mk_doctor(db, email="doctor2@example.com", full_name="Dr. Second",
                      license_number="LIC-002", specialization="Neurologist")


@pytest.fixture
def admin(db):
    return _mk_admin(db)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def login(client, email: str, password: str = TEST_PASSWORD, path: str = "/api/auth/login") -> str:
    """
    Log in and return a bearer token.

    The three login routes take OAuth2PasswordRequestForm, so the body is
    form-encoded with `username` rather than JSON with `email`.
    """
    resp = client.post(path, data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def patient_token(client, patient):
    return login(client, patient.email)


@pytest.fixture
def patient2_token(client, patient2):
    return login(client, patient2.email)


@pytest.fixture
def doctor_token(client, doctor):
    return login(client, doctor.email, path="/api/auth/doctor/login")


@pytest.fixture
def doctor2_token(client, doctor2):
    return login(client, doctor2.email, path="/api/auth/doctor/login")


@pytest.fixture
def fresh_db():
    """
    An empty SQLite file, unique per test, as a SQLAlchemy URL.

    Used to build a schema from the migrations alone and compare it against the
    one the models describe. Lives here rather than in test_migrations.py
    because more than one test module needs it.
    """
    path = os.path.join(tempfile.mkdtemp(prefix="medassist_migrations_"), "migrate.db")
    # Touch the file so the engine resolves it even if alembic never ran.
    sqlite3.connect(path).close()
    yield f"sqlite:///{path}"


@pytest.fixture
def admin_token(client, admin):
    return login(client, admin.email, path="/api/auth/admin/login")


@pytest.fixture(autouse=True)
def _no_rate_limiting():
    """
    SlowAPI counts against in-process memory, so a burst of login calls in one
    session would trip the 5/minute limits. Disable it for the suite; the
    limiter's own behaviour is not what these tests are checking.
    """
    from limiter import limiter

    was_enabled = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = was_enabled


@pytest.fixture(autouse=True)
def sent_emails(monkeypatch):
    """
    Booking, cancellation and password-reset routes all fire real SMTP sends
    via `email_service`. With credentials present in backend/.env that means
    the suite would open connections to Gmail -- slow, flaky, and not something
    a test run should be doing.

    Autouse because every request must be intercepted, but the return value is
    the list of captured sends, so a test that cares can assert one was made.
    """
    import services.email_service as email_service

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        email_service, "_send_email",
        lambda to_email, subject, html_body: sent.append((to_email, subject)),
    )
    return sent


@pytest.fixture(autouse=True)
def _fast_password_hashing():
    """
    passlib's bcrypt default cost is 12, roughly a quarter-second per hash,
    which dominated the suite's runtime. Drop to the bcrypt minimum here;
    production keeps the default.
    """
    import auth_utils

    original = auth_utils.pwd_context
    auth_utils.pwd_context = CryptContext(
        schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=4
    )
    yield
    auth_utils.pwd_context = original
