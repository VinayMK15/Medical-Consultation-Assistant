"""
Shared helpers for the admin routers.

Account uniqueness and the payload-field conventions the admin panel relies on.
Split out because three routers need them, and duplicating a uniqueness check
across three modules is how the second one ends up subtly different.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import AdminUser, Doctor, User


def email_is_registered(
    email: str,
    db: Session,
    exclude_role: str | None = None,
    exclude_id: int | None = None,
) -> bool:
    """
    True when `email` is taken in any account table, case-insensitively.

    Accounts live in three separate tables with no database-level constraint
    spanning them, so cross-table uniqueness is enforced here. Every write
    path -- signup, admin create, admin update -- must go through this.

    `exclude_role`/`exclude_id` skip the account being edited, so re-saving a
    user without changing their address does not collide with themselves.
    """
    normalized = (email or "").strip().lower()

    checks = [
        ("patient", db.query(User).filter(func.lower(User.email) == normalized).first()),
        ("doctor", db.query(Doctor).filter(func.lower(Doctor.email) == normalized).first()),
        ("admin", db.query(AdminUser).filter(func.lower(AdminUser.email) == normalized).first()),
    ]

    return any(
        account is not None
        and not (role == exclude_role and account.id == exclude_id)
        for role, account in checks
    )


def specialization_exists(name: str | None, db: Session) -> bool:
    """
    True when `name` matches a row in `specializations`.

    `doctors.specialization` is a foreign key to `specializations.name`, so a
    value with no matching row is a constraint violation. Checked here rather
    than left to the database so the caller can return a 400 with a useful
    message instead of a 500 from an IntegrityError at commit.
    """
    if not name:
        return False
    from models import Specialization

    return (
        db.query(Specialization.id)
        .filter(Specialization.name == str(name).strip())
        .first()
        is not None
    )


def pick(payload: dict[str, Any], primary: str, fallback: str) -> str | None:
    """
    Return `primary`'s value when it was explicitly provided.

    A key present with an empty string means "clear this field", which is why
    the check is presence-and-not-None rather than truthiness. The fallback key
    is only consulted when the primary is genuinely absent or None.

    The admin panel sends `city` where the model says `practice_city` and both
    spellings are accepted, so most field reads go through here.
    """
    if primary in payload and payload[primary] is not None:
        return payload[primary]
    return payload.get(fallback)
