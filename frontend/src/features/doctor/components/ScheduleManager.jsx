import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../shared/utils/api';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate 30-minute slot strings between start and end (exclusive). */
function generatePreviewSlots(start, end) {
  if (!start || !end || start >= end) return [];
  const slots = [];
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  while (mins < endMins) {
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
    mins += 30;
  }
  return slots;
}

/** Format "HH:MM" 24h → "9:00 AM" style for display. */
function formatTo12h(time24) {
  const [h, m] = time24.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ScheduleManager() {
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Fetch current schedule on mount ──
  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await api.get('/api/doctor/profile');
        setShiftStart(res.data.shift_start || '09:00');
        setShiftEnd(res.data.shift_end || '17:00');
      } catch (err) {
        // Silently ignore 401/403 — these happen during hot-reload or route
        // transitions when the auth token hasn't settled yet. The doctor
        // dashboard gate will handle actual access denial.
        const status = err.response?.status;
        if (status !== 401 && status !== 403) {
          setErrorMsg(err.response?.data?.detail || 'Failed to load schedule.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  // ── Auto-dismiss success message ──
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // ── Save handler ──
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (shiftStart >= shiftEnd) {
      setErrorMsg('Shift start must be before shift end.');
      setIsSaving(false);
      return;
    }

    try {
      const res = await api.put('/api/doctor/schedule', {
        shift_start: shiftStart,
        shift_end: shiftEnd,
      });
      setSuccessMsg(res.data.message || 'Schedule updated successfully!');
    } catch (err) {
      const detail = err.response?.data?.detail;
      // Pydantic validation errors come as an array
      if (Array.isArray(detail)) {
        setErrorMsg(detail.map((d) => d.msg).join('. '));
      } else {
        setErrorMsg(detail || 'Failed to update schedule.');
      }
    } finally {
      setIsSaving(false);
    }
  }, [shiftStart, shiftEnd]);

  const previewSlots = generatePreviewSlots(shiftStart, shiftEnd);
  const totalHours =
    shiftStart && shiftEnd && shiftStart < shiftEnd
      ? (() => {
          const [sh, sm] = shiftStart.split(':').map(Number);
          const [eh, em] = shiftEnd.split(':').map(Number);
          return ((eh * 60 + em - (sh * 60 + sm)) / 60).toFixed(1);
        })()
      : 0;

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-sm font-semibold text-slate-400">Loading schedule…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-lg">
          🕐
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-950">My Schedule</h2>
          <p className="text-xs text-slate-400">Configure your daily availability window</p>
        </div>
      </div>

      {/* ── Banners ── */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700 animate-[fadeIn_0.3s_ease-out]">
          <span className="text-base">✅</span>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 animate-[fadeIn_0.3s_ease-out]">
          <span className="text-base">⚠️</span>
          {errorMsg}
        </div>
      )}

      {/* ── Time Picker Card ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            Shift Window
          </p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Shift Start */}
            <div>
              <label
                htmlFor="schedule-shift-start"
                className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                Shift Start
              </label>
              <input
                id="schedule-shift-start"
                type="time"
                value={shiftStart}
                onChange={(e) => {
                  setShiftStart(e.target.value);
                  setSuccessMsg('');
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                {shiftStart ? formatTo12h(shiftStart) : '—'}
              </p>
            </div>

            {/* Shift End */}
            <div>
              <label
                htmlFor="schedule-shift-end"
                className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                Shift End
              </label>
              <input
                id="schedule-shift-end"
                type="time"
                value={shiftEnd}
                onChange={(e) => {
                  setShiftEnd(e.target.value);
                  setSuccessMsg('');
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                {shiftEnd ? formatTo12h(shiftEnd) : '—'}
              </p>
            </div>
          </div>

          {/* Quick-Stats Row */}
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
              <span className="text-sm">📊</span>
              {previewSlots.length} slots
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
              <span className="text-sm">⏱️</span>
              {totalHours} hrs
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
              <span className="text-sm">🔄</span>
              30-min intervals
            </span>
          </div>

          {/* Save Button */}
          <div className="mt-6 flex items-center gap-4">
            <button
              id="save-schedule-btn"
              onClick={handleSave}
              disabled={isSaving || shiftStart >= shiftEnd}
              className="rounded-xl bg-indigo-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
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
            {shiftStart >= shiftEnd && (
              <p className="text-xs font-medium text-amber-600">
                ⚠ Start time must be before end time
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Slot Preview Card ── */}
      {previewSlots.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
              Slot Preview
            </p>
            <p className="mt-1 text-xs text-slate-400">
              These are the bookable appointment times patients will see
            </p>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-2">
              {previewSlots.map((slot) => (
                <span
                  key={slot}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {formatTo12h(slot)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
