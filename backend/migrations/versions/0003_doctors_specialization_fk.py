"""Add FK from doctors.specialization to specializations.name.

Closes the one real denormalization in the schema: `specialization` was stored
as free text on `doctors`, `condition_symptoms` and `symptom_mappings` even
though a `specializations` table exists. Nothing enforced the relationship, so a
typo in a doctor's specialization would make them silently disappear from search
results -- `find_doctors` filters on that column, and the misspelled value would
match no `specializations` row and never be returned.

Only `doctors` is constrained here. `condition_symptoms` and
`symptom_mappings` are reference-dataset columns loaded from a CSV; constraining
them would mean the loader has to validate against `specializations` on every
run. Worth doing, but it is a data-pipeline change rather than a schema change.

The referenced column is `specializations.name`, which carries a UNIQUE index --
a requirement for a foreign key target. `specializations.id` would work too, but
keeping the existing string values avoids rewriting every doctor row and every
query that filters or displays `specialization`.

ON DELETE RESTRICT: removing a specialty that doctors hold must fail loudly
rather than either cascading away their specialization or leaving a dangling
reference. The admin UI should reassign or retire those doctors first.

Pre-checked against the dev database: zero doctors hold a specialization with
no matching `specializations` row, and every specialty is used.

Revision ID: 0003_doctors_specialization_fk
Revises: 0002_check_constraints
Create Date: 2026-10-11

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_doctors_specialization_fk"
down_revision: Union[str, Sequence[str], None] = "0002_check_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the FK, rebuilding the table (SQLite has no ALTER for constraints)."""
    # `PRAGMA foreign_keys` is a no-op inside a transaction, so commit first to
    # let it take effect -- same reasoning as 0002_check_constraints.
    op.execute("COMMIT")
    op.execute("PRAGMA foreign_keys=OFF")

    with op.batch_alter_table("doctors") as batch_op:
        batch_op.create_foreign_key(
            "fk_doctors_specialization",
            "specializations",
            ["specialization"],
            ["name"],
            ondelete="RESTRICT",
        )

    op.execute("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    """Drop the FK."""
    op.execute("COMMIT")
    op.execute("PRAGMA foreign_keys=OFF")

    with op.batch_alter_table("doctors") as batch_op:
        batch_op.drop_constraint("fk_doctors_specialization", type_="foreignkey")

    op.execute("PRAGMA foreign_keys=ON")