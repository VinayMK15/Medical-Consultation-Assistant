"""Baseline: the full current schema.

This replaces a five-revision chain that never described the real database.
`9a3fdb12e60f_initial_schema` had an empty `upgrade()` (`pass`) and every table
was subsequently created out-of-band by the raw `sqlite3` scripts in
`migrations_folder/`. Four tables -- `patient_settings`, `condition_symptoms`,
`regional_symptom_keywords`, `symptom_aliases` -- plus the
`users.reset_failed_attempts` column appear in no revision at all, and
revision `1bab2e3cf1ca` created a plain UNIQUE constraint where production has
a *partial* index (`WHERE status != 'Cancelled'`, added by
`migrations_folder/fix_appointments_fk.py`).

So `alembic upgrade head` on an empty file produced a schema missing most of the
application's tables, and with a constraint that would reject a patient
rebooking a slot they had just cancelled. Squashing to a single baseline that
matches the live database is the honest fix.

Verified by tests/test_migrations.py, which upgrades an empty file and diffs
the resulting schema against `medical_app.db`.

Downgrade drops everything. There is nothing meaningful to roll back to, since
the pre-squash chain produced a schema the app could not run against.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the full schema."""

    # ------------------------------------------------------------------
    # users
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("gender", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("home_city", sa.String(), nullable=True),
        sa.Column("home_address", sa.String(), nullable=True),
        sa.Column("home_lat", sa.Float(), nullable=True),
        sa.Column("home_lng", sa.Float(), nullable=True),
        sa.Column("reset_token", sa.String(), nullable=True),
        sa.Column("reset_token_expires", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("reset_failed_attempts", sa.Integer(),
                  server_default="0", nullable=False),
        # Bumped to invalidate outstanding JWTs on password change or
        # deactivation. Compared against the token's `ver` claim, so a
        # revoked account is logged out everywhere without a blocklist.
        sa.Column("token_version", sa.Integer(),
                  server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_reset_token", "users", ["reset_token"], unique=False)

    # ------------------------------------------------------------------
    # doctors
    # ------------------------------------------------------------------
    op.create_table(
        "doctors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("specialization", sa.String(), nullable=False),
        sa.Column("experience_years", sa.Integer(), nullable=True),
        sa.Column("qualifications", sa.String(), nullable=False),
        sa.Column("license_number", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("practice_city", sa.String(), nullable=False),
        sa.Column("practice_address", sa.String(), nullable=False),
        sa.Column("practice_lat", sa.Float(), nullable=True),
        sa.Column("practice_lng", sa.Float(), nullable=True),
        sa.Column("consultation_fee", sa.Float(), nullable=True),
        sa.Column("bio", sa.String(), nullable=True),
        sa.Column("shift_start", sa.String(), nullable=False),
        sa.Column("shift_end", sa.String(), nullable=False),
        sa.Column("slot_duration_minutes", sa.Integer(), nullable=False),
        sa.Column("blocked_dates", sa.JSON(), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("reset_token", sa.String(), nullable=True),
        sa.Column("reset_token_expires", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("token_version", sa.Integer(),
                  server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("license_number", name="uq_doctors_license_number"),
    )
    op.create_index("ix_doctors_email", "doctors", ["email"], unique=True)
    op.create_index("ix_doctors_reset_token", "doctors", ["reset_token"], unique=False)

    # ------------------------------------------------------------------
    # admin_users
    # ------------------------------------------------------------------
    op.create_table(
        "admin_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("reset_token", sa.String(), nullable=True),
        sa.Column("reset_token_expires", sa.DateTime(), nullable=True),
        sa.Column("token_version", sa.Integer(),
                  server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_users_email", "admin_users", ["email"], unique=True)
    op.create_index("ix_admin_users_reset_token", "admin_users", ["reset_token"],
                    unique=False)

    # ------------------------------------------------------------------
    # appointments
    # ------------------------------------------------------------------
    op.create_table(
        "appointments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("appointment_date", sa.Date(), nullable=False),
        sa.Column("slot_time", sa.String(), nullable=False),
        sa.Column("symptoms_summary", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("prescription_notes", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["patient_id"], ["users.id"],
                                name="fk_appointments_patient_id"),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"],
                                name="fk_appointments_doctor_id"),
    )
    # Partial unique index, matching production: a cancelled booking releases
    # its slot. A plain UNIQUE would forbid rebooking it.
    op.create_index(
        "uq_doctor_date_slot",
        "appointments",
        ["doctor_id", "appointment_date", "slot_time"],
        unique=True,
        sqlite_where=sa.text("status != 'Cancelled'"),
    )
    # Supports the patient-side lookups on /api/patient/appointments and the
    # booking route's "does this patient already hold this slot" guard.
    op.create_index("ix_appointments_patient_id", "appointments", ["patient_id"],
                    unique=False)
    # Supports the doctor's monthly calendar summary, which filters by
    # doctor_id and a date range.
    op.create_index(
        "ix_appointments_doctor_date",
        "appointments",
        ["doctor_id", "appointment_date"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # patient_settings
    # ------------------------------------------------------------------
    op.create_table(
        "patient_settings",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("appointment_emails", sa.Boolean(), nullable=False,
                  server_default=sa.text("1")),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("user_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # ------------------------------------------------------------------
    # specializations
    # ------------------------------------------------------------------
    op.create_table(
        "specializations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("common_conditions", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_specializations_name", "specializations", ["name"],
                    unique=True)

    # ------------------------------------------------------------------
    # contact_messages
    # ------------------------------------------------------------------
    op.create_table(
        "contact_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contact_messages_email", "contact_messages", ["email"],
                    unique=False)

    # ------------------------------------------------------------------
    # symptom_mappings
    # ------------------------------------------------------------------
    op.create_table(
        "symptom_mappings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("symptom", sa.String(), nullable=False),
        sa.Column("specialist", sa.String(), nullable=False),
        sa.Column("urgency", sa.String(), nullable=True),
        sa.Column("is_custom", sa.Boolean(), nullable=True),
        sa.Column("added_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_symptom_mappings_symptom", "symptom_mappings",
                    ["symptom"], unique=True)

    # ------------------------------------------------------------------
    # condition_symptoms
    # ------------------------------------------------------------------
    op.create_table(
        "condition_symptoms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("disease", sa.String(), nullable=False),
        sa.Column("symptom", sa.String(), nullable=False),
        sa.Column("specialist", sa.String(), nullable=False),
        sa.Column("risk_level", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_condition_symptoms_disease", "condition_symptoms",
                    ["disease"], unique=False)
    op.create_index("ix_condition_symptoms_symptom", "condition_symptoms",
                    ["symptom"], unique=False)
    op.create_index("uq_condition_symptom", "condition_symptoms",
                    ["disease", "symptom"], unique=True)

    # ------------------------------------------------------------------
    # regional_symptom_keywords
    # ------------------------------------------------------------------
    op.create_table(
        "regional_symptom_keywords",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("regional_term", sa.String(), nullable=False),
        sa.Column("english_canonical", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("language", "regional_term",
                            name="uq_regional_symptom"),
    )
    op.create_index("ix_regional_symptom_keywords_language",
                    "regional_symptom_keywords", ["language"], unique=False)

    # ------------------------------------------------------------------
    # symptom_aliases
    # ------------------------------------------------------------------
    op.create_table(
        "symptom_aliases",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("alias", sa.Text(), nullable=False),
        sa.Column("canonical", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("alias"),
    )
    op.create_index("ix_symptom_aliases_alias", "symptom_aliases", ["alias"],
                    unique=False)


def downgrade() -> None:
    """Drop the entire schema."""
    for table in (
        "symptom_aliases",
        "regional_symptom_keywords",
        "condition_symptoms",
        "contact_messages",
        "symptom_mappings",
        "specializations",
        "patient_settings",
        "appointments",
        "admin_users",
        "doctors",
        "users",
    ):
        op.drop_table(table)