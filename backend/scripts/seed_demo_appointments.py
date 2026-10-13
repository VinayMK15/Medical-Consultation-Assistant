"""
Seed demo appointments for a patient account.

Default target is emptyspotify12@gmail.com (Vinay M Karigar), the account
used for manual testing of the patient portal.

The set it creates
------------------
Five appointments across five different verified doctors:

  * four in the PAST, all marked Completed
  * one in the FUTURE, left Pending

That mix is deliberate. The patient profile's Appointment History has a
status filter, per-tab counts, a relative-day label and a collapsible
"past" list, and none of those could be checked against real rows before
— every seeded appointment sat in the future with the same doctor, so the
whole past branch of the page was never exercised.

Safety
------
Idempotent. It deletes only rows it previously created, identified by the
TAG prefix in symptoms_summary, then reinserts. Appointments that existed
before are never touched, so pointing this at a real account is safe.

Usage
-----
    python scripts/seed_demo_appointments.py
    python scripts/seed_demo_appointments.py someone@example.com
"""

import os
import sqlite3
import sys
from datetime import date, timedelta

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "medical_app.db"
)

DEFAULT_PATIENT_EMAIL = "emptyspotify12@gmail.com"
TAG = "[seed-demo]"

# (days_from_today, slot_time, doctor_email, symptom summary)
# Negative days are in the past and are written as Completed; the positive
# entry stays Pending. A Past+Pending booking is a state the booking API
# cannot produce, so writing one would make the UI show impossible data.
PLAN = [
    (-24, "10:00", "dr.neurologist.indiranagar@medassist.com",
     "Recurring headaches with light sensitivity; reviewed and advised on sleep routine."),
    (-14, "11:30", "dr.dermatologist.yelahanka@medassist.com",
     "Skin rash on the forearm; topical treatment started at the consultation."),
    (-6, "16:00", "dr.pulmonologist.malleswaram@medassist.com",
     "Persistent dry cough for two weeks; chest examined, advised to monitor."),
    (-2, "12:30", "dr.gastroenterologist.jayanagar@medassist.com",
     "Acid reflux and bloating after meals; dietary guidance provided."),
    (5, "09:30", "dr.orthopedicsurgeon.bellandur@medassist.com",
     "Lower back pain after long drives; requesting a consultation."),
]


def resolve_doctor(conn, email):
    """Return the doctor's id, or None if the address is not a verified,
    active doctor. Silently skipping would hide a typo in the plan above,
    so the caller reports the skip."""
    row = conn.execute(
        "SELECT id FROM doctors WHERE email = ? AND is_verified = 1 AND is_active = 1",
        (email,),
    ).fetchone()
    return row["id"] if row else None


def main():
    patient_email = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATIENT_EMAIL

    if not os.path.exists(DB_PATH):
        sys.exit(f"Database not found: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    today = date.today()

    patient = conn.execute(
        "SELECT id, full_name FROM users WHERE email = ?", (patient_email,)
    ).fetchone()
    if not patient:
        sys.exit(f"No patient row for {patient_email}")

    # Clear only this script's own prior output, for this patient.
    removed = conn.execute(
        "DELETE FROM appointments WHERE patient_id = ? AND symptoms_summary LIKE ?",
        (patient["id"], f"{TAG}%"),
    ).rowcount
    if removed:
        print(f"[seed] cleared {removed} previously seeded appointment(s)")

    inserted = 0
    for offset, slot, doctor_email, symptom in PLAN:
        doctor_id = resolve_doctor(conn, doctor_email)
        if doctor_id is None:
            print(f"[seed] SKIP {doctor_email} — not a verified active doctor")
            continue

        appt_date = (today + timedelta(days=offset)).isoformat()
        status = "Completed" if offset < 0 else "Pending"

        conn.execute(
            "INSERT INTO appointments "
            "(patient_id, doctor_id, appointment_date, slot_time, status, symptoms_summary) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (patient["id"], doctor_id, appt_date, slot, status, f"{TAG} {symptom}"),
        )
        inserted += 1
        marker = "past  " if offset < 0 else "future"
        print(f"[seed] {appt_date} {slot}  {status:<9} [{marker}] doctor {doctor_id}")

    conn.commit()

    print(
        f"\n[seed] inserted {inserted} appointment(s) for "
        f"{patient_email} ({patient['full_name']})"
    )

    rows = conn.execute(
        "SELECT appointment_date, slot_time, status FROM appointments "
        "WHERE patient_id = ? ORDER BY appointment_date",
        (patient["id"],),
    ).fetchall()

    past = sum(1 for r in rows if r["appointment_date"] < today.isoformat())
    done = sum(1 for r in rows if r["status"] == "Completed")
    print(f"[seed] total {len(rows)}  |  {past} in the past  |  {done} completed")

    conn.close()


if __name__ == "__main__":
    main()
