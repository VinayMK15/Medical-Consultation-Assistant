"""
Database maintenance: WAL checkpoint and incremental vacuum.

Run after bulk operations -- the seeders and the clear_* scripts delete and
insert thousands of rows at once, which leaves free pages scattered through
the file. Reclaiming them keeps the database from growing without bound.

    python scripts/maintenance.py              # checkpoint + reclaim everything
    python scripts/maintenance.py --pages 50   # reclaim at most 50 pages
    python scripts/maintenance.py --status     # report only, change nothing

`--pages` is the bounded form, for use on a live server where you would rather
spread the work across requests than hold a lock for a full reclaim.
"""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database  # noqa: E402


def _pages_label(count: int | None) -> str:
    if count is None:
        return "unknown"
    return f"{count:,} pages ({count * 4096 / 1024 / 1024:.1f} MiB)"


def report() -> None:
    """Print the settings that decide whether maintenance is possible."""
    with database.engine.connect() as conn:
        def scalar(pragma):
            return conn.exec_driver_sql(f"PRAGMA {pragma}").scalar()

        auto = scalar("auto_vacuum")
        mode = {0: "NONE", 1: "FULL", 2: "INCREMENTAL"}.get(auto, "?")
        free = scalar("freelist_count")
        total = scalar("page_count")
        page_size = scalar("page_size")
        journal = scalar("journal_mode")

    print(f"journal_mode   : {journal}")
    print(f"auto_vacuum    : {auto} ({mode})")
    print(f"freelist_count : {_pages_label(free)}")
    print(f"page_count     : {_pages_label(total)}")
    print(f"page_size      : {page_size} bytes")

    if free:
        print("\nReclaimable now: run without --status, or --pages N to bound it")
    else:
        print("\nNothing to reclaim.")

    if mode != "INCREMENTAL":
        print(
            "\nNote: incremental_vacuum needs auto_vacuum=INCREMENTAL, which "
            "only takes effect after a one-time full VACUUM on this file."
        )


def run_maintenance() -> None:
    """
    Checkpoint and vacuum, for import by the seed and clear scripts.

    Those scripts remove and insert large numbers of rows, so leaving the
    freelist to grow would slowly inflate the database file. Not fatal -- just
    wasted space that only a full VACUUM could take back later.
    """
    database.checkpoint_wal("TRUNCATE")
    database.incremental_vacuum()


def run_maintenance_blocking() -> None:
    """
    As `run_maintenance`, but with TRUNCATE, for a standalone maintenance run
    where nothing else is connected and the WAL file should be left at zero
    bytes.
    """
    database.checkpoint_wal("TRUNCATE")
    database.incremental_vacuum()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument(
        "--pages", type=int, default=0,
        help="Reclaim at most N pages (0 = everything reclaimable)",
    )
    parser.add_argument(
        "--status", action="store_true",
        help="Report the current settings without changing anything",
    )
    parser.add_argument(
        "--checkpoint", default=None,
        choices=["PASSIVE", "FULL", "RESTART", "TRUNCATE"],
        help=(
            "WAL checkpoint mode before vacuuming (default: TRUNCATE when "
            "this script is the only thing connected, PASSIVE otherwise). "
            "TRUNCATE and RESTART need exclusive access and will block for "
            "the full busy_timeout if the server is still running."
        ),
    )
    args = parser.parse_args(argv)

    if args.status:
        report()
        return 0

    # Default to the strongest mode that will not hang. Exclusive modes are
    # only safe when nothing else is connected, which is the normal case for
    # a maintenance run but not something to assume.
    mode = args.checkpoint
    if mode is None:
        mode = "TRUNCATE" if database.engine.pool.checkedout() == 0 else "PASSIVE"

    started = time.monotonic()
    busy, log_pages, checkpointed = database.checkpoint_wal(mode)
    elapsed = time.monotonic() - started
    print(
        f"checkpointed WAL ({mode}): {checkpointed} pages copied, "
        f"{log_pages} remaining, {elapsed:.2f}s"
    )
    if busy:
        print(
            "warning: another connection was holding a lock, so the checkpoint "
            "was partial. Stop the server and retry for a complete one."
        )

    with database.engine.connect() as conn:
        auto = conn.exec_driver_sql("PRAGMA auto_vacuum").scalar()

    if auto != 2:
        print(
            "incremental_vacuum did nothing: this database's auto_vacuum mode "
            "is not INCREMENTAL. Enable it once with a full VACUUM."
        )
        return 1

    reclaimed = database.incremental_vacuum(args.pages)

    with database.engine.connect() as conn:
        free = conn.exec_driver_sql("PRAGMA freelist_count").scalar()

    print(f"reclaimed      : {reclaimed} page(s)")
    print(f"freelist_count : {_pages_label(free)}")
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
