import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../../shared/utils/api';
import { formatTo12h, generateSlots, slotPeriod, todayKey } from '../../../shared/utils/datetime';
import { SlotPeriodIcon } from '../../../shared/components/ui/icons';

const PERIODS = [
  { key: 'morning', label: 'Morning', tone: 'text-amber-700' },
  { key: 'afternoon', label: 'Afternoon', tone: 'text-blue-600' },
  { key: 'evening', label: 'Evening', tone: 'text-indigo-600' },
];

/**
 * Shift Hours — the doctor's bookable window.
 *
 * Two things this page deliberately does that it did not before:
 *
 * 1. It reads the doctor's real `slot_duration_minutes` (a per-doctor column
 *    the availability endpoint already honours) instead of assuming 30. All
 *    36 seeded doctors are 30 today, so the old hardcode looked correct, but
 *    a doctor set to 15 or 45 would have been shown a preview of slots that
 *    did not match what patients could actually book.
 *
 * 2. It refuses to save a window that would strand an existing booking.
 *    `PUT /api/doctor/schedule` only checks that start < end; it has never
 *    looked at appointments. Shortening the shift past an already-booked slot
 *    leaves that appointment outside every generatable slot with no warning
 *    anywhere. The affected appointments are listed and the save stays
 *    disabled until the doctor explicitly acknowledges.
 */

export default function ScheduleManager() {
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [slotDuration, setSlotDuration] = useState(30);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [orphanAck, setOrphanAck] = useState(false);

  // ── Load schedule + existing bookings ──
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, apptRes] = await Promise.allSettled([
          api.get('/api/doctor/profile'),
          api.get('/api/doctor/appointments', { params: { limit: 200 } }),
        ]);

        if (cancelled) return;

        if (profileRes.status === 'fulfilled') {
          setShiftStart(profileRes.value.data.shift_start || '09:00');
          setShiftEnd(profileRes.value.data.shift_end || '17:00');
          setSlotDuration(profileRes.value.data.slot_duration_minutes || 30);
        } else {
          const status = profileRes.reason?.response?.status;
          // 401/403 happen during hot-reload and route transitions while the
          // auth token settles. The dashboard gate handles real access denial.
          if (status !== 401 && status !== 403) {
            setErrorMsg(profileRes.reason?.response?.data?.detail || 'Failed to load schedule.');
          }
        }

        if (apptRes.status === 'fulfilled') {
          // The endpoint returns a paginated envelope
          // `{ data, total, skip, limit }`, not a bare array. Reading
          // `res.data` directly yields the envelope, so the guard silently
          // saw zero appointments and never fired.
          const payload = apptRes.value.data;
          const list = Array.isArray(payload) ? payload : payload?.data;
          setAppointments(Array.isArray(list) ? list : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  // ── Auto-dismiss success message ──
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  const windowInvalid = !shiftStart || !shiftEnd || shiftStart >= shiftEnd;

  const previewSlots = useMemo(
    () => generateSlots(shiftStart, shiftEnd, slotDuration),
    [shiftStart, shiftEnd, slotDuration]
  );

  /**
   * Bookings that the *pending* window would strand. Only future, non-cancelled
   * appointments matter — a past consultation outside today's window is not a
   * problem. Slot times are compared as strings because both sides are
   * zero-padded "HH:MM" from the same generator.
   */
  const stranded = useMemo(() => {
    if (windowInvalid) return [];
    const today = todayKey();
    return appointments.filter((a) => {
      if (a.status === 'Cancelled') return false;
      if (!a.appointment_date || a.appointment_date < today) return false;
      if (!a.slot_time) return false;
      return a.slot_time < shiftStart || a.slot_time >= shiftEnd;
    });
  }, [appointments, shiftStart, shiftEnd, windowInvalid]);

  // Any edit invalidates a previous acknowledgement.
  const setWindow = (setter) => (value) => {
    setter(value);
    setSuccessMsg('');
    setOrphanAck(false);
  };

  const handleSave = useCallback(async () => {
    if (windowInvalid || (stranded.length > 0 && !orphanAck)) return;

    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.put('/api/doctor/schedule', {
        shift_start: shiftStart,
        shift_end: shiftEnd,
      });
      setSuccessMsg(res.data.message || 'Schedule updated successfully.');
      setOrphanAck(false);
    } catch (err) {
      const detail = err.response?.data?.detail;
      // Pydantic validation errors arrive as an array of objects.
      setErrorMsg(
        Array.isArray(detail)
          ? detail.map((d) => d.msg).join('. ')
          : detail || 'Failed to update schedule.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [shiftStart, shiftEnd, windowInvalid, stranded.length, orphanAck]);

  const totalHours = useMemo(() => {
    if (windowInvalid) return 0;
    const [sh, sm] = shiftStart.split(':').map(Number);
    const [eh, em] = shiftEnd.split(':').map(Number);
    return (((eh * 60 + em) - (sh * 60 + sm)) / 60).toFixed(1);
  }, [shiftStart, shiftEnd, windowInvalid]);

  const grouped = useMemo(() => {
    const out = {};
    for (const p of PERIODS) out[p.key] = [];
    previewSlots.forEach((s) => {
      const period = slotPeriod(s);
      if (out[period]) out[period].push(s);
    });
    return out;
  }, [previewSlots]);

  if (loading) {
    return (
      // Bounded like the main branch below. Leaving one root unbounded and one
      // bounded is the kind of asymmetry that silently breaks later. `h-64`
      // replaced by `flex-1` so it centres in the tab rather than in a fixed
      // box that could exceed a short window.
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-contain">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm font-semibold text-slate-500">Loading schedule…</p>
        </div>
      </div>
    );
  }

  return (
    // The tab wrapper is a bounded flex column, so this root is the flex child
    // that scrolls. `min-h-0` at every level is what lets the column shrink.
    // `overscroll-contain` stops a trackpad hitting the end of the list and
    // then tugging the page behind it.
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain">
      {/* ── Banners ── */}
      {successMsg && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {errorMsg}
        </div>
      )}

      <div className="space-y-6">
        {/* ── Shift window ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
              Shift Window
            </p>
          </div>

          <div className="p-6">
            {/* Capped rather than full-bleed: a time input stretched across
                1500px is mostly empty box. The cards themselves stay
                full-width so the slot preview can use the space. */}
            <div className="grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="schedule-shift-start"
                  className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-600"
                >
                  Shift Start
                </label>
                <input
                  id="schedule-shift-start"
                  type="time"
                  value={shiftStart}
                  onChange={(e) => setWindow(setShiftStart)(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="schedule-shift-end"
                  className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-600"
                >
                  Shift End
                </label>
                <input
                  id="schedule-shift-end"
                  type="time"
                  value={shiftEnd}
                  onChange={(e) => setWindow(setShiftEnd)(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>
            {/* The 12-hour echo under each input used to sit here. The native
                time control already renders "08:30 AM", so the line below it
                just repeated the same fact with a different leading zero. */}

            {windowInvalid ? (
              <p
                role="alert"
                className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                Shift start must be earlier than shift end.
              </p>
            ) : (
              <div className="mt-5 flex flex-wrap gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                  {previewSlots.length} slots
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  {totalHours} hrs
                </span>
                {/* Reflects the doctor's real slot_duration_minutes rather
                    than a hardcoded 30. */}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.985 14.652H-.007l4.992 4.992M20.015 9.348a8.25 8.25 0 00-13.803-3.7M3.985 14.652a8.25 8.25 0 0013.803 3.7" />
                  </svg>
                  {slotDuration}-min slots
                </span>
              </div>
            )}

            {/* ── Stranded-booking guard ── */}
            {stranded.length > 0 && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50/70 p-4">
                <div className="flex items-start gap-2.5">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-red-900">
                      {stranded.length} existing {stranded.length === 1 ? 'booking falls' : 'bookings fall'} outside this window
                    </p>
                    <p className="mt-1 text-xs leading-5 text-red-800">
                      These patients already hold a slot that the new hours would no
                      longer offer. Their appointments stay in the system, but nobody
                      else could book into the gap, and the slot disappears from your
                      bookable list. Widen the window, or cancel those appointments
                      from the Appointments tab first.
                    </p>

                    <ul className="mt-3 space-y-1.5">
                      {stranded.slice(0, 6).map((a) => (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs"
                        >
                          <span className="font-bold text-slate-900">
                            {a.patient_name || 'Unknown Patient'}
                          </span>
                          <span className="tabular-nums font-semibold text-red-700">
                            {a.appointment_date} · {formatTo12h(a.slot_time)}
                          </span>
                        </li>
                      ))}
                      {stranded.length > 6 && (
                        <li className="px-3 text-xs font-semibold text-red-700">
                          +{stranded.length - 6} more
                        </li>
                      )}
                    </ul>

                    <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs font-semibold text-red-900">
                      <input
                        type="checkbox"
                        checked={orphanAck}
                        onChange={(e) => setOrphanAck(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-red-300 text-red-600 focus:ring-2 focus:ring-red-500/30"
                      />
                      <span>
                        I understand these bookings will sit outside my bookable
                        hours, and I want to save anyway.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || windowInvalid || (stranded.length > 0 && !orphanAck)}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving…
                  </span>
                ) : (
                  'Save Schedule'
                )}
              </button>

              {(shiftStart !== undefined) && !windowInvalid && stranded.length === 0 && (
                <p className="text-xs text-slate-500">
                  Patients can book any of the {previewSlots.length} slots below.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Slot preview, grouped by period ──
            Sixteen undifferentiated pills gave the eye nothing to land on.
            Grouping matches the patient booking modal, so a doctor and a
            patient describe the same day in the same three buckets. */}
        {previewSlots.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
                Slot Preview
              </p>
              <p className="mt-1 text-xs text-slate-600">
                The bookable times patients will see for this window.
              </p>
            </div>

            <div className="space-y-5 p-6">
              {PERIODS.map((p) => {
                const slots = grouped[p.key];
                if (!slots || slots.length === 0) return null;
                return (
                  <div key={p.key} className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
                    <div className="flex shrink-0 items-center gap-1.5 sm:w-28 sm:pt-1">
                      <span className={p.tone}>
                        <SlotPeriodIcon period={p.key} />
                      </span>
                      <span className={`text-xs font-bold ${p.tone}`}>{p.label}</span>
                      <span className="text-xs font-semibold text-slate-500">
                        {slots.length}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-wrap gap-1.5">
                      {slots.map((slot) => (
                        <span
                          key={slot}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700"
                        >
                          {formatTo12h(slot)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
