"""
Remove every appointment previously created by seed_demo_appointments.py
for a given patient, so only the pre-existing rows remain.

Used to undo a seed that was pointed at the wrong account.

Usage:
    python scripts/clear_seeded_appointments.py test1@gmail.com
"""

import os
import sqlite3
import sys

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "medical_app.db"
)
TAG = "[seed-demo]"


def main():
    email = sys.argv[1] if len(sys.argv) > 1 else sys.exit("usage: clear_seeded_appointments.py <email>")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    patient = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if not patient:
        sys.exit(f"No patient row for {email}")

    before = conn.execute(
        "SELECT COUNT(*) FROM appointments WHERE patient_id = ?", (patient["id"],)
    ).fetchone()[0]

    removed = conn.execute(
        "DELETE FROM appointments WHERE patient_id = ? AND symptoms_summary LIKE ?",
        (patient["id"], f"{TAG}%"),
    ).rowcount
    conn.commit()

    after = conn.execute(
        "SELECT COUNT(*) FROM appointments WHERE patient_id = ?", (patient["id"],)
    ).fetchone()[0]

    print(f"[clear] {email}: removed {removed} seeded row(s)")
    print(f"[clear] {before} -> {after} appointment(s) remain")
    for r in conn.execute(
        "SELECT id, appointment_date, slot_time, status FROM appointments "
        "WHERE patient_id = ? ORDER BY appointment_date",
        (patient["id"],),
    ):
        print("   ", tuple(r))

    conn.close()


if __name__ == "__main__":
    main()
