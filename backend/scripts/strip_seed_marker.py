"""
Strip the [seed-demo] marker from seeded appointment symptom text.

The seed script tagged its rows so it could find and replace them on a
re-run. The marker is redundant now that the rows have been reviewed, and
it leaks into the patient-facing Appointment History page, where it shows
as the first thing in the "SYMPTOMS" block.

This removes only the marker prefix and the space after it. The symptom
text itself is left exactly as written.

Usage:
    python scripts/strip_seed_marker.py
"""

import os
import sqlite3

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "medical_app.db"
)
TAG = "[seed-demo] "


def main():
    if not os.path.exists(DB_PATH):
        raise SystemExit(f"Database not found: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        "SELECT id, symptoms_summary FROM appointments "
        "WHERE symptoms_summary LIKE ?",
        (f"{TAG}%",),
    ).fetchall()

    if not rows:
        print("[strip] no tagged appointments found")
        conn.close()
        return

    print(f"[strip] {len(rows)} appointment(s) carry the marker\n")
    for r in rows:
        before = r["symptoms_summary"]
        after = before[len(TAG):] if before.startswith(TAG) else before
        print(f"  id {r['id']}")
        print(f"    - {before[:70]}")
        print(f"    + {after[:70]}")

    for r in rows:
        before = r["symptoms_summary"]
        after = before[len(TAG):] if before.startswith(TAG) else before
        conn.execute(
            "UPDATE appointments SET symptoms_summary = ? WHERE id = ?",
            (after, r["id"]),
        )

    conn.commit()

    remaining = conn.execute(
        "SELECT COUNT(*) FROM appointments WHERE symptoms_summary LIKE ?",
        (f"{TAG}%",),
    ).fetchone()[0]
    print(f"\n[strip] done — {remaining} row(s) still tagged")

    conn.close()


if __name__ == "__main__":
    main()
