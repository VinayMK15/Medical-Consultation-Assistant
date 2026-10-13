import os
import sys
from logging.config import fileConfig

from alembic import context

# ---------------------------------------------------------------------------
# Make sure the backend/ directory is on the path so we can import our modules
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Import Base from our database module and all models so Alembic can inspect them
import database  # noqa: E402
import models  # noqa: E402, F401 — registers every model on Base.metadata
from database import Base  # noqa: E402

# ---------------------------------------------------------------------------
# Alembic Config object — provides access to alembic.ini values
# ---------------------------------------------------------------------------
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Point autogenerate at our models' metadata
target_metadata = Base.metadata


def _database_url() -> str:
    """
    Resolve the database URL from `database.engine`.

    Sourcing it from the engine rather than `alembic.ini` keeps one source of
    truth: migrations target exactly the database the app opens, and
    `DATABASE_URL` works for both. `alembic.ini` hardcoded
    `sqlite:///./medical_app.db`, which silently ignored the env var and meant
    migrations could be applied to a different file than the app used.

    `alembic.ini` remains the fallback so `--sql` offline mode still works
    when the engine cannot be constructed.
    """
    try:
        from database import engine
        return engine.url.render_as_string(hide_password=False)
    except Exception:
        return config.get_main_option("sqlalchemy.url")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine.
    Calls to context.execute() emit the given string to the script output.
    """
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Required for SQLite to detect column-level changes during autogenerate
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Creates an Engine and associates a connection with the context.
    """
    # Reuse the application's engine rather than building a second one. That
    # guarantees the migration runs against the same file the app opens, and
    # means the per-connection pragmas from database.py (WAL, foreign_keys=ON)
    # are already applied to it.
    connectable = database.engine

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Required for SQLite to detect column-level changes during autogenerate
            render_as_batch=True,
            # Without this, a migration that violates a foreign key succeeds
            # here and only fails later when the app turns FK enforcement on.
            # SQLite cannot ALTER a constraint in place regardless, so batch
            # mode has to recreate the table -- and the recreate must happen
            # with enforcement off or the copy trips over its own constraint.
            transactional_ddl=False,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
