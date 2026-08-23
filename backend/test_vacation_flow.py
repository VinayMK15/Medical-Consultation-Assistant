import requests
from datetime import date, timedelta

BASE = "http://127.0.0.1:8000"

def run_vacation_audit():
    print("=" * 70)
    print("  Doctor Calendar Vacation Feature Audit")
    print("=" * 70)

    # 1. Login as Doctor
    doc_res = requests.post(f"{BASE}/api/auth/login", data={"username": "doctor@medassist.com", "password": "doctor123"})
    if doc_res.status_code != 200:
        print(f"[FAIL] Doctor login failed: {doc_res.status_code} {doc_res.text}")
        return
    token_doc = doc_res.json()["access_token"]
    print("[PASS] 1. Doctor logged in successfully.")

    # Get doctor ID
    prof_res = requests.get(f"{BASE}/api/doctor/profile", headers={"Authorization": f"Bearer {token_doc}"})
    doctor_id = prof_res.json()["id"]

    # 2. Login as Patient
    pat_res = requests.post(f"{BASE}/api/auth/login", data={"username": "test1@gmail.com", "password": "test1@123"})
    if pat_res.status_code != 200:
        print(f"[FAIL] Patient login failed: {pat_res.status_code} {pat_res.text}")
        return
    token_pat = pat_res.json()["access_token"]
    print("[PASS] 2. Patient logged in successfully.")

    # Target future date for vacation testing (using +14 days to avoid existing demo appointments)
    test_vacation_date = (date.today() + timedelta(days=14)).isoformat()
    past_date = (date.today() - timedelta(days=2)).isoformat()

    headers_doc = {"Authorization": f"Bearer {token_doc}"}
    headers_pat = {"Authorization": f"Bearer {token_pat}"}

    # Ensure clean start date state (if blocked from prior runs, unblock first)
    summary_init = requests.get(f"{BASE}/api/doctor/calendar-summary?year={date.today().year}&month={date.today().month}", headers=headers_doc).json()
    if test_vacation_date in summary_init.get("blocked_dates", []):
        requests.post(f"{BASE}/api/doctor/blocked-dates", json={"date": test_vacation_date}, headers=headers_doc)

    # Step A: Doctor marks test_vacation_date as vacation
    block_res = requests.post(f"{BASE}/api/doctor/blocked-dates", json={"date": test_vacation_date}, headers=headers_doc)
    print(f"\n-- STEP A: Doctor marks {test_vacation_date} as vacation --")
    print(f"Status: {block_res.status_code} | Body: {block_res.json()}")
    if block_res.status_code == 200 and test_vacation_date in block_res.json().get("blocked_dates", []):
        print("  [PASS] Date successfully added to doctor's blocked_dates list.")
    else:
        print("  [FAIL] Could not block date.")

    # Step B: Doctor checks calendar-summary
    today_dt = date.today()
    summary_res = requests.get(f"{BASE}/api/doctor/calendar-summary?year={today_dt.year}&month={today_dt.month}", headers=headers_doc)
    print(f"\n-- STEP B: Doctor fetches calendar summary --")
    print(f"Status: {summary_res.status_code}")
    if test_vacation_date in summary_res.json().get("blocked_dates", []):
        print("  [PASS] calendar-summary endpoint returns blocked date correctly.")
    else:
        print("  [FAIL] calendar-summary missing blocked date.")

    # Step C: Patient checks available slots on vacation date
    slots_res = requests.get(f"{BASE}/api/appointments/available-slots?doctor_id={doctor_id}&date={test_vacation_date}", headers=headers_pat)
    print(f"\n-- STEP C: Patient queries available slots on vacation date ({test_vacation_date}) --")
    print(f"Status: {slots_res.status_code} | Body: {slots_res.json()}")
    slots_data = slots_res.json()
    if slots_data.get("available_slots") == [] and "vacation" in slots_data.get("message", "").lower():
        print("  [PASS] Patient sees empty slots with vacation notice.")
    else:
        print("  [FAIL] Patient slot availability check failed.")

    # Step D: Patient attempts to book appointment on vacation date
    book_payload = {
        "doctor_id": doctor_id,
        "appointment_date": test_vacation_date,
        "slot_time": "10:00",
        "symptoms_summary": "Vacation test booking"
    }
    book_res = requests.post(f"{BASE}/api/appointments", json=book_payload, headers=headers_pat)
    print(f"\n-- STEP D: Patient attempts to book on vacation date --")
    print(f"Status: {book_res.status_code} | Detail: {book_res.json().get('detail')}")
    if book_res.status_code == 400 and "vacation" in book_res.json().get('detail', '').lower():
        print("  [PASS] Booking rejected with HTTP 400 (Doctor is on vacation).")
    else:
        print("  [FAIL] Booking was not blocked on vacation date.")

    # Step E: Doctor unblocks the vacation date
    unblock_res = requests.post(f"{BASE}/api/doctor/blocked-dates", json={"date": test_vacation_date}, headers=headers_doc)
    print(f"\n-- STEP E: Doctor unblocks {test_vacation_date} --")
    print(f"Status: {unblock_res.status_code} | Body: {unblock_res.json()}")
    if unblock_res.status_code == 200 and test_vacation_date not in unblock_res.json().get("blocked_dates", []):
        print("  [PASS] Vacation block successfully removed.")
    else:
        print("  [FAIL] Could not unblock date.")

    # Step F: Doctor attempts to block past date
    past_block_res = requests.post(f"{BASE}/api/doctor/blocked-dates", json={"date": past_date}, headers=headers_doc)
    print(f"\n-- STEP F: Doctor attempts to block past date ({past_date}) --")
    print(f"Status: {past_block_res.status_code} | Detail: {past_block_res.json().get('detail')}")
    if past_block_res.status_code == 400:
        print("  [PASS] Past date vacation block rejected with HTTP 400.")
    else:
        print("  [FAIL] Past date blocking was allowed.")

    print("\n" + "=" * 70)
    print("  AUDIT COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    run_vacation_audit()
