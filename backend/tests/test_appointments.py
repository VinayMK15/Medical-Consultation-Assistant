"""
Appointment booking: slot validation, double-booking prevention, and the
race between two concurrent requests for the same slot.

The booking route reads twice before inserting, then relies on a partial
unique index plus `IntegrityError` handling to be correct under contention.
That last part is what these tests actually pin down.
"""

import uuid
from datetime import date, timedelta

import pytest
from conftest import auth_header, login
from sqlalchemy.exc import IntegrityError


def future_weekday(offset: int = 7) -> str:
    """A date comfortably in the future, as YYYY-MM-DD (for request bodies)."""
    return (date.today() + timedelta(days=offset)).isoformat()


def future_weekday_obj(offset: int = 7) -> date:
    """The same date as a `datetime.date`, which the ORM's Date column requires."""
    return date.today() + timedelta(days=offset)


def book(client, token, doctor_id, when, slot, symptoms="Headache and dizziness"):
    return client.post("/api/appointments", json={
        "doctor_id": doctor_id,
        "appointment_date": when,
        "slot_time": slot,
        "symptoms_summary": symptoms,
    }, headers=auth_header(token))


# ---------------------------------------------------------------------------
# Slot availability
# ---------------------------------------------------------------------------
class TestAvailableSlots:
    def test_returns_full_shift_when_empty(self, client, patient_token, doctor):
        resp = client.get(
            f"/api/appointments/available-slots?doctor_id={doctor.id}&date={future_weekday()}",
            headers=auth_header(patient_token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "09:00" in body["available_slots"]
        assert len(body["all_slots"]) == 16  # 09:00-17:00 at 30 minutes

    def test_unknown_doctor_404(self, client, patient_token):
        resp = client.get(
            "/api/appointments/available-slots?doctor_id=99999&date=" + future_weekday(),
            headers=auth_header(patient_token),
        )
        assert resp.status_code == 404

    def test_malformed_date_400(self, client, patient_token, doctor):
        resp = client.get(
            f"/api/appointments/available-slots?doctor_id={doctor.id}&date=not-a-date",
            headers=auth_header(patient_token),
        )
        assert resp.status_code == 400

    def test_blocked_date_returns_no_slots(self, client, patient_token, db, doctor):
        when = future_weekday()
        doctor.blocked_dates = [when]
        db.commit()

        resp = client.get(
            f"/api/appointments/available-slots?doctor_id={doctor.id}&date={when}",
            headers=auth_header(patient_token),
        )
        assert resp.status_code == 200
        assert resp.json()["available_slots"] == []

    def test_booked_slot_disappears_from_availability(self, client, patient_token, doctor):
        when = future_weekday()
        assert book(client, patient_token, doctor.id, when, "10:00").status_code == 201

        resp = client.get(
            f"/api/appointments/available-slots?doctor_id={doctor.id}&date={when}",
            headers=auth_header(patient_token),
        )
        assert "10:00" in resp.json()["booked_slots_list"]
        assert "10:00" not in resp.json()["available_slots"]


# ---------------------------------------------------------------------------
# Booking validation
# ---------------------------------------------------------------------------
class TestBookingValidation:
    def test_successful_booking(self, client, db, patient_token, doctor):
        resp = book(client, patient_token, doctor.id, future_weekday(), "11:00")
        assert resp.status_code == 201, resp.text

        import models
        appt = db.query(models.Appointment).first()
        assert appt.status == "Pending"
        assert appt.slot_time == "11:00"

    def test_slot_outside_shift_rejected(self, client, patient_token, doctor):
        resp = book(client, patient_token, doctor.id, future_weekday(), "20:00")
        assert resp.status_code == 400
        assert "shift" in resp.json()["detail"].lower()

    def test_malformed_slot_time_rejected_by_schema(self, client, patient_token, doctor):
        resp = book(client, patient_token, doctor.id, future_weekday(), "11:15")
        assert resp.status_code == 422

    def test_unknown_doctor_rejected(self, client, patient_token):
        resp = book(client, patient_token, 99999, future_weekday(), "11:00")
        assert resp.status_code == 404

    def test_blocked_date_rejected(self, client, db, patient_token, doctor):
        when = future_weekday()
        doctor.blocked_dates = [when]
        db.commit()

        resp = book(client, patient_token, doctor.id, when, "11:00")
        assert resp.status_code == 400
        assert "vacation" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Double-booking prevention
# ---------------------------------------------------------------------------
class TestDoubleBooking:
    def test_same_slot_same_doctor_conflicts(self, client, patient_token, doctor):
        when = future_weekday()
        assert book(client, patient_token, doctor.id, when, "12:00").status_code == 201

        resp = book(client, patient_token, doctor.id, when, "12:00")
        assert resp.status_code == 409
        assert "already booked" in resp.json()["detail"]

    def test_patient_slot_conflict_across_two_real_doctors(self, client, patient_token, doctor, doctor2):
        """
        A patient may only hold one appointment per slot, even across different
        doctors. This is the patient-side guard, distinct from the doctor-side
        unique index.
        """
        when = future_weekday()
        assert book(client, patient_token, doctor.id, when, "14:00").status_code == 201

        resp = book(client, patient_token, doctor2.id, when, "14:00")
        assert resp.status_code == 409
        assert "already have an appointment" in resp.json()["detail"]

    def test_different_slots_do_not_conflict(self, client, patient_token, doctor):
        when = future_weekday()
        assert book(client, patient_token, doctor.id, when, "15:00").status_code == 201
        assert book(client, patient_token, doctor.id, when, "15:30").status_code == 201

    def test_cancelled_slot_can_be_rebooked(self, client, patient_token,
                                            patient2_token, doctor):
        """
        The unique index is partial (`WHERE status != 'Cancelled'`), so a
        cancelled booking must free the slot for someone else.
        """
        when = future_weekday()
        created = book(client, patient_token, doctor.id, when, "16:00")
        assert created.status_code == 201
        appt_id = created.json()["id"]

        cancel = client.patch(f"/api/appointments/{appt_id}/cancel",
                              headers=auth_header(patient_token))
        assert cancel.status_code == 200

        # A different patient can now take the slot.
        resp = book(client, patient2_token, doctor.id, when, "16:00")
        assert resp.status_code == 201

    def test_pending_slot_still_blocks_others(self, client, patient_token,
                                              patient2_token, doctor):
        """A Pending booking occupies the slot; only Cancelled releases it."""
        when = future_weekday()
        assert book(client, patient_token, doctor.id, when, "09:30").status_code == 201

        resp = book(client, patient2_token, doctor.id, when, "09:30")
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Concurrency: the case the partial unique index exists for
# ---------------------------------------------------------------------------
class TestBookingRace:
    def test_partial_unique_index_rejects_duplicate_active_rows(self, db, patient, doctor):
        """
        Two inserts for the same slot in one transaction: the index must stop
        the second. This is the invariant the booking route leans on, asserted
        directly against the database rather than through HTTP.
        """
        import models

        when = future_weekday_obj()
        db.add(models.Appointment(patient_id=patient.id, doctor_id=doctor.id,
                                  appointment_date=when, slot_time="09:00",
                                  symptoms_summary="x", status="Pending"))
        db.commit()

        db.add(models.Appointment(patient_id=patient.id, doctor_id=doctor.id,
                                  appointment_date=when, slot_time="09:00",
                                  symptoms_summary="y", status="Pending"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_index_allows_cancelled_rows_to_coexist(self, db, patient, doctor):
        """The `WHERE status != 'Cancelled'` predicate is what makes this pass."""
        import models

        when = future_weekday_obj()
        for status, summary in (("Cancelled", "first"), ("Pending", "second")):
            db.add(models.Appointment(patient_id=patient.id, doctor_id=doctor.id,
                                      appointment_date=when, slot_time="09:00",
                                      symptoms_summary=summary, status=status))
            db.commit()

        rows = db.query(models.Appointment).filter_by(
            doctor_id=doctor.id, appointment_date=when, slot_time="09:00").all()
        assert len(rows) == 2

    def test_two_clients_racing_one_slot_yield_exactly_one_booking(self, db, patient, doctor):
        """
        Simulates the interleaving the read-then-write path can hit: both
        requests pass the pre-check, both attempt the insert, and the index
        resolves it. Exactly one row survives.
        """
        import models

        when = future_weekday_obj()
        # Both requests observe the slot as free.
        existing = db.query(models.Appointment).filter_by(
            doctor_id=doctor.id, appointment_date=when, slot_time="09:00",
            status="Pending").first()
        assert existing is None

        wins = 0
        for summary in ("racer-a", "racer-b"):
            try:
                db.add(models.Appointment(patient_id=patient.id, doctor_id=doctor.id,
                                          appointment_date=when, slot_time="09:00",
                                          symptoms_summary=summary, status="Pending"))
                db.commit()
                wins += 1
            except IntegrityError:
                db.rollback()

        assert wins == 1
        rows = db.query(models.Appointment).filter_by(
            doctor_id=doctor.id, appointment_date=when, slot_time="09:00").all()
        assert len(rows) == 1


# ---------------------------------------------------------------------------
# Listing and cancellation
# ---------------------------------------------------------------------------
class TestAppointmentListing:
    def test_patient_sees_only_their_appointments(self, client, patient_token,
                                                   patient2_token, doctor):
        when = future_weekday()
        book(client, patient_token, doctor.id, when, "09:00")

        resp = client.get("/api/patient/appointments", headers=auth_header(patient2_token))
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["data"] == []

    def test_patient_sees_their_own_appointment(self, client, patient_token, doctor):
        when = future_weekday()
        book(client, patient_token, doctor.id, when, "09:00")

        resp = client.get("/api/patient/appointments", headers=auth_header(patient_token))
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert len(body["data"]) == 1
        assert body["data"][0]["slot_time"] == "09:00"

    def test_listing_is_paginated(self, client, patient_token, doctor):
        when = future_weekday()
        for slot in ("09:00", "09:30", "10:00"):
            book(client, patient_token, doctor.id, when, slot)

        resp = client.get("/api/patient/appointments?limit=2",
                          headers=auth_header(patient_token))
        body = resp.json()
        assert body["total"] == 3
        assert len(body["data"]) == 2

    def test_listing_requires_authentication(self, client):
        assert client.get("/api/patient/appointments").status_code == 401

    def test_cancel_releases_slot_and_sets_status(self, client, db, patient_token, doctor):
        when = future_weekday()
        appt_id = book(client, patient_token, doctor.id, when, "10:30").json()["id"]

        resp = client.patch(f"/api/appointments/{appt_id}/cancel",
                            headers=auth_header(patient_token))
        assert resp.status_code == 200

        db.expire_all()
        import models
        assert db.query(models.Appointment).filter_by(id=appt_id).first().status == "Cancelled"

    def test_cannot_cancel_someone_elses_appointment(self, client, patient_token,
                                                     patient2_token, doctor):
        when = future_weekday()
        appt_id = book(client, patient_token, doctor.id, when, "10:30").json()["id"]

        resp = client.patch(f"/api/appointments/{appt_id}/cancel",
                            headers=auth_header(patient2_token))
        assert resp.status_code in (403, 404)

    def test_booking_requires_authentication(self, client, doctor):
        assert book(client, "no-token", doctor.id, future_weekday(), "09:00").status_code == 401
