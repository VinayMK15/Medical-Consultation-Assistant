"""Add AUTOINCREMENT to every id-bearing table.

Closes an account-takeover hole, not a consistency gap.

The JWT `sub` claim *is* the account id -- `create_access_token({"sub":
str(user.id), ...})` in routers/auth.py -- and `get_current_account` resolves it
with `WHERE id == account_id`. A plain `INTEGER PRIMARY KEY` in SQLite reuses
the highest previously-issued id when that row is deleted, because the next id
is just `max(rowid) + 1` over the rows that still exist.

So: an account is deleted, a new account registers, the new account inherits
the deleted one's id, and the deleted account's still-unexpired token resolves
to the new account. The role claim does not save it -- `isinstance(account,
User)` holds for whoever now has that id -- and neither does `token_version`,
because a new account starts at 0 and a token for an account that never changed
its password also carries ver=0.

Reproduced end-to-end against the running app before writing this migration:
a deleted patient's live JWT returned HTTP 200 with the *new* account's profile.

AUTOINCREMENT keeps a `sqlite_sequence` high-water mark, so an id is never
issued twice even after its row is gone. It is the only defence available at
the schema layer.

Scope: the eight tables carrying an `INTEGER PRIMARY KEY`. The takeover hole is
specific to `users`/`doctors`/`admin_users`, whose ids go into tokens, but the
reuse applies to every table and leaving six inconsistent would reopen the
question later. `patient_settings` is excluded -- its PK is `user_id`, a
foreign key, not a surrogate id. `regional_symptom_keywords` and
`symptom_aliases` already have AUTOINCREMENT.

Mechanism, and why not the obvious one:

`batch_alter_table` cannot do this unaided. SQLite only accepts AUTOINCREMENT in
a CREATE TABLE statement, so the table must be rebuilt, and Alembic's rebuild
reflects the existing table and re-emits it. Reflection does not carry the
table-level AUTOINCREMENT flag -- `inspect(engine).get_columns()` reports
`autoincrement=None` for a column that IS autoincrement -- so a plain rebuild
silently DROPS it. Measured on a scratch database:

    batch op                      AUTOINCREMENT after   sqlite_sequence
    add_column                    kept                  kept
    create_index                  kept                  kept
    drop_column                   DROPPED               EMPTIED
    create_check_constraint       DROPPED               EMPTIED

The fix is `copy_from=` with an explicit Table object carrying
`sqlite_autoincrement=True`, plus `recreate="always"` because otherwise Alembic
may take the cheap ALTER path and never rebuild. Verified to preserve CHECK
constraints, named indexes, foreign keys, row data, and Phase E's ORM-managed
`updated_at`.

`foreign_keys=OFF` is required because `appointments` references `users` and
`doctors`, both of which are rebuilt in the same run.

Revision ID: 0006_autoincrement
Revises: 0005_updated_at
Create Date: 2026-10-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_autoincrement"
down_revision: Union[str, Sequence[str], None] = "0005_updated_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# --------------------------------------------------------------------------
# Explicit table definitions.
#
# These must mirror models.py exactly. Alembic would rather reflect the live
# schema, but reflection is exactly what loses AUTOINCREMENT -- so the schema
# is restated here instead. tests/test_migrations.py asserts the result matches
# what the models produce, which is what keeps this honest as models drift.
# --------------------------------------------------------------------------
def _users() -> sa.Table:
    return sa.Table(
        "users", sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("age", sa.Integer()),
        sa.Column("gender", sa.String()),
        sa.Column("phone", sa.String()),
        sa.Column("home_city", sa.String()),
        sa.Column("home_address", sa.String()),
        sa.Column("home_lat", sa.Float()),
        sa.Column("home_lng", sa.Float()),
        sa.Column("reset_token", sa.String()),
        sa.Column("reset_token_expires", sa.DateTime()),
        sa.Column("reset_failed_attempts", sa.Integer(),
                  server_default="0", nullable=False),
        sa.Column("token_version", sa.Integer(),
                  server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
        sa.CheckConstraint("age IS NULL OR (age >= 0 AND age <= 120)",
                           name="ck_users_age_range"),
        sa.Index("ix_users_email", "email", unique=True),
        sa.Index("ix_users_reset_token", "reset_token"),
        sqlite_autoincrement=True,
    )


def _doctors() -> sa.Table:
    return sa.Table(
        "doctors", sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("specialization", sa.String(), nullable=False),
        sa.Column("experience_years", sa.Integer()),
        sa.Column("qualifications", sa.String(), nullable=False),
        sa.Column("license_number", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("practice_city", sa.String(), nullable=False),
        sa.Column("practice_address", sa.String(), nullable=False),
        sa.Column("practice_lat", sa.Float()),
        sa.Column("practice_lng", sa.Float()),
        sa.Column("consultation_fee", sa.Float()),
        sa.Column("bio", sa.Text()),
        sa.Column("shift_start", sa.String(), nullable=False),
        sa.Column("shift_end", sa.String(), nullable=False),
        sa.Column("slot_duration_minutes", sa.Integer(), nullable=False),
        sa.Column("blocked_dates", sa.JSON()),
        sa.Column("is_verified", sa.Boolean()),
        sa.Column("is_active", sa.Boolean()),
        sa.Column("reset_token", sa.String()),
        sa.Column("reset_token_expires", sa.DateTime()),
        sa.Column("token_version", sa.Integer(),
                  server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
        sa.ForeignKeyConstraint(["specialization"], ["specializations.name"],
                                name="fk_doctors_specialization",
                                ondelete="RESTRICT"),
        sa.CheckConstraint("consultation_fee >= 0",
                           name="ck_doctors_consultation_fee_nonneg"),
        sa.CheckConstraint("experience_years >= 0",
                           name="ck_doctors_experience_years_nonneg"),
        sa.CheckConstraint("slot_duration_minutes > 0",
                           name="ck_doctors_slot_duration_positive"),
        sa.CheckConstraint("shift_start < shift_end", name="ck_doctors_shift_window"),
        sa.Index("ix_doctors_email", "email", unique=True),
        sa.Index("ix_doctors_reset_token", "reset_token"),
        sa.Index("ix_doctors_verified_active_city",
                 "is_verified", "is_active", "practice_city"),
        sqlite_autoincrement=True,
    )


def _admin_users() -> sa.Table:
    return sa.Table(
        "admin_users", sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("role", sa.String()),
        sa.Column("is_active", sa.Boolean()),
        sa.Column("reset_token", sa.String()),
        sa.Column("reset_token_expires", sa.DateTime()),
        sa.Column("token_version", sa.Integer(),
                  server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
        sa.Index("ix_admin_users_email", "email", unique=True),
        sa.Index("ix_admin_users_reset_token", "reset_token"),
        sqlite_autoincrement=True,
    )


def _appointments() -> sa.Table:
    return sa.Table(
        "appointments", sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("appointment_date", sa.Date(), nullable=False),
        sa.Column("slot_time", sa.String(), nullable=False),
        sa.Column("symptoms_summary", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("prescription_notes", sa.Text()),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
        sa.ForeignKeyConstraint(["patient_id"], ["users.id"],
                                name="fk_appointments_patient_id"),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"],
                                name="fk_appointments_doctor_id"),
        sa.CheckConstraint("status IN ('Pending', 'Completed', 'Cancelled')",
                           name="ck_appointments_status"),
        sa.Index("ix_appointments_patient_id", "patient_id"),
        sa.Index("ix_appointments_doctor_date", "doctor_id", "appointment_date"),
        # uq_doctor_date_slot is NOT declared here: it is partial
        # (WHERE status != 'Cancelled'), which SQLAlchemy's Index cannot
        # express. It is recreated as raw DDL by _rebuild.
        sqlite_autoincrement=True,
    )


def _contact_messages() -> sa.Table:
    return sa.Table(
        "contact_messages", sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
        sa.CheckConstraint("status IN ('new', 'read')",
                           name="ck_contact_messages_status"),
        sa.Index("ix_contact_messages_email", "email"),
        sqlite_autoincrement=True,
    )


def _specializations() -> sa.Table:
    return sa.Table(
        "specializations", sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("common_conditions", sa.JSON()),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
        sa.Index("ix_specializations_name", "name", unique=True),
        sqlite_autoincrement=True,
    )


def _symptom_mappings() -> sa.Table:
    return sa.Table(
        "symptom_mappings", sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("symptom", sa.String(), nullable=False),
        sa.Column("specialist", sa.String(), nullable=False),
        sa.Column("urgency", sa.String()),
        sa.Column("is_custom", sa.Boolean()),
        sa.Column("added_by", sa.String()),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
        sa.Index("ix_symptom_mappings_symptom", "symptom", unique=True),
        sqlite_autoincrement=True,
    )


def _condition_symptoms() -> sa.Table:
    return sa.Table(
        "condition_symptoms", sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("disease", sa.String(), nullable=False),
        sa.Column("symptom", sa.String(), nullable=False),
        sa.Column("specialist", sa.String(), nullable=False),
        sa.Column("risk_level", sa.String()),
        sa.Column("created_at", sa.DateTime()),
        sa.Index("ix_condition_symptoms_disease", "disease"),
        sa.Index("ix_condition_symptoms_symptom", "symptom"),
        sa.Index("uq_condition_symptom", "disease", "symptom", unique=True),
        sqlite_autoincrement=True,
    )


def _regional_symptom_keywords() -> sa.Table:
    # The dev database already has AUTOINCREMENT here, but a database built by
    # `alembic upgrade head` did not: the baseline declared
    # `Column("id", autoincrement=True)`, which SQLAlchemy renders as
    # `INTEGER NOT NULL PRIMARY KEY` -- the column flag, not the table-level
    # AUTOINCREMENT keyword. The two tables were created by a loader script in
    # the dev database, which is why only there did they differ.
    return sa.Table(
        "regional_symptom_keywords", sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("regional_term", sa.String(), nullable=False),
        sa.Column("english_canonical", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime()),
        sa.UniqueConstraint("language", "regional_term", name="uq_regional_symptom"),
        sa.Index("ix_regional_symptom_keywords_language", "language"),
        sqlite_autoincrement=True,
    )


def _symptom_aliases() -> sa.Table:
    # Same baseline drift as regional_symptom_keywords above.
    return sa.Table(
        "symptom_aliases", sa.MetaData(),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("alias", sa.Text(), nullable=False),
        sa.Column("canonical", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime()),
        sa.UniqueConstraint("alias"),
        sa.Index("ix_symptom_aliases_alias", "alias"),
        sqlite_autoincrement=True,
    )


_FACTORIES = (
    _users, _doctors, _admin_users, _appointments,
    _contact_messages, _specializations, _symptom_mappings, _condition_symptoms,
    _regional_symptom_keywords, _symptom_aliases,
)

# Partial index Alembic cannot express; recreated as raw DDL.
_PARTIAL_INDEX = (
    "CREATE UNIQUE INDEX uq_doctor_date_slot ON appointments "
    "(doctor_id, appointment_date, slot_time) WHERE status != 'Cancelled'"
)


def _rebuild(target: sa.Table) -> None:
    """Recreate `target` in place, preserving rows.

    `target` carries the desired schema, including `sqlite_autoincrement`.
    Alembic's reflection cannot supply that, which is why it is passed
    explicitly rather than reflected.

    Caller is responsible for the foreign_keys pragma -- see upgrade().
    """
    name = target.name
    is_appointments = name == "appointments"

    with op.batch_alter_table(name, copy_from=target, recreate="always"):
        pass

    if is_appointments:
        op.execute(_PARTIAL_INDEX)

    # `batch_alter_table` copies rows with an explicit INSERT ... SELECT into a
    # freshly created AUTOINCREMENT table, and SQLite raises that table's
    # sqlite_sequence mark as a side effect. Verified on a copy of the dev
    # database: after rebuilding symptom_mappings, seq is 91 -- the highest id
    # ever issued, not the 89 rows that survive.
    #
    # No corrective statement is needed, and adding one actively breaks things.
    # An earlier draft seeded the mark with
    #     INSERT ... SELECT MAX(id) ... WHERE NOT EXISTS (...)
    # which produced a SECOND row per table: SQLite materialises the SELECT
    # before the NOT EXISTS guard is consulted, so the guard never held. Two
    # rows make the next issued id undefined. Measured, then removed.


def _strip_autoincrement(target: sa.Table) -> sa.Table:
    """The same table without AUTOINCREMENT, for the downgrade.

    Rebuilt from scratch. Every SQLAlchemy shortcut fails here, each for a
    different reason, and each of these was actually hit:

    - `Index` has no `.copy()`, and passing an index already bound to `target`
      into a new Table raises "Index ... is against table ... and cannot be
      associated with table ...".
    - `Table.constraints` and `Table.indexes` are live sets that SQLAlchemy
      mutates while an object is attached, so iterating them directly raises
      "Set changed size during iteration".
    - `Column._copy()` drops `primary_key`, `nullable` and `server_default`.
      Using it produced `CREATE TABLE users (id INTEGER NOT NULL, ...)` with
      no primary key, so `PRAGMA foreign_key_check` failed with "foreign key
      mismatch - appointments referencing users".
    - `Constraint._copy()` looks correct and is not: the copy still references
      the SOURCE Table's Column objects, so attaching it to the new Table
      silently does nothing. Same outcome for the primary key, foreign keys
      and unique constraints.

    So columns are rebuilt explicitly and constraints reconstructed by hand
    against the new Table's columns.
    """
    plain = sa.Table(
        target.name,
        sa.MetaData(),
        *[
            sa.Column(
                c.name,
                c.type,
                primary_key=c.primary_key,
                nullable=c.nullable,
                server_default=c.server_default,
                autoincrement=c.autoincrement,
            )
            for c in list(target.columns)
        ],
    )

    for constraint in list(target.constraints):
        if isinstance(constraint, sa.PrimaryKeyConstraint):
            continue  # carried by the copied column's primary_key=True

        columns = [plain.c[c.name] for c in constraint.columns]

        if isinstance(constraint, sa.ForeignKeyConstraint):
            # Recovered from `_colspec`, not `element.column`: reading `.column`
            # resolves the target table, which is not in this MetaData, and
            # raises NoReferencedTableError.
            plain.append_constraint(sa.ForeignKeyConstraint(
                columns,
                [e._colspec for e in constraint.elements],
                name=constraint.name,
                ondelete=constraint.ondelete,
                onupdate=constraint.onupdate,
                use_alter=True,
            ))
        elif isinstance(constraint, sa.UniqueConstraint):
            plain.append_constraint(
                sa.UniqueConstraint(*columns, name=constraint.name)
            )
        elif isinstance(constraint, sa.CheckConstraint):
            # A CheckConstraint holds SQL text, not column references, so it is
            # the one constraint that transfers cleanly.
            plain.append_constraint(sa.CheckConstraint(
                constraint.sqltext, name=constraint.name
            ))

    # Indexes are built last, once the columns exist. The unnamed
    # sqlite_autoindex implied by a UniqueConstraint is skipped: it has no name
    # and cannot be recreated by one.
    for index in list(target.indexes):
        if index.name is None:
            continue
        sa.Index(
            index.name,
            *[plain.c[name] for name in index.columns.keys()],
            unique=index.unique,
        )

    return plain


def upgrade() -> None:
    """Rebuild every id-bearing table with AUTOINCREMENT."""
    # Bracket the whole run rather than each table. PRAGMA foreign_keys is a
    # no-op inside a transaction, so it has to be set outside one -- and
    # batch_alter_table commits internally, so a per-table COMMIT works for
    # the first table and raises "no transaction is active" for the rest.
    # appointments references users and doctors, both rebuilt here.
    op.execute("COMMIT")
    op.execute("PRAGMA foreign_keys=OFF")
    try:
        for factory in _FACTORIES:
            _rebuild(factory())
    finally:
        op.execute("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    """Remove AUTOINCREMENT.

    Ids stop being monotonic, and an id freed by a delete can be reissued --
    which is the takeover hole this migration exists to close. Down it only if
    you must; it is not a routine rollback target.
    """
    op.execute("COMMIT")
    op.execute("PRAGMA foreign_keys=OFF")
    try:
        for factory in _FACTORIES:
            name = factory().name
            _rebuild(_strip_autoincrement(factory()))
            op.execute(f"DELETE FROM sqlite_sequence WHERE name = '{name}'")
    finally:
        op.execute("PRAGMA foreign_keys=ON")