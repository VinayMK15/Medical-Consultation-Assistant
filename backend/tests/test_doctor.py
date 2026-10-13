"""Doctor portal: appointment queue, prescription notes, schedule, vacation days."""

from datetime import date, timedelta

import pytest
from conftest import auth_header


def future_weekday(offset: int = 7) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


@pytest.fixture
def booked(client, db, patient, doctor):
    """One Pending appointment for `doctor` on a future date."""
    import models

    appt = models.Appointment(
        patient_id=patient.id, doctor_id=doctor.id,
        appointment_date=date.today() + timedelta(days=7),
        slot_time="10:00", symptoms_summary="Chest pain", status="Pending",
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return appt


class TestDoctorQueue:
    def test_lists_own_appointments(self, client, doctor_token, doctor, booked):
        resp = client.get("/api/doctor/appointments", headers=auth_header(doctor_token))
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["data"][0]["patient_email"] == "patient@example.com"

    def test_excludes_other_doctors_appointments(self, client, doctor_token,
                                                 doctor2_token, booked):
        mine = client.get("/api/doctor/appointments", headers=auth_header(doctor_token))
        assert mine.json()["total"] == 1

        theirs = client.get("/api/doctor/appointments", headers=auth_header(doctor2_token))
        assert theirs.json()["total"] == 0

    def test_requires_authentication(self, client):
        assert client.get("/api/doctor/appointments").status_code == 401


class TestPrescriptionNotes:
    def test_saves_notes_without_changing_status(self, client, db, doctor_token, booked):
        resp = client.patch(f"/api/doctor/appointments/{booked.id}/notes",
                            json={"prescription_notes": "Rest and fluids."},
                            headers=auth_header(doctor_token))
        assert resp.status_code == 200, resp.text

        db.expire_all()
        import models
        appt = db.query(models.Appointment).filter_by(id=booked.id).first()
        assert appt.prescription_notes == "Rest and fluids."
        assert appt.status == "Pending"

    def test_cannot_write_notes_on_another_doctors_appointment(self, client, doctor2_token, booked):
        resp = client.patch(f"/api/doctor/appointments/{booked.id}/notes",
                            json={"prescription_notes": "Tampered"},
                            headers=auth_header(doctor2_token))
        assert resp.status_code == 404

    def test_unknown_appointment_404(self, client, doctor_token):
        resp = client.patch("/api/doctor/appointments/99999/notes",
                            json={"prescription_notes": "x"},
                            headers=auth_header(doctor_token))
        assert resp.status_code == 404


class TestCompletion:
    def test_marks_completed_and_sends_summary(self, client, db, doctor_token, booked, sent_emails):
        resp = client.patch(f"/api/doctor/appointments/{booked.id}/complete",
                            json={"prescription_notes": "Take medication."},
                            headers=auth_header(doctor_token))
        assert resp.status_code == 200

        db.expire_all()
        import models
        appt = db.query(models.Appointment).filter_by(id=booked.id).first()
        assert appt.status == "Completed"
        assert any(to == "patient@example.com" for to, _ in sent_emails)

    def test_cannot_complete_cancelled_appointment(self, client, db, doctor_token, booked):
        booked.status = "Cancelled"
        db.commit()

        resp = client.patch(f"/api/doctor/appointments/{booked.id}/complete",
                            json={"prescription_notes": "x"},
                            headers=auth_header(doctor_token))
        assert resp.status_code == 400

    def test_recompleting_updates_notes_only(self, client, db, doctor_token, booked):
        client.patch(f"/api/doctor/appointments/{booked.id}/complete",
                     json={"prescription_notes": "First notes."},
                     headers=auth_header(doctor_token))

        resp = client.patch(f"/api/doctor/appointments/{booked.id}/complete",
                            json={"prescription_notes": "Revised notes."},
                            headers=auth_header(doctor_token))
        assert resp.status_code == 200

        db.expire_all()
        import models
        appt = db.query(models.Appointment).filter_by(id=booked.id).first()
        assert appt.status == "Completed"
        assert appt.prescription_notes == "Revised notes."

    def test_cannot_complete_another_doctors_appointment(self, client, doctor2_token, booked):
        resp = client.patch(f"/api/doctor/appointments/{booked.id}/complete",
                            json={"prescription_notes": "x"},
                            headers=auth_header(doctor2_token))
        assert resp.status_code == 404


class TestSchedule:
    def test_updates_shift(self, client, db, doctor_token, doctor):
        resp = client.put("/api/doctor/schedule",
                          json={"shift_start": "10:00", "shift_end": "14:00"},
                          headers=auth_header(doctor_token))
        assert resp.status_code == 200

        db.expire_all()
        from models import Doctor
        row = db.query(Doctor).filter_by(id=doctor.id).first()
        assert (row.shift_start, row.shift_end) == ("10:00", "14:00")

    def test_rejects_inverted_shift(self, client, doctor_token):
        resp = client.put("/api/doctor/schedule",
                          json={"shift_start": "18:00", "shift_end": "09:00"},
                          headers=auth_header(doctor_token))
        assert resp.status_code == 422

    def test_rejects_equal_bounds(self, client, doctor_token):
        resp = client.put("/api/doctor/schedule",
                          json={"shift_start": "09:00", "shift_end": "09:00"},
                          headers=auth_header(doctor_token))
        assert resp.status_code == 422


class TestVacationDates:
    def test_blocking_a_date_toggles_it_on(self, client, db, doctor_token, doctor):
        when = future_weekday()
        resp = client.post("/api/doctor/blocked-dates", json={"date": when},
                           headers=auth_header(doctor_token))
        assert resp.status_code == 200
        assert when in resp.json()["blocked_dates"]

    def test_blocking_twice_unblocks(self, client, doctor_token):
        when = future_weekday()
        client.post("/api/doctor/blocked-dates", json={"date": when},
                    headers=auth_header(doctor_token))

        resp = client.post("/api/doctor/blocked-dates", json={"date": when},
                           headers=auth_header(doctor_token))
        assert resp.status_code == 200
        assert when not in resp.json()["blocked_dates"]

    def test_cannot_block_a_past_date(self, client, doctor_token):
        past = (date.today() - timedelta(days=1)).isoformat()
        resp = client.post("/api/doctor/blocked-dates", json={"date": past},
                           headers=auth_header(doctor_token))
        assert resp.status_code == 400

    def test_rejects_malformed_date(self, client, doctor_token):
        resp = client.post("/api/doctor/blocked-dates", json={"date": "31-12-2026"},
                           headers=auth_header(doctor_token))
        assert resp.status_code == 400

    def test_blocked_dates_survive_a_commit(self, client, db, doctor_token, doctor):
        """
        blocked_dates is a JSON column, so an in-place mutation needs
        flag_modified. A missed flag here would silently drop the vacation.
        """
        when = future_weekday()
        client.post("/api/doctor/blocked-dates", json={"date": when},
                    headers=auth_header(doctor_token))

        db.expire_all()
        from models import Doctor
        row = db.query(Doctor).filter_by(id=doctor.id).first()
        assert when in (row.blocked_dates or [])
