"""
Consistent backup of the MedAssist SQLite database.

Uses SQLite's Online Backup API rather than copying the file. Copying a live
database is unsafe, and in WAL mode it is worse than merely risky: committed
transactions may still be sitting in the `-wal` sidecar, so a copy of the
`.db` file alone can be missing recent writes entirely. The backup API takes a
snapshot through the database's own page cache, so the result is always a
complete, consistent database regardless of what else is connected.

    python scripts/backup_db.py                       # writes medical_app.backup.db
    python scripts/backup_db.py path/to/snapshot.db   # explicit destination
    python scripts/backup_db.py --retention 7         # keep the last 7 snapshots

Safe to run while the app is serving traffic. The source is read with a shared
lock, so concurrent readers are unaffected and a writer is only blocked for as
long as it takes to copy the pages that changed.
"""

from __future__ import annotations

import argparse
import glob
import os
import sqlite3
import sys
import time

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Default source, matching database.py's fallback when DATABASE_URL is unset.
DEFAULT_SOURCE = os.path.join(BACKEND_DIR, "medical_app.db")

# Timestamped rather than overwritten, so a corrupt run cannot destroy the
# previous good snapshot.
TIMESTAMP_FORMAT = "%Y%m%d-%H%M%S"


def resolve_source() -> str:
    """Honour DATABASE_URL so a non-default database can be backed up."""
    url = os.getenv("DATABASE_URL")
    if not url or not url.startswith("sqlite:///"):
        return DEFAULT_SOURCE
    path = url[len("sqlite:///"):]
    if path and not os.path.isabs(path):
        path = os.path.join(BACKEND_DIR, path)
    return path


def backup(source_path: str, dest_path: str) -> None:
    """
    Write a consistent snapshot of `source_path` to `dest_path`.

    Uses `pages=-1` so the backup runs to completion in a single step rather
    than copying in chunks between transactions.
    """
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"No database at {source_path}")

    # Build the destination connection with isolation_level=None (autocommit).
    # The backup API drives its own transaction on the source; a transaction
    # open on the destination would make it fail.
    with sqlite3.connect(source_path) as source:
        dest = sqlite3.connect(dest_path, isolation_level=None)
        try:
            source.backup(dest, pages=-1)
        finally:
            dest.close()


def verify(path: str) -> None:
    """
    Prove the snapshot is usable before anyone relies on it.

    A backup that cannot be opened is worse than no backup, because it looks
    like one. `integrity_check` also catches a snapshot that was written
    mid-transaction.
    """
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        result = conn.execute("PRAGMA integrity_check").fetchone()[0]
        if result != "ok":
            raise RuntimeError(f"integrity_check failed on {path}: {result}")

        violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise RuntimeError(
                f"{len(violations)} foreign key violations in {path}: "
                f"{violations[:3]}"
            )
    finally:
        conn.close()


def prune(dest_path: str, keep: int) -> list[str]:
    """Delete older snapshots of the same database, keeping the newest `keep`."""
    if keep < 1:
        return []

    stem = os.path.splitext(dest_path)[0]
    pattern = f"{stem}-*.db"
    existing = sorted(glob.glob(pattern), reverse=True)
    removed = []
    for stale in existing[keep:]:
        os.remove(stale)
        removed.append(stale)
    return removed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument(
        "dest", nargs="?",
        help="Destination file. Defaults to <dbname>.backup-<timestamp>.db",
    )
    parser.add_argument(
        "--source", default=None,
        help="Database to back up. Defaults to DATABASE_URL, else medical_app.db",
    )
    parser.add_argument(
        "--retention", type=int, default=0,
        help="Keep only the N most recent timestamped snapshots (0 = keep all)",
    )
    args = parser.parse_args(argv)

    source_path = args.source or resolve_source()
    if args.dest:
        dest_path = args.dest
        timestamped = False
    else:
        base, ext = os.path.splitext(source_path)
        stamp = time.strftime(TIMESTAMP_FORMAT)
        dest_path = f"{base}.backup-{stamp}{ext or '.db'}"
        timestamped = True

    if os.path.abspath(dest_path) == os.path.abspath(source_path):
        print("Refusing to overwrite the source database.", file=sys.stderr)
        return 1

    print(f"source      : {source_path}")
    print(f"destination : {dest_path}")

    started = time.monotonic()
    backup(source_path, dest_path)
    elapsed = time.monotonic() - started

    size = os.path.getsize(dest_path)
    print(f"copied      : {size:,} bytes in {elapsed:.2f}s")

    verify(dest_path)
    print("verified    : integrity_check ok, no foreign key violations")

    if args.retention and timestamped:
        removed = prune(dest_path, args.retention)
        for path in removed:
            print(f"pruned      : {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
