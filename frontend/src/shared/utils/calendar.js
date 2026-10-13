/**
 * Client-side .ics calendar export.
 *
 * Used by the booking success screen and by upcoming rows in Appointment
 * History, so it lives here rather than inside either feature.
 *
 * No backend and no dependency: the file is generated in the browser from
 * values already on screen.
 */

/**
 * Build a downloadable calendar entry for a confirmed booking.
 *
 * Slot times are local wall-clock, so they are written as floating local
 * time (no `Z`, no `TZID`) rather than UTC. Converting to UTC would shift
 * the appointment by the device's UTC offset, so a 10:00 AM booking in IST
 * would land at 4:30 AM for anyone syncing the file from another timezone.
 */
export function buildIcs({ doctorName, specialty, address, date, time, durationMinutes = 30 }) {
  if (!date || !time) return null;

  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time).split(':').map(Number);
  if ([y, m, d, hh].some((n) => Number.isNaN(n))) return null;

  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;

  const end = new Date(y, m - 1, d, hh, mm + durationMinutes);
  const endStamp = `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`;

  // iCal requires escaping of backslash, semicolon, comma and newline.
  const esc = (s) => String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');

  const description = [specialty, address].filter(Boolean).join(' — ');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MedAssist//Booking//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:medassist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@medassist`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${stamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${esc(`Appointment with ${doctorName || 'doctor'}`)}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(address || '')}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`Appointment with ${doctorName || 'doctor'} in 1 hour`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Trigger a browser download of the given text content. */
export function downloadTextFile(filename, content, mime) {
  if (!content) return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick — revoking synchronously can cancel the
  // download in some browsers before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Build and download a booking's .ics in one call. */
export function downloadAppointmentIcs(appt) {
  const ics = buildIcs({
    doctorName: appt.doctor_name,
    specialty: appt.specialty,
    address: appt.address,
    date: appt.appointment_date,
    time: appt.slot_time,
  });
  if (!ics) return false;
  const safeDate = (appt.appointment_date || 'unknown').replace(/-/g, '');
  const safeTime = (appt.slot_time || '0000').replace(':', '');
  downloadTextFile(
    `medassist-${safeDate}-${safeTime}.ics`,
    ics,
    'text/calendar;charset=utf-8'
  );
  return true;
}
