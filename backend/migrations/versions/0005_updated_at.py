"""Add updated_at to the mutable tables, and created_at to appointments.

Seven tables track when they were created but not when they last changed, so
there is no way to answer "when was this record last touched?" for any of them.
Appointments had neither timestamp at all -- the one table in the database with
no record of when a row came into existence.

Mechanism: the ORM's `onupdate=_utcnow`, not SQLite triggers.

Triggers were considered and rejected. `updated_at` cannot be expressed as a
column default in SQLite -- there is no `ON UPDATE CURRENT_TIMESTAMP` -- so the
alternative is an `AFTER UPDATE` trigger per table. I tested what survives
Alembic's SQLite batch mode:

    add_column                    trigger survives
    create_index                  trigger survives
    any operation forcing a
    recreate (e.g. add a CHECK)   trigger DROPPED

Phases F and G both have to recreate tables -- SQLite only accepts AUTOINCREMENT
at CREATE TABLE time, and changing a primary key to UUID is a rebuild by
definition. A trigger-based updated_at would therefore be silently dropped by
the next two migrations, with no error: the column would still exist and simply
stop updating. `onupdate` is Python-side, so it survives any schema rebuild.

The gap this leaves: `onupdate` fires for ORM writes and for `Query.update()`,
but not for raw SQL. Only two raw UPDATE statements exist in the codebase, both
in one-off maintenance scripts (`scripts/strip_seed_marker.py`,
`patch_doctor_coords.py`), so nothing on a request path is affected.

Scope: the three CSV-loaded reference tables (`condition_symptoms`,
`regional_symptom_keywords`, `symptom_aliases`) are excluded. They are
load-once -- rows are inserted by `scripts/load_*.py` and never updated -- so
`updated_at` there could only ever equal `created_at`. Their `created_at` is in
any case already NULL on every row, because those same loaders insert through
raw sqlite3 and so bypass the ORM default. See docs/database_schema.md.

Backfill: `updated_at` is seeded from `created_at` where that is populated,
which is accurate -- a row created and never modified has a last-modified time
equal to its creation time. Where `created_at` is NULL the column stays NULL,
because inventing a value would be a guess presented as data.

Appointments' `created_at` is backfilled with the migration timestamp. The real
booking time is not recorded anywhere in the schema, so the value means "first
observed by this migration", not "booked then". Documented at the column.

Revision ID: 0005_updated_at
Revises: 0004_doctors_verified_active_city_idx
Create Date: 2026-10-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_updated_at"
down_revision: Union[str, Sequence[str], None] = "0004_doctors_verified_active_city_idx"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Mutable tables that track created_at but not updated_at.
_UPDATED_AT_TABLES = (
    "users",
    "doctors",
    "admin_users",
    "contact_messages",
    "specializations",
    "symptom_mappings",
)

# appointments had neither column.
_TIMESTAMP_FREE_TABLES = ("appointments",)


def upgrade() -> None:
    """Add the missing timestamp columns and backfill them."""
    for table in _UPDATED_AT_TABLES:
        op.add_column(table, sa.Column("updated_at", sa.DateTime(), nullable=True))
        op.execute(
            f"UPDATE {table} SET updated_at = created_at "
            "WHERE created_at IS NOT NULL AND updated_at IS NULL"
        )

    for table in _TIMESTAMP_FREE_TABLES:
        op.add_column(table, sa.Column("created_at", sa.DateTime(), nullable=True))
        op.add_column(table, sa.Column("updated_at", sa.DateTime(), nullable=True))
        # CURRENT_TIMESTAMP is UTC in SQLite and yields second resolution, which
        # is the most this value can honestly claim to know.
        op.execute(f"UPDATE {table} SET created_at = CURRENT_TIMESTAMP")
        op.execute(f"UPDATE {table} SET updated_at = created_at")


def downgrade() -> None:
    """Drop the added columns.

    The backfilled values go with them. That is lossy by definition -- a
    downgrade discards data -- but the alternative is leaving orphan columns
    behind, which is worse to reason about later.
    """
    for table in _UPDATED_AT_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column("updated_at")

    for table in _TIMESTAMP_FREE_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column("created_at")
            batch_op.drop_column("updated_at")