from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from database import Base


def _utcnow():
    """Naive UTC, for both `default` and `onupdate`.

    `updated_at` is maintained by the ORM rather than by SQLite triggers.
    SQLite has no `ON UPDATE CURRENT_TIMESTAMP`, so the only database-side
    alternative is a per-table trigger -- and Alembic's SQLite batch mode drops
    triggers whenever it recreates a table, which both planned follow-up phases
    (AUTOINCREMENT, UUID primary keys) must do. `onupdate` is Python-side, so it
    survives any schema rebuild. See migrations/versions/0005_updated_at.py.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


# Every table with a surrogate integer primary key carries this. It must be the
# last element of a `__table_args__` tuple, after the constraints and indexes.
#
# Why it is not optional: the JWT `sub` claim is the account id, and
# `get_current_account` resolves it with `WHERE id == <sub>`. A plain INTEGER
# PRIMARY KEY in SQLite hands out `max(rowid) + 1`, so deleting the
# highest-numbered account frees its id for the next signup. A token minted for
# the deleted account then resolves to whoever inherited the id -- verified
# end-to-end, returning HTTP 200 with the new account's profile. Neither the
# role claim nor `token_version` prevents it: a new account starts at
# token_version 0, and so does any account that never changed its password.
#
# AUTOINCREMENT keeps a high-water mark in sqlite_sequence, so an id is never
# reissued even after its row is gone.
#
# Excluded: `patient_settings`, whose primary key is `user_id` -- a foreign
# key, not a surrogate id.
_AUTOINCREMENT = {"sqlite_autoincrement": True}


class User(Base):
    """Represents a Patient."""
    __tablename__ = "users"

    # No index=True on `id`: SQLite already maintains a B-tree for an INTEGER
    # PRIMARY KEY, so a second one on the same column is pure write overhead.
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    age = Column(Integer)  # Important for medical context
    gender = Column(String)  # (e.g., Male, Female, Other)
    phone = Column(String, nullable=True)

    # Location fields
    home_city = Column(String, nullable=True)
    home_address = Column(String, nullable=True)
    home_lat = Column(Float, nullable=True)
    home_lng = Column(Float, nullable=True)

    # Password Reset
    reset_token = Column(String, nullable=True, index=True)
    reset_token_expires = Column(DateTime, nullable=True)
    # Counts consecutive wrong secret-code guesses. Reset on a successful
    # reset or a fresh request; reaching the cap destroys the code.
    reset_failed_attempts = Column(Integer, default=0, nullable=False, server_default=text("0"))

    # Bumped to invalidate outstanding JWTs. Compared against the token's `ver`
    # claim, so changing a password or deactivating the account logs it out
    # everywhere immediately, with no server-side blocklist.
    token_version = Column(Integer, default=0, nullable=False, server_default=text("0"))

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    appointments = relationship(
        "Appointment", foreign_keys="Appointment.patient_id", back_populates="patient"
    )

    # Database-level range check. Pydantic validates `ge=0, le=120` on the
    # write path, but a CHECK holds for any other writer -- a script, a
    # migration, a raw sqlite3 call. The upper bound is generous rather than
    # precise: the point is to catch a data-entry error, not to adjudicate age.
    __table_args__ = (
        CheckConstraint(
            "age IS NULL OR (age >= 0 AND age <= 120)",
            name="ck_users_age_range",
        ),
        _AUTOINCREMENT,
    )
    settings = relationship(
        "PatientSettings", back_populates="patient", uselist=False, cascade="all, delete-orphan"
    )


class PatientSettings(Base):
    """Per-patient notification preferences.

    A sibling table rather than extra columns on `users`: that table is
    already wide and has needed careful data-preserving rebuilds, and a
    separate table keeps this change purely additive. One row per patient,
    created lazily on first read.
    """
    __tablename__ = "patient_settings"

    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # Appointment confirmations, cancellations and completion summaries.
    # Deliberately NOT named "reminders" — no reminder emails are sent;
    # there is no scheduler in the backend at all.
    appointment_emails = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    patient = relationship("User", back_populates="settings")


class Doctor(Base):
    """Represents a Doctor."""
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    # FK to specializations.name, not specializations.id: the string is what
    # every query filters and displays, so referencing the id would mean
    # rewriting all of them for no gain. `name` carries a UNIQUE index, which a
    # foreign key target requires.
    #
    # ON DELETE RESTRICT: a specialty that doctors hold cannot be removed out
    # from under them. The admin route must reassign those doctors first.
    specialization = Column(
        String,
        ForeignKey("specializations.name", ondelete="RESTRICT"),
        nullable=False,
    )
    experience_years = Column(Integer, default=0)
    qualifications = Column(String, nullable=False)
    license_number = Column(String, unique=True, nullable=False)
    phone = Column(String, nullable=False)

    # Location & Practice details
    practice_city = Column(String, nullable=False)
    practice_address = Column(String, nullable=False)
    practice_lat = Column(Float, nullable=True)
    practice_lng = Column(Float, nullable=True)
    consultation_fee = Column(Float, default=0.0)
    bio = Column(String, nullable=True)

    # Schedule & Availability
    shift_start = Column(String, default="09:00", nullable=False)
    shift_end = Column(String, default="17:00", nullable=False)
    slot_duration_minutes = Column(Integer, default=30, nullable=False)
    blocked_dates = Column(JSON, default=list)

    # Admin controls
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    # Password Reset
    reset_token = Column(String, nullable=True, index=True)
    reset_token_expires = Column(DateTime, nullable=True)

    token_version = Column(Integer, default=0, nullable=False, server_default=text("0"))

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    appointments = relationship(
        "Appointment", foreign_keys="Appointment.doctor_id", back_populates="doctor"
    )

    # Range checks the API happens to enforce but the database did not. Each
    # prevents a specific silent failure rather than a crash:
    #   consultation_fee < 0  -> a meaningless price on the map
    #   experience_years < 0  -> a nonsense profile value
    #   slot_duration <= 0    -> generate_time_slots would loop forever
    #   shift_start >= shift_end -> an empty slot list instead of an error
    __table_args__ = (
        CheckConstraint(
            "consultation_fee >= 0", name="ck_doctors_consultation_fee_nonneg"
        ),
        CheckConstraint(
            "experience_years >= 0", name="ck_doctors_experience_years_nonneg"
        ),
        CheckConstraint(
            "slot_duration_minutes > 0", name="ck_doctors_slot_duration_positive"
        ),
        CheckConstraint(
            "shift_start < shift_end", name="ck_doctors_shift_window"
        ),
        # Composite index on the three columns every doctor query filters on.
        # Column order follows selectivity: the two boolean flags first because
        # they are the common denominator across find_doctors, the map endpoint
        # and the verification queue, then practice_city because it is the most
        # selective and because trailing it still lets the index serve city-only
        # lookups.
        Index(
            "ix_doctors_verified_active_city",
            "is_verified",
            "is_active",
            "practice_city",
        ),
        _AUTOINCREMENT,
    )


class AdminUser(Base):
    """Represents an Admin."""
    __tablename__ = "admin_users"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="admin")  # "admin" or "superadmin"
    is_active = Column(Boolean, default=True)

    # Password reset fields mirror the patient and doctor account models.
    reset_token = Column(String, nullable=True, index=True)
    reset_token_expires = Column(DateTime, nullable=True)

    token_version = Column(Integer, default=0, nullable=False, server_default=text("0"))

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (
        # Partial, not a plain UNIQUE: a cancelled booking must release its
        # slot so the patient can rebook it. This index was originally added
        # out-of-band by a raw sqlite3 script and never made it into a
        # migration, so a schema built from these models used to disagree with
        # the real database -- and a full UNIQUE would reject the rebooking.
        # tests/test_migrations.py asserts the two now match.
        #
        # The predicate needs `text()`: SQLite compares it against the bound
        # status value, and a plain Python string is not a SQL expression.
        Index(
            "uq_doctor_date_slot",
            "doctor_id",
            "appointment_date",
            "slot_time",
            unique=True,
            sqlite_where=text("status != 'Cancelled'"),
        ),
        # The patient-side booking guard ("does this patient already hold
        # this slot?") and /api/patient/appointments both filter on
        # patient_id alone. EXPLAIN QUERY PLAN showed a full table scan on
        # both before this existed.
        Index("ix_appointments_patient_id", "patient_id"),
        # The doctor's monthly calendar summary filters by doctor_id plus a
        # date range, and filters a function over appointment_date -- which
        # no index can serve, so the range form needs these two columns
        # adjacent to be usable at all.
        Index("ix_appointments_doctor_date", "doctor_id", "appointment_date"),
        # status is a plain VARCHAR with no database-level enumeration, so a
        # typo ('Pending ' with a trailing space, 'pending' in another case)
        # would silently stop matching every `status != 'Cancelled'` filter and
        # every status count. The constraint makes the allowed set explicit.
        CheckConstraint(
            "status IN ('Pending', 'Completed', 'Cancelled')",
            name="ck_appointments_status",
        ),
        _AUTOINCREMENT,
    )

    id = Column(Integer, primary_key=True)
    # Deliberately NO ACTION on both, while patient_settings cascades. The
    # split is intentional, not an oversight:
    #
    #   appointments  -- medical history. CASCADE would destroy a patient's
    #                    record the moment the account is deleted, so the
    #                    delete is blocked until appointments are cleared
    #                    explicitly. The admin routes already do this.
    #   patient_settings -- derived preference data, 1:1 with the account and
    #                    meaningless without it, so it dies with the account.
    #
    # Forcing these into agreement would make one of the two worse: cascading
    # appointments loses history, and restricting settings means every account
    # deletion must remember to clear the settings row first.
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)

    appointment_date = Column(Date, nullable=False)
    slot_time = Column(String, nullable=False)

    symptoms_summary = Column(String, nullable=False)
    status = Column(String, default="Pending", nullable=False)
    prescription_notes = Column(String, nullable=True)

    # The only table in the schema that had neither timestamp. Appointments are
    # the most audit-worthy rows here -- status moves Pending -> Confirmed ->
    # Completed, and prescription_notes gets written partway through -- so a
    # last-modified time without a creation time is the harder of the two to
    # reason about.
    #
    # Rows that predate migration 0005 carry the migration timestamp as
    # created_at. The real booking time is not recorded anywhere in the schema,
    # so that value means "first observed by the migration", not "booked then".
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    patient = relationship(
        "User", foreign_keys=[patient_id], back_populates="appointments"
    )
    doctor = relationship(
        "Doctor", foreign_keys=[doctor_id], back_populates="appointments"
    )


class ContactMessage(Base):
    """
    A message submitted through the public contact form.

    Stored rather than emailed so the submission is durable and an admin can
    read it in the panel. Deliberately minimal: no account link, no IP, no
    user agent, so a support message carries no more data than the sender
    chose to type.
    """
    __tablename__ = "contact_messages"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, index=True)
    message = Column(String, nullable=False)

    # "new" until an admin reads it; drives the unread badge count.
    status = Column(String, default="new", nullable=False)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Same reasoning as appointments.status: a value outside the set would make
    # the unread badge count wrong rather than raise.
    __table_args__ = (
        CheckConstraint(
            "status IN ('new', 'read')", name="ck_contact_messages_status"
        ),
        _AUTOINCREMENT,
    )


class SymptomMapping(Base):
    __tablename__ = "symptom_mappings"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    symptom = Column(String, unique=True, index=True, nullable=False)
    specialist = Column(String, nullable=False)
    urgency = Column(String, default="medium")
    is_custom = Column(Boolean, default=False)
    added_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class Specialization(Base):
    __tablename__ = "specializations"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    common_conditions = Column(JSON, default=list)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class ConditionSymptom(Base):
    """Disease → symptom → specialist associations from the reference dataset.

    Loaded from reference_conditions.csv by
    scripts/load_condition_symptoms.py. Used to build the IDF index that ranks
    specialties when a patient describes several symptoms at once.
    """
    __tablename__ = "condition_symptoms"
    __table_args__ = (
        # A disease/symptom pair is unique in the reference dataset; enforced
        # so a re-run of the loader cannot quietly double every row.
        #
        # Declared as an explicit Index rather than a UniqueConstraint on
        # purpose: a UniqueConstraint becomes an unnamed sqlite_autoindex,
        # which cannot be referenced by name. Production (and the baseline
        # migration) use a named index, and tests assert the two agree.
        Index("uq_condition_symptom", "disease", "symptom", unique=True),
        _AUTOINCREMENT,
    )

    id = Column(Integer, primary_key=True)
    disease = Column(String, nullable=False, index=True)
    symptom = Column(String, nullable=False, index=True)
    specialist = Column(String, nullable=False)
    risk_level = Column(String, nullable=True)
    created_at = Column(DateTime, default=_utcnow)


class RegionalSymptomKeyword(Base):
    """Regional-language symptom term → English canonical symptom.

    Replaces the hardcoded _REGIONAL_SYMPTOM_KEYWORDS dict so the offline
    fallback vocabulary lives in the database alongside the rest of the
    medical data. Loaded by scripts/seed_regional_symptoms.py.
    """
    __tablename__ = "regional_symptom_keywords"
    __table_args__ = (
        UniqueConstraint("language", "regional_term",
                         name="uq_regional_symptom"),
        _AUTOINCREMENT,
    )

    id = Column(Integer, primary_key=True)
    language = Column(String, nullable=False, index=True)
    regional_term = Column(String, nullable=False)
    english_canonical = Column(String, nullable=False)
    created_at = Column(DateTime, default=_utcnow)


class SymptomAlias(Base):
    """Alternative phrasing → canonical symptom.

    Patients describe the same complaint many ways ("blood pressure" vs
    "hypertension"). Without these, a phrasing that is not itself a stored
    symptom matches nothing and the patient is routed to a General Physician.
    Seeded by scripts/seed_symptom_aliases.py.
    """
    __tablename__ = "symptom_aliases"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True)
    alias = Column(String, unique=True, index=True, nullable=False)
    canonical = Column(String, nullable=False)
    created_at = Column(DateTime, default=_utcnow)
