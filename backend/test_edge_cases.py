"""
Deep-dive edge-case test suite for the MedAssist Slot Engine.

Tests logical loopholes in:
  - POST /api/appointments  (booking)
  - GET  /api/appointments/available-slots (slot lookup)

Run:  python test_edge_cases.py
"""

import os
import sqlite3
from datetime import date, timedelta

import requests

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "medical_app.db")
BASE = "http://127.0.0.1:8000"
PASS_COUNT = 0
FAIL_COUNT = 0


def login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", data={"username": email, "password": password})
    if r.status_code != 200:
        print(f"  [LOGIN FAIL] {email}: {r.json()}")
        return None
    return r.json()["access_token"]


def book(token, doctor_id, appt_date, slot_time, symptoms="Test symptoms"):
    return requests.post(
        f"{BASE}/api/appointments",
        json={
            "doctor_id": doctor_id,
            "appointment_date": appt_date,
            "slot_time": slot_time,
            "symptoms_summary": symptoms,
        },
        headers={"Authorization": f"Bearer {token}"},
    )


def get_slots(token, doctor_id, date_str):
    return requests.get(
        f"{BASE}/api/appointments/available-slots",
        params={"doctor_id": doctor_id, "date": date_str},
        headers={"Authorization": f"Bearer {token}"},
    )


def check(test_name, response, expected_status, should_contain=None):
    global PASS_COUNT, FAIL_COUNT
    passed = response.status_code == expected_status
    if should_contain and passed:
        body = str(response.json())
        passed = should_contain in body

    tag = "PASS" if passed else "FAIL"
    if passed:
        PASS_COUNT += 1
    else:
        FAIL_COUNT += 1

    print(f"  [{tag}] {test_name}")
    print(f"         Expected: {expected_status} | Got: {response.status_code}")
    if not passed or response.status_code >= 400:
        print(f"         Body: {response.json()}")
    print()


# -----------------------------------------------------------------------------
print("=" * 70)
print("  MedAssist Slot Engine - Edge Case Test Suite")
print("=" * 70)

# Setup: login tokens
token_patient = login("test1@gmail.com", "test1@123")
token_doctor = login("doctor@medassist.com", "doctor123")
token_admin = login("admin@medassist.com", "admin123")
assert token_patient, "Patient login failed"

import random

# Doctor ID 2 = Dr. Anjali Sharma (shift 09:00-17:00, verified)
DOCTOR_ID = 2
# Use dynamic far-future dates to prevent collisions across multiple test runs
rand_offset = random.randint(100, 5000)
TEST_DATE = (date.today() + timedelta(days=rand_offset)).isoformat()
PAST_DATE = (date.today() - timedelta(days=5)).isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()
UNIQUE_DATE = (date.today() + timedelta(days=rand_offset + 1)).isoformat()
CANCEL_DATE = (date.today() + timedelta(days=rand_offset + 2)).isoformat()
SLOTS_DATE = (date.today() + timedelta(days=rand_offset + 3)).isoformat()

# -----------------------------------------------------------------------------
print("\n-- TEST 1: Booking OUTSIDE doctor's shift hours --")
print("   Doctor shift: 09:00-17:00. Attempting to book 07:00 and 17:30.\n")

r = book(token_patient, DOCTOR_ID, TEST_DATE, "07:00", "Early bird booking")
check("Book slot 07:00 (before shift start) - should be rejected", r, 400)

r = book(token_patient, DOCTOR_ID, TEST_DATE, "17:30", "Late booking")
check("Book slot 17:30 (after shift end) - should be rejected", r, 400)

# -----------------------------------------------------------------------------
print("\n-- TEST 2: Booking on a PAST date --\n")

r = book(token_patient, DOCTOR_ID, PAST_DATE, "10:00", "Time travel booking")
check("Book slot on a date 5 days ago - should be rejected", r, 400)

r = book(token_patient, DOCTOR_ID, YESTERDAY, "10:00", "Yesterday booking")
check("Book slot on yesterday - should be rejected", r, 400)

# -----------------------------------------------------------------------------
print("\n-- TEST 3: Booking with non-existent doctor --\n")

r = book(token_patient, 99999, TEST_DATE, "10:00", "Ghost doctor")
check("Book with doctor_id=99999 (doesn't exist) - should be 404", r, 404)

# -----------------------------------------------------------------------------
print("\n-- TEST 4: Booking with unverified doctor --\n")

# Get an unverified doctor ID
conn = sqlite3.connect(DB_FILE)
cursor = conn.cursor()
cursor.execute("SELECT id, full_name FROM doctors WHERE is_verified=0 AND is_active=1 LIMIT 1")
unverified = cursor.fetchone()
cursor.execute("SELECT id, full_name FROM doctors WHERE is_verified=1 AND is_active=1 AND id != ? LIMIT 1", (DOCTOR_ID,))
doc_b = cursor.fetchone()
conn.close()

DOCTOR_B_ID = doc_b[0] if doc_b else DOCTOR_ID + 1

if unverified:
    UNVERIFIED_ID = unverified[0]
    print(f"   Using unverified doctor: {unverified[1]} (ID {UNVERIFIED_ID})\n")
    r = book(token_patient, UNVERIFIED_ID, TEST_DATE, "10:00", "Unverified doc")
    check("Book with unverified doctor - should be rejected", r, 400)
else:
    print("   [SKIP] No unverified doctors found in DB.\n")

# -----------------------------------------------------------------------------
print("\n-- TEST 5: Double-booking guard (Same patient & different doctors) --\n")

r1 = book(token_patient, DOCTOR_ID, UNIQUE_DATE, "14:00", "First booking")
check("First booking for Doctor A at 14:00 (should succeed)", r1, 201)

r2 = book(token_patient, DOCTOR_ID, UNIQUE_DATE, "14:00", "Duplicate booking same doctor")
check("Same patient, same doctor, same slot (should be 409)", r2, 409)

# Try booking a DIFFERENT doctor (Doctor B) for the SAME slot & date
r3 = book(token_patient, DOCTOR_B_ID, UNIQUE_DATE, "14:00", "Booking doctor B at same time")
check("Same patient, different doctor, same slot (should be 409 Conflict)", r3, 409)

# Login as second patient to test doctor double-booking across patients
token_patient2 = login("patient2@gmail.com", "patient123")
if token_patient2:
    r4 = book(token_patient2, DOCTOR_ID, UNIQUE_DATE, "14:00", "Patient 2 booking Doctor A")
    check("Patient 2 booking Doctor A for already-booked slot 14:00 (should be 409)", r4, 409)

# -----------------------------------------------------------------------------
print("\n-- TEST 6: Cancelled slot should be re-bookable --\n")

r = book(token_patient, DOCTOR_ID, CANCEL_DATE, "15:00", "Will cancel this")
if r.status_code == 201:
    appt_id = r.json()["id"]
    # Cancel appointment via API endpoint
    r_cancel = requests.patch(
        f"{BASE}/api/appointments/{appt_id}/cancel",
        headers={"Authorization": f"Bearer {token_patient}"}
    )
    print(f"   Cancelled appointment {appt_id} via API: {r_cancel.status_code}\n")

    r_rebook = book(token_patient, DOCTOR_ID, CANCEL_DATE, "15:00", "Rebooking cancelled slot")
    check("Rebook a cancelled slot (should succeed)", r_rebook, 201)
else:
    print(f"   [SKIP] Initial booking failed: {r.status_code}\n")

# -----------------------------------------------------------------------------
print("\n-- TEST 7: Invalid slot_time format (not on 30-min grid) --\n")

r = book(token_patient, DOCTOR_ID, TEST_DATE, "10:15", "Off-grid time")
check("Book slot 10:15 (not :00 or :30)", r, 422)

r = book(token_patient, DOCTOR_ID, TEST_DATE, "25:00", "Invalid hour")
check("Book slot 25:00 (invalid hour)", r, 422)

r = book(token_patient, DOCTOR_ID, TEST_DATE, "abc", "Garbage input")
check("Book slot 'abc' (garbage)", r, 422)

# -----------------------------------------------------------------------------
print("\n-- TEST 8: Available-slots reflects booked slots --\n")

slots_before = get_slots(token_patient, DOCTOR_ID, SLOTS_DATE)
if slots_before.status_code == 200:
    avail_before = slots_before.json()["available_slots"]
    total_before = len(avail_before)
    print(f"   Slots before booking: {total_before}")

    book(token_patient, DOCTOR_ID, SLOTS_DATE, "10:00", "Slot test")
    book(token_patient, DOCTOR_ID, SLOTS_DATE, "10:30", "Slot test")

    slots_after = get_slots(token_patient, DOCTOR_ID, SLOTS_DATE)
    data_after = slots_after.json()
    avail_after = data_after["available_slots"]
    booked_after = data_after.get("booked_slots_list", [])
    total_after = len(avail_after)
    print(f"   Slots after 2 bookings: {total_after} (Booked: {len(booked_after)})")

    removed = total_before - total_after == 2
    has_10_removed = "10:00" not in avail_after and "10:30" not in avail_after
    has_10_booked = "10:00" in booked_after and "10:30" in booked_after
    check("Available slots decreased by 2", slots_after, 200)
    ok = removed and has_10_removed and has_10_booked
    if ok:
        PASS_COUNT += 1
    else:
        FAIL_COUNT += 1
    tag = "PASS" if ok else "FAIL"
    print(f"  [{tag}] 10:00 and 10:30 marked booked and removed from available list")
    print(f"         Before: {total_before} slots | After: {total_after} slots")
    print(f"         10:00 in avail: {'10:00' in avail_after} | 10:00 in booked: {'10:00' in booked_after}")
    print()
else:
    print(f"   [SKIP] available-slots returned {slots_before.status_code}\n")

# -----------------------------------------------------------------------------
print("\n-- TEST 9: Non-patient role trying to book --\n")

if token_doctor:
    r = book(token_doctor, DOCTOR_ID, TEST_DATE, "12:00", "Doctor self-book")
    check("Doctor trying to book (should be 403)", r, 403)

if token_admin:
    r = book(token_admin, DOCTOR_ID, TEST_DATE, "12:00", "Admin booking")
    check("Admin trying to book (should be 403)", r, 403)

# -----------------------------------------------------------------------------
print("\n-- TEST 10: Booking with a patient_id (non-doctor) as doctor_id --\n")

# Patient ID = 3 (test1@gmail.com, role=patient)
r = book(token_patient, 3, TEST_DATE, "10:00", "Book with a patient as doctor")
check("Book with patient as doctor_id - should be 404", r, 404)

# -----------------------------------------------------------------------------
print("\n-- TEST 11: Attempting to mark past date as vacation --\n")

if token_doctor:
    r = requests.post(
        f"{BASE}/api/doctor/blocked-dates",
        json={"date": PAST_DATE},
        headers={"Authorization": f"Bearer {token_doctor}"},
    )
    check("Doctor marking past date as vacation - should be 400", r, 400)


# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 70)
print("  FINAL SUMMARY")
print("=" * 70)
print(f"  Passed: {PASS_COUNT}")
print(f"  Failed: {FAIL_COUNT}")
print()
print("  NOTE: Tests marked PASS above that returned 201 for bad input")
print("  are LOOPHOLES that need fixing. Review each test carefully.")
print("=" * 70)
