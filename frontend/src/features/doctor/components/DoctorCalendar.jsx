import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../../shared/utils/api';
import { todayKey, formatTo12h, generateSlots } from '../../../shared/utils/datetime';
import { CalendarIcon, PalmTreeIcon, ClosedIcon, ClockIcon, UsersIcon } from '../../../shared/components/ui/icons';
import ConfirmDialog from '../../../shared/components/ConfirmDialog';
import { StatusBadge, initials } from '../QueueCard';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build calendar grid cells (with leading null padding) for a year/month. */
function generateCalendarDays(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  const days = [];
  const startPadding = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
  for (let i = 0; i < startPadding; i++) {
    days.push(null);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    // format as YYYY-MM-DD
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, dateStr, dow: new Date(year, month - 1, d).getDay() });
  }

  return days;
}

/** "2026-09-29" → "Tue, Sep 29, 2026". */
function formatLong(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Status presentation (derived states only) ──────────────────────────────

const STATUS_META = {
  available: {
    label: 'Available',
    pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    dot: 'bg-emerald-500',
  },
  full: {
    label: 'Fully Booked',
    pill: 'bg-blue-50 text-blue-700 border border-blue-200',
    dot: 'bg-blue-500',
  },
  leave: {
    label: 'On Leave',
    pill: 'bg-red-50 text-red-700 border border-red-200',
    dot: 'bg-red-400',
  },
  closed: {
    label: 'Closed',
    pill: 'bg-slate-100 text-slate-600 border border-slate-200',
    dot: 'bg-slate-400',
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function DoctorCalendar() {
  const today = new Date();
  // Local, not UTC — see todayKey() in shared/utils/datetime.js.
  const todayStr = todayKey(today);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  // `booked_counts` is part of the calendar-summary payload but is never read:
  // the per-day counts below are derived from `byDate` so the number on a cell
  // and the list in the sidebar can never disagree. It stays in the initial
  // shape only because `setSummary(res.data)` stores the response wholesale.
  const [summary, setSummary] = useState({ booked_counts: {}, blocked_dates: [] });
  const [appointments, setAppointments] = useState([]);
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [slotDuration, setSlotDuration] = useState(30);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [isToggling, setIsToggling] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // Holds the date awaiting confirmation, or null. Set when the doctor tries
  // to mark a day On Leave that already has bookings.
  const [pendingLeaveDate, setPendingLeaveDate] = useState(null);

  // ── Month aggregates (booked counts + blocked dates) ──
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/doctor/calendar-summary', {
        params: { year, month }
      });
      setSummary(res.data);
    } catch {
      // Already surfaced: the error banner below the header renders this.
      setErrorMsg('Failed to load calendar data.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  /**
   * Full appointment list, fetched once for the whole portal rather than per
   * month. The day-detail panel needs patient name, slot time and status,
   * none of which calendar-summary returns — it only sends per-date counts.
   *
   * `limit` is the endpoint's maximum (le=200). A doctor with more than 200
   * appointments in total would have the oldest ones omitted, so the count
   * shown on each cell is derived from this list and could under-report for
   * such a doctor. Flagged rather than silently wrong: with 16 slots/day a
   * single month tops out around 400, so 200 covers a typical quarter.
   */
  useEffect(() => {
    api.get('/api/doctor/appointments', { params: { limit: 200 } })
      .then((res) => {
        const payload = res.data;
        const list = Array.isArray(payload) ? payload : payload?.data;
        setAppointments(Array.isArray(list) ? list : []);
      })
      .catch(() => { /* day cells fall back to zero booked */ });
  }, []);

  // ── Doctor-wide shift window (same source ScheduleManager edits) ──
  useEffect(() => {
    api.get('/api/doctor/profile')
      .then((res) => {
        setShiftStart(res.data.shift_start || '09:00');
        setShiftEnd(res.data.shift_end || '17:00');
        setSlotDuration(res.data.slot_duration_minutes || 30);
      })
      .catch(() => { /* keep defaults; calendar still renders */ });
  }, []);

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleGoToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setSelectedDate(todayStr);
  };

  // ── Existing toggle: POST /api/doctor/blocked-dates ──
  const handleToggleBlocked = async (dateStr) => {
    setIsToggling(true);
    setErrorMsg('');
    try {
      const res = await api.post('/api/doctor/blocked-dates', { date: dateStr });
      // Update local state smoothly from the backend's new list
      setSummary((prev) => ({
        ...prev,
        blocked_dates: res.data.blocked_dates,
      }));
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to update vacation status.');
    } finally {
      setIsToggling(false);
    }
  };

  // ── Derived per-day status ──
  // `slot_duration_minutes` is the doctor's real slot length; the old code
  // hardcoded 30 via a local generateDaySlots copy.
  const totalSlots = generateSlots(shiftStart, shiftEnd, slotDuration).length;
  const blockedSet = new Set(summary.blocked_dates || []);

  /**
   * Appointments bucketed by date, cancelled ones removed. This drives both
   * the per-day booked count and the detail panel, so the number on the cell
   * and the list underneath it can never disagree.
   */
  const byDate = useMemo(() => {
    const map = {};
    for (const a of appointments) {
      if (!a.appointment_date || a.status === 'Cancelled') continue;
      (map[a.appointment_date] ||= []).push(a);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((x, y) => (x.slot_time || '').localeCompare(y.slot_time || ''));
    }
    return map;
  }, [appointments]);

  const getStatus = (dateStr, dow) => {
    const list = byDate[dateStr] || [];
    const booked = list.length;
    if (totalSlots > 0 && booked > 0 && booked >= totalSlots)
      return { key: 'full', booked };
    if (dow === 0) return { key: 'closed', booked }; // Sunday: fixed weekly off
    if (blockedSet.has(dateStr)) return { key: 'leave', booked };
    return { key: 'available', booked, free: totalSlots - booked };
  };

  const days = generateCalendarDays(year, month);
  const realDays = days.filter(Boolean);

  // Summary cards count the cells actually rendered in this month
  const counts = { available: 0, full: 0, leave: 0, closed: 0 };
  let monthBookings = 0;
  realDays.forEach(({ dateStr, dow }) => {
    const s = getStatus(dateStr, dow);
    counts[s.key] += 1;
    monthBookings += s.booked;
  });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  // ── Selected-date sidebar state ──
  const selectedDow = selectedDate ? new Date(selectedDate + 'T00:00:00').getDay() : null;
  const selectedStatus = selectedDate ? getStatus(selectedDate, selectedDow) : null;
  const selectedIsBlocked = selectedDate ? blockedSet.has(selectedDate) : false;
  const selectedIsPast = selectedDate ? selectedDate < todayStr : false;
  const selectedIsSunday = selectedDow === 0;
  const selectedIsFull = selectedStatus?.key === 'full';

  // Appointments on the clicked day, oldest slot first. Cancelled ones were
  // already dropped in `byDate`.
  const dayAppointments = selectedDate ? (byDate[selectedDate] || []) : [];

  // Only Available ↔ On Leave are user-togglable here; Sundays,
  // fully-booked and past days are derived/locked states.
  const toggleLockedReason = !selectedDate
    ? ''
    : selectedIsPast
      ? 'Past dates cannot be changed.'
      : selectedIsSunday
        ? 'Sundays are always closed (weekly off).'
        : selectedIsFull
          ? 'Fully booked days cannot be changed here.'
          : '';
  const canSetAvailable = !toggleLockedReason && selectedIsBlocked && !isToggling;
  // Marking a day On Leave does NOT cancel the appointments already on it —
  // the backend just appends to `blocked_dates`, and the patient keeps a slot
  // that nobody else can book over. ScheduleManager has a full stranded-
  // booking guard for the same hazard on its shift-window save; this is that
  // equivalent for the calendar. Unblocking (the reverse direction) carries no
  // such risk and stays a single unguarded click.
  const leaveWouldStrand = !selectedIsBlocked && dayAppointments.length > 0;
  const canSetOnLeave =
    !toggleLockedReason && !selectedIsBlocked && !isToggling && !leaveWouldStrand;

  /** Click handler for "Set On Leave": either toggle directly, or ask first. */
  const handleSetOnLeave = () => {
    if (leaveWouldStrand) {
      setPendingLeaveDate(selectedDate);
      return;
    }
    handleToggleBlocked(selectedDate);
  };

  const upcomingLeaves = (summary.blocked_dates || [])
    .filter((d) => d >= todayStr)
    .sort();

  // The first card leads with the month's booking volume, since that is the
  // number a doctor opens this page to check. The other three are a complete,
  // non-overlapping partition of the days that are NOT freely bookable:
  // fully-booked + on-leave + closed + open = days in the month.
  //
  // "Open Days" used to hold the fourth slot. Two reasons it went: it was
  // `days - Sundays - leaves - full`, so in a month with no leave it was
  // near-constant at "27 of 31" and carried no information; and `counts.full`
  // was computed and then never rendered, so the day a date filled up simply
  // vanished from "Open Days" with nothing on screen explaining where to.
  const summaryCards = [
    { key: 'bookings', Icon: CalendarIcon, title: 'Bookings This Month', sub: plural(monthBookings, 'appointment'), tone: 'text-blue-600' },
    { key: 'full', Icon: UsersIcon, title: 'Fully Booked', sub: plural(counts.full, 'day'), tone: 'text-emerald-700' },
    { key: 'leave', Icon: PalmTreeIcon, title: 'On Leave / Vacation', sub: plural(counts.leave, 'day'), tone: 'text-red-600' },
    { key: 'closed', Icon: ClosedIcon, title: 'Clinic Closed / Off', sub: plural(counts.closed, 'day'), tone: 'text-slate-500' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      {/* ── Step 1: Header ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Doctor Schedule &amp; Leave Calendar</h2>
            <p className="text-sm text-slate-600">Manage your consultation availability, booked appointments, and scheduled leaves</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGoToday}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 inline-flex items-center min-h-11">
            Today
          </button>
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span aria-hidden="true">&lt;</span>
          </button>
          <span className="min-w-[130px] text-center text-sm font-bold text-slate-800">{monthName} {year}</span>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span aria-hidden="true">&gt;</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {errorMsg}
        </div>
      )}

      {/* ── Step 2: Four summary cards (count rendered cells) ──
          White like every other card on this page. These were the only four
          with tinted fills; the colour moved onto the icon, where it reads as
          a category marker rather than a status band. */}
      <div className="mt-4 grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {summaryCards.map((card) => {
          // Destructured inside the body rather than in the parameter list on
          // purpose: this file's eslint config sets `varsIgnorePattern` but not
          // `argsIgnorePattern`, and has no react plugin, so an uppercase
          // component destructured as a *parameter* reads as an unused var.
          const { key, Icon, title, sub, tone } = card;
          return (
            <div key={key} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <Icon className={`h-5 w-5 shrink-0 ${tone}`} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{title}</p>
                <p className="truncate text-xs font-semibold text-slate-600">{sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* `minmax(0,1fr)` rather than `1fr`. A bare `1fr` track floors at its
            min-content width, and the calendar's min-content is seven cells
            side by side — so it refused to shrink, overflowed the column and
            squeezed its own rows into a tall narrow strip. `minmax(0,...)`
            lets this column, and only this column, absorb the space. */}
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── Step 3: Calendar grid ──
            `role="grid"` with a labelled row and column headers. Every day
            button already carries a full date in its aria-label, so the header
            row is aria-hidden: repeating it would just make a screen reader
            announce "Sun" 31 times without adding meaning. */}
        <div className="flex min-h-0 min-w-0 flex-col">
          {/* `grid-rows-[auto]` pins the weekday header to its content height;
              `auto-rows-fr` then splits only the *implicit* rows after it, so
              the six week-rows divide the leftover space equally. Without the
              explicit first row the header would itself take a 1fr share and
              steal a seventh of the calendar's height. `overflow-hidden` keeps
              the cells' 60px floor from ever propagating up into page scroll. */}
          <div
            role="grid"
            aria-label="Appointment calendar"
            className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 grid-rows-[auto] gap-2 overflow-hidden"
          >
            <div role="row" aria-hidden="true" className="col-span-7 grid grid-cols-7 gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
              <div
                key={d}
                className={`pb-1 text-center text-sm font-bold uppercase tracking-wide ${i === 0 ? 'text-red-600' : i === 6 ? 'text-emerald-700' : 'text-slate-600'}`}
              >
                {d}
              </div>
            ))}
            </div>

            {loading ? (
              <div className="col-span-7 flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
              </div>
            ) : (
              days.map((dayObj, i) => {
                if (!dayObj) {
                  // A bare zero-height cell collapsed the row and left the
                  // month's shape unreadable; a faint dashed placeholder keeps
                  // the leading/trailing gaps legible.
                  return (
                    <div
                      role="gridcell"
                      key={`empty-${i}`}
                      className="min-h-[60px] rounded-xl border border-dashed border-slate-100 bg-slate-50/30"
                    />
                  );
                }
                const { day, dateStr, dow } = dayObj;
                const status = getStatus(dateStr, dow);
                const meta = STATUS_META[status.key];
                const isSelected = selectedDate === dateStr;
                const isToday = dateStr === todayStr;
                const isPast = dateStr < todayStr;

                // Booked count, not remaining capacity. "Available / 16
                // slots" repeated on 26 near-identical days carried no
                // information; the number a doctor actually scans a calendar
                // for is how many patients are coming.
                const hasBookings = status.booked > 0;

                // Past days read as history through three separate signals so
                // the distinction survives colour-blindness and greyscale
                // printing: a dashed border, a noticeably darker fill, and a
                // muted day number. Today is excluded — it is the boundary,
                // not history.
                const past = isPast && !isToday;
                const pill = past
                  ? 'bg-slate-200 text-slate-600'
                  : meta.pill;

                return (
                  <button
                    type="button"
                    role="gridcell"
                    aria-pressed={isSelected}
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    aria-label={`${formatLong(dateStr)} — ${past ? 'past, ' : ''}${status.booked} booked${status.key === 'leave' ? ', on leave' : ''}`}
                    className={`flex min-h-[60px] flex-col overflow-hidden rounded-xl border p-1.5 text-left transition focus:outline-none sm:p-2 ${
                      isSelected
                        ? 'border-blue-700 ring-2 ring-blue-600'
                        : past
                          ? 'border-dashed border-slate-300 bg-slate-100/70'
                          : 'border-slate-200 bg-white hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`min-w-0 truncate text-sm font-bold ${
                          past ? 'text-slate-400' : dow === 0 ? 'text-slate-600' : 'text-slate-800'
                        }`}
                      >
                        {day}
                      </span>
                      {isToday && (
                        <span className="shrink-0 rounded-full bg-blue-600 px-1.5 py-px text-[10px] font-extrabold uppercase leading-tight text-white">
                          Today
                        </span>
                      )}
                    </div>
                    {/* One line, always. This was a two-line stack (number over
                        the word "booked") whose content ran to 84px against a
                        52px cell floor, so `auto-rows-fr` shrank the row and the
                        badge spilled straight out through the cell border —
                        a count floating between two dates. Budgeted to fit:
                        day row 20 + gap 2 + pill 20 + sm padding 16 = 58px,
                        inside the 60px floor with 2px slack. */}
                    <div className="mt-auto pt-0.5">
                      {hasBookings ? (
                        <span
                          className={`block truncate rounded-md px-1 py-0.5 text-center text-xs font-bold leading-tight ${pill}`}
                        >
                          {status.booked} booked
                        </span>
                      ) : past ? (
                        // "Open" on a day that has already gone reads as
                        // bookable. An unbooked past day is not actionable, so
                        // it shows nothing — but a past day WITH bookings
                        // keeps its count, because that is real history.
                        <span className={`block rounded-md px-1 py-0.5 text-center text-xs font-bold leading-tight ${pill}`}>
                          &mdash;
                        </span>
                      ) : (
                        // No bookings: the state itself is the message, so a
                        // leave or closure day still reads differently.
                        <span className={`block truncate rounded-md px-1 py-0.5 text-center text-xs font-bold leading-tight ${pill}`}>
                          {status.key === 'leave'
                            ? 'On Leave'
                            : status.key === 'closed'
                              ? 'Closed'
                              : 'Open'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
            <p>Select a day to see who is booked, or to toggle its leave status.</p>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-dashed border-slate-300 bg-slate-100/70" />
              Past
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-slate-200 bg-white" />
              Today &amp; upcoming
            </span>
          </div>
        </div>

        {/* ── Step 4: Right sidebar ──
            Four stacked cards in a 300px column. Given its own scroll region so
            a long list of appointments cannot push the page into scrolling. */}
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">
          {/* Booked appointments on the selected day. This is the payoff for
              clicking a date: the count on the cell expands into the actual
              patients, so the doctor can confirm a booking without leaving
              the calendar. */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">
                Appointments
              </p>
              {selectedDate && dayAppointments.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                  {dayAppointments.length}
                </span>
              )}
            </div>

            {!selectedDate ? (
              <p className="mt-2 text-xs text-slate-500">Select a date to see its bookings.</p>
            ) : dayAppointments.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                {selectedStatus?.key === 'closed'
                  ? 'Clinic closed — no bookings.'
                  : selectedStatus?.key === 'leave'
                    ? 'On leave — no bookings.'
                    : 'No bookings on this day.'}
              </p>
            ) : (
              <ul className="mt-2.5 space-y-2">
                {dayAppointments.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-slate-200 bg-white p-2.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                        {initials(a.patient_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {a.patient_name || 'Unknown Patient'}
                          </p>
                          <StatusBadge status={a.status} />
                        </div>
                        <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                          <ClockIcon className="h-3 w-3 shrink-0" />
                          <span className="tabular-nums">{formatTo12h(a.slot_time)}</span>
                          {a.patient_age != null && a.patient_gender && (
                            <span className="text-slate-500">
                              · {a.patient_age} yrs, {a.patient_gender}
                            </span>
                          )}
                        </p>
                        {a.symptoms_summary && (
                          <p className="mt-1 line-clamp-2 text-sm leading-4 text-slate-600">
                            {a.symptoms_summary}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {dayAppointments.length > 0 && (
              <p className="mt-3 border-t border-slate-100 pt-2 text-sm text-slate-600">
                Open and complete consultations from the Appointments tab.
              </p>
            )}
          </div>

          {/* Selected date + quick update */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-slate-600">Selected Date</p>
            {selectedDate ? (
              <>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-950">{formatLong(selectedDate)}</h3>
                  {/* The dot, not a glyph. This previously hard-coded a
                      checkmark path for every status, so a closed day and a
                      leave day both rendered a green tick next to their own
                      label. `STATUS_META[key].dot` is already defined per
                      status and cannot drift. */}
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_META[selectedStatus.key].pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[selectedStatus.key].dot}`} />
                    {selectedStatus.key === 'full'
                      ? 'Fully Booked'
                      : STATUS_META[selectedStatus.key].label}
                  </span>
                </div>

                <p className="mt-3 text-xs font-semibold text-slate-600">Quick Update Status:</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => handleToggleBlocked(selectedDate)}
                    disabled={!canSetAvailable}
                    title={toggleLockedReason || (selectedIsBlocked ? '' : 'Date is already available')}
                    className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${
                      canSetAvailable
                        ? 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700'
                        : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-500'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {isToggling && selectedIsBlocked ? 'Updating…' : 'Set Available'}
                    </span>
                  </button>
                  <button
                    onClick={handleSetOnLeave}
                    disabled={!canSetOnLeave}
                    title={
                      toggleLockedReason
                      || (selectedIsBlocked ? 'Date is already on leave'
                        : leaveWouldStrand ? 'This day has existing bookings — confirm to continue'
                          : '')
                    }
                    className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${
                      canSetOnLeave
                        ? 'border-slate-200 bg-white text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700'
                        : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-500'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <PalmTreeIcon className="h-3.5 w-3.5" />
                      {isToggling && !selectedIsBlocked ? 'Updating…' : 'Set On Leave'}
                    </span>
                  </button>
                </div>
                {toggleLockedReason && (
                  <p className="mt-2 text-xs font-medium text-amber-700">{toggleLockedReason}</p>
                )}
                {leaveWouldStrand && (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    {dayAppointments.length} {dayAppointments.length === 1 ? 'patient is' : 'patients are'} already
                    booked this day — you'll be asked to confirm before marking it On Leave.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Select a date on the calendar to inspect it.</p>
            )}
          </div>

          {/* Upcoming leaves (blocked_dates only, no notes) */}
          <div className="rounded-xl border border-red-100 bg-red-50/50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.14em] text-red-600">
              <PalmTreeIcon className="h-3.5 w-3.5" />
              Upcoming Doctor Leaves
            </p>
            <div className="mt-2 space-y-2">
              {upcomingLeaves.length === 0 ? (
                <p className="text-xs text-slate-500">No upcoming leaves scheduled.</p>
              ) : (
                upcomingLeaves.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    className="block w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-left transition hover:border-red-300"
                  >
                    <p className="text-xs font-bold text-slate-800">{formatLong(d)}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* The "Weekly Consultation Hours" card that used to live here was
              removed. It was a static, non-actionable readout of
              `shift_start`/`shift_end` — editable only on the Shift Hours tab
              — and it restated the Sunday rule that already appears on every
              Sunday cell, in the "Clinic Closed / Off" summary card, and in
              the Selected Date panel above. It was also mislabelled: there is
              no per-weekday schedule in the data model, just one window
              applied to every non-Sunday day. */}
        </div>
      </div>

      {/* Guard for marking a booked day On Leave. See `leaveWouldStrand`. */}
      <ConfirmDialog
        isOpen={pendingLeaveDate !== null}
        onClose={() => setPendingLeaveDate(null)}
        onConfirm={() => handleToggleBlocked(pendingLeaveDate)}
        title="Patients are booked on this day"
        body={
          pendingLeaveDate
            ? `${(byDate[pendingLeaveDate] || []).length} ${
                (byDate[pendingLeaveDate] || []).length === 1 ? 'patient has' : 'patients have'
              } an appointment on ${formatLong(pendingLeaveDate)}. Marking it On Leave will not cancel them — they keep their slot, but no new patients can book into the day.`
            : ''
        }
        confirmLabel="Mark On Leave"
        cancelLabel="Keep Available"
        tone="danger"
      />
    </div>
  );
}
