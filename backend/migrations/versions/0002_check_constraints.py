"""Add CHECK constraints for value ranges and enumerated statuses.

Closes the gap where the database accepted nonsense that the API layer happened
to reject: a negative consultation fee, a 500-year-old patient, a 0-minute slot,
an appointment status outside the three the application uses.

SQLite validates CHECK constraints on write, so these are enforced for every
writer -- the API, a migration, a raw `sqlite3` script -- not just for requests
that pass through Pydantic.

SQLite has no `ALTER TABLE ... ADD CONSTRAINT`, so each table is rebuilt with
Alembic's batch mode (copy-and-move). That is why this migration touches every
table it constrains rather than issuing one ALTER per constraint.

Pre-checked against the dev database before writing: zero rows violate any of
these. A table with existing bad rows would fail the rebuild, so the check has
to come first.

Revision ID: 0002_check_constraints
Revises: 0001_baseline
Create Date: 2026-10-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002_check_constraints"
down_revision: Union[str, Sequence[str], None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the CHECK constraints."""

    # Batch mode rebuilds each table by copying it aside and dropping the
    # original. With FK enforcement on, `DROP TABLE doctors` fails because
    # appointments still references it -- so suspend enforcement for the
    # rebuild and restore it after.
    #
    # `PRAGMA foreign_keys` is a no-op inside a transaction, and Alembic's
    # migration context may have one open, so commit first to let the pragma
    # take effect.
    op.execute("COMMIT")
    op.execute("PRAGMA foreign_keys=OFF")

    # --- doctors -----------------------------------------------------------
    # Each constraint prevents a specific silent failure rather than a crash:
    #   consultation_fee < 0   -> a meaningless price on the map
    #   experience_years < 0   -> a nonsense profile value
    #   slot_duration <= 0     -> generate_time_slots would loop forever
    #   shift_start >= shift_end -> an empty slot list instead of an error
    with op.batch_alter_table("doctors") as batch_op:
        batch_op.create_check_constraint(
            "ck_doctors_consultation_fee_nonneg",
            "consultation_fee >= 0",
        )
        batch_op.create_check_constraint(
            "ck_doctors_experience_years_nonneg",
            "experience_years >= 0",
        )
        batch_op.create_check_constraint(
            "ck_doctors_slot_duration_positive",
            "slot_duration_minutes > 0",
        )
        batch_op.create_check_constraint(
            "ck_doctors_shift_window",
            "shift_start < shift_end",
        )

    # --- users -------------------------------------------------------------
    # Mirrors the Pydantic `ge=0, le=120` on PatientCreate and
    # PatientProfileUpdate. The upper bound is generous rather than precise:
    # the point is to catch a data-entry error, not to adjudicate age.
    with op.batch_alter_table("users") as batch_op:
        batch_op.create_check_constraint(
            "ck_users_age_range",
            "age IS NULL OR (age >= 0 AND age <= 120)",
        )

    # --- appointments ------------------------------------------------------
    # status is a plain VARCHAR with no database-level enumeration, so a typo
    # ('Pending ' with a trailing space, 'pending' in another case) would
    # silently stop matching every `status != 'Cancelled'` filter and every
    # status count. The constraint makes the allowed set explicit.
    with op.batch_alter_table("appointments") as batch_op:
        batch_op.create_check_constraint(
            "ck_appointments_status",
            "status IN ('Pending', 'Completed', 'Cancelled')",
        )

    # --- contact_messages --------------------------------------------------
    # Same reasoning: a status outside the set would make the unread badge
    # count wrong rather than raise.
    with op.batch_alter_table("contact_messages") as batch_op:
        batch_op.create_check_constraint(
            "ck_contact_messages_status",
            "status IN ('new', 'read')",
        )

    op.execute("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    """Drop the CHECK constraints."""
    op.execute("PRAGMA foreign_keys=OFF")

    for table, name in (
        ("contact_messages", "ck_contact_messages_status"),
        ("appointments", "ck_appointments_status"),
        ("users", "ck_users_age_range"),
        ("doctors", "ck_doctors_shift_window"),
        ("doctors", "ck_doctors_slot_duration_positive"),
        ("doctors", "ck_doctors_experience_years_nonneg"),
        ("doctors", "ck_doctors_consultation_fee_nonneg"),
    ):
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_constraint(name, type_="check")

    op.execute("PRAGMA foreign_keys=ON")