import os
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db

# Load variables from backend/.env (silently a no-op if file is missing)
load_dotenv()


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# bcrypt work factor. 12 is passlib's default and the current minimum worth
# using; stated explicitly so it is a decision rather than an inheritance.
BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "12"))

pwd_context = CryptContext(
    schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=BCRYPT_ROUNDS
)

# Placeholders shipped in .env.example. A real deployment must replace these.
_PLACEHOLDER_SECRETS = {"change-me", "changeme", "changethis", "secret", "your-secret-key"}


def _load_secret_key() -> str:
    """
    Return the JWT signing key, or refuse to start.

    The previous behaviour was to warn and fall back to a random key. That is
    worse than failing: every restart invalidated every issued token, so users
    were silently logged out on each deploy, and nothing in the logs said the
    signing key was ephemeral. A service that cannot authenticate anyone
    correctly should not pretend to run.
    """
    raw = (os.getenv("SECRET_KEY") or "").strip()

    if not raw:
        raise RuntimeError(
            "SECRET_KEY is not set. Generate one with:\n"
            "    python -c \"import secrets; print(secrets.token_hex(32))\"\n"
            "and put it in backend/.env. Refusing to start: a random key would "
            "silently invalidate every issued token on each restart."
        )

    if raw.lower() in _PLACEHOLDER_SECRETS or raw.startswith("change-me"):
        raise RuntimeError(
            "SECRET_KEY is still the placeholder value from .env.example. "
            "Set a strong random key in backend/.env before running."
        )

    if len(raw) < 32:
        raise RuntimeError(
            f"SECRET_KEY is only {len(raw)} characters. Use at least 32 "
            "characters of entropy: python -c \"import secrets; "
            "print(secrets.token_hex(32))\""
        )

    return raw


SECRET_KEY = _load_secret_key()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    """
    Create a signed access token.

    Callers pass `{"sub": <id>, "role": ..., "email": ..., "ver": ...}`.
    `sub` is the account's numeric id rather than its email: email is mutable,
    and a token whose subject is an email stops resolving the moment the
    address changes. `role` and `ver` are convenience claims -- both are
    re-verified against the database by `_resolve_account` rather than
    trusted from the token.
    """
    to_encode = data.copy()
    expire = _utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/patient/login")


def _credentials_error() -> HTTPException:
    """
    A fresh 401 for every rejection.

    Built per call rather than shared: FastAPI logs and any handler that
    attaches context to the exception would otherwise mutate one shared
    object across concurrent requests.
    """
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _decode_token(token: str) -> dict[str, Any]:
    """
    Verify the signature and expiry, then return the claims.

    Only the cryptographic checks happen here. Whether the account still
    exists, is still active, and still holds this token version is decided in
    `_resolve_account`, which needs a database session.
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        # `from None`: the specific JWT failure (bad signature, expired,
        # malformed) is not something the caller should be able to
        # distinguish. Chaining it would leak that detail via the traceback.
        raise _credentials_error() from None


# Which table each role lives in. One place, so adding a role does not mean
# editing every lookup below.
_ROLE_MODELS = {
    "patient": "User",
    "doctor": "Doctor",
    "admin": "AdminUser",
    "superadmin": "AdminUser",
}


def _model_for(role: str):
    """Resolve a role name to its model class, or None if unknown."""
    import models

    name = _ROLE_MODELS.get(role)
    return getattr(models, name) if name else None


def _resolve_account(payload: dict[str, Any], db: Session):
    """
    Turn token claims into a live account row, or raise 401.

    The id in `sub` is authoritative. `role` narrows the lookup to one table;
    when it is absent or unknown, each table is tried in turn. This replaces a
    scheme that keyed on email and fell back to up to four sequential queries.
    """
    import models

    try:
        account_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise _credentials_error() from None

    role = payload.get("role")
    model = _model_for(role) if role else None
    candidates = [model] if model is not None else [
        models.User, models.Doctor, models.AdminUser
    ]

    account = None
    for candidate in candidates:
        # `candidates` holds model classes; mypy cannot know they all expose an
        # `id` attribute, and the runtime check is what matters here.
        account = db.query(candidate).filter(candidate.id == account_id).first()  # type: ignore[union-attr]
        if account is not None:
            break

    if account is None:
        raise _credentials_error()

    # A role claim that disagrees with the account it points at means the token
    # was minted for one kind of account and presented as another. The
    # signature is valid, so only the row can settle it.
    if role:
        expected = _model_for(role)
        if expected is None or not isinstance(account, expected):
            raise _credentials_error()

    # Token version. Bumping it on password change or deactivation invalidates
    # every outstanding token, with no blocklist to store.
    token_ver = payload.get("ver")
    if token_ver is not None and (account.token_version or 0) != token_ver:
        raise _credentials_error()

    return account


def revoke_tokens(account) -> None:
    """
    Invalidate every outstanding token for an account.

    Call after anything that should log the account out everywhere: a password
    change, an admin deactivation, a role change. Existing tokens stop
    validating on their next request, with nothing to garbage-collect.
    """
    account.token_version = (account.token_version or 0) + 1


def get_current_patient(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Dependency that ensures the authenticated caller is a patient."""
    account = _resolve_account(_decode_token(token), db)

    if not isinstance(account, _model_for("patient")):
        raise _credentials_error()

    return account


def get_current_doctor(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Dependency that ensures the authenticated caller is a doctor."""
    account = _resolve_account(_decode_token(token), db)

    if not isinstance(account, _model_for("doctor")):
        raise _credentials_error()

    if not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor account has been deactivated.",
        )

    return account


def get_current_admin(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Dependency that ensures the authenticated caller is an admin."""
    account = _resolve_account(_decode_token(token), db)

    if not isinstance(account, _model_for("admin")):
        raise _credentials_error()

    if not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is inactive.",
        )

    return account


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    Resolve a token to whichever of Patient, Doctor or AdminUser it names.

    For endpoints open to any signed-in account, such as /process. Unlike the
    role-specific dependencies this does not reject a deactivated doctor --
    those routes apply their own checks.
    """
    return _resolve_account(_decode_token(token), db)
