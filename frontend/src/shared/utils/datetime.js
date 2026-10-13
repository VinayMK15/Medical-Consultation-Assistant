/**
 * Appointment date/time formatting, shared so the booking modal, the
 * dashboard, and Appointment History all render a slot the same way.
 *
 * Slots arrive as 24-hour "HH:MM" strings from the API. Showing them raw
 * was inconsistent — the modal used "9:00 AM" while the history page used
 * "09:00" on the same booking.
 */

/** "09:30" → "9:30 AM" */
export function formatTo12h(time24) {
  if (!time24) return '';
  const [h, m] = String(time24).split(':').map(Number);
  if (Number.isNaN(h)) return String(time24);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

/**
 * Today's local date as "YYYY-MM-DD", matching the string format that
 * `appointment_date` uses in the API and database.
 *
 * Do NOT use `new Date().toISOString().split('T')[0]` for this. That reads
 * the UTC date, so in IST (UTC+5:30) between 00:00 and 05:30 local time it
 * returns *yesterday* — the doctor calendar marked the 29th as TODAY on the
 * morning of the 30th, and the dashboard's "today" counters read zero.
 * Both are wrong for 5.5 hours out of every 24, for every user east of UTC.
 */
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Same local-date key, shifted by whole days. `offset` may be negative. */
export function dayKeyOffset(offset, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
  return todayKey(d);
}

/** "YYYY-MM-DD" → "Mon, May 19" */
export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "YYYY-MM-DD" → "Monday, 30 September 2026" */
export function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** "YYYY-MM-DD" → "Oct 3" (compact, for dense list rows) */
export function formatDateCompact(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Date + time, or just the date when no slot time is recorded. */
export function formatDateTime(dateStr, time24) {
  const date = formatDateShort(dateStr);
  if (!date) return 'TBD';
  return time24 ? `${date} at ${formatTo12h(time24)}` : date;
}

/**
 * Which part of the day a 24-hour slot time falls in.
 *
 * Shared because two screens now group slots this way: the patient booking
 * modal and the doctor shift preview. It was defined inline in the modal
 * before, which meant a change to the boundaries would silently apply to
 * only one of them.
 */
export function slotPeriod(time24) {
  if (!time24) return null;
  const h = parseInt(String(time24).split(':')[0], 10);
  if (Number.isNaN(h)) return null;
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/** Slots for a shift window, honouring the doctor's real slot duration. */
export function generateSlots(start, end, intervalMinutes = 30) {
  if (!start || !end || start >= end) return [];
  const step = Number(intervalMinutes) > 0 ? Number(intervalMinutes) : 30;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return [];
  const slots = [];
  let mins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  while (mins < endMins) {
    slots.push(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
    mins += step;
  }
  return slots;
}

/** Whole days from today until `dateStr`; negative when in the past. */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/** A short human label for how soon an appointment is. */
export function relativeDayLabel(dateStr) {
  const diff = daysUntil(dateStr);
  if (diff === null) return null;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0) return null;
  if (diff <= 7) return `In ${diff} days`;
  return null;
}
