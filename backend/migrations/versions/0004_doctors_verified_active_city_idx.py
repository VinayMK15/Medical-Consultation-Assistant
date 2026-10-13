"""Composite index on the doctors filter columns.

`find_doctors`, `GET /api/doctors` and the verification queue all filter on
`is_verified` and `is_active`, and `find_doctors` additionally matches
`practice_city`. None of those columns was indexed, so every one of those reads
was a full table scan -- invisible at 36 doctors, a problem at 10,000.

Column order follows selectivity: the two boolean flags first because they are
the common denominator across all three queries, then `practice_city` because
it is the most selective and because trailing it still lets the index serve
city-only lookups.

Revision ID: 0004_doctors_verified_active_city_idx
Revises: 0003_doctors_specialization_fk
Create Date: 2026-10-11

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_doctors_verified_active_city_idx"
down_revision: Union[str, Sequence[str], None] = "0003_doctors_specialization_fk"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the composite index."""
    op.create_index(
        "ix_doctors_verified_active_city",
        "doctors",
        ["is_verified", "is_active", "practice_city"],
    )


def downgrade() -> None:
    """Drop the composite index."""
    op.drop_index("ix_doctors_verified_active_city", table_name="doctors")
