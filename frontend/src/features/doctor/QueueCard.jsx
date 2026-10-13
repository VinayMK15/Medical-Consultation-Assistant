import React from 'react';

/**
 * QueueCard — one appointment row in the Patient Queue panel.
 *
 * Identity: "#PT-{patient_id}" uses the patient's real users.id.
 * If patient_id is unavailable, falls back to an honest
 * "Appointment ref #{id}" label rather than mislabeling it.
 * Age/gender render only when both are present for that patient.
 */
export function initials(name) {
  return (
    name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || 'PT'
  );
}

export function StatusBadge({ status }) {
  const styles =
    status === 'Completed'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  return (
    <span className={`inline-flex shrink-0 rounded-full border px-3 py-0.5 text-xs font-bold ${styles}`}>
      {status}
    </span>
  );
}

/** Format appointment_date + slot_time into a readable string. */
export function formatSlot(dateStr, slotTime) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const datePart = d.toLocaleDateString('en-IN', { dateStyle: 'medium' });
  return slotTime ? `${datePart}, ${slotTime}` : datePart;
}

export default function QueueCard({ appt, isSelected, isNew, onClick }) {
  const isCompleted = appt.status === 'Completed';
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        isSelected
          ? 'border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-200'
          : isCompleted
          ? 'border-slate-100 bg-slate-50 opacity-60 hover:opacity-80'
          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isCompleted
                ? 'bg-slate-100 text-slate-600'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {initials(appt.patient_name)}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <span className={`truncate font-bold ${isCompleted ? 'text-slate-600' : 'text-slate-800'}`}>
                {appt.patient_name || 'Unknown Patient'}
              </span>
              {isNew && !isCompleted && (
                <span className="shrink-0 rounded-full bg-blue-600 px-2 py-px text-xs font-extrabold uppercase text-white">
                  New
                </span>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {appt.patient_age != null && appt.patient_gender
                ? `${appt.patient_age} yrs, ${appt.patient_gender} • `
                : ''}
              {formatSlot(appt.appointment_date, appt.slot_time)}
              {/* Was a right-aligned line of its own in text-slate-500. In the
                  narrow queue pane that third line was pure height cost for
                  the least important field on the card, so the ref now trails
                  the meta line inline. */}
              <span className="text-slate-500">
                {' • '}
                {appt.patient_id != null ? `#PT-${appt.patient_id}` : `ref #${appt.id}`}
              </span>
            </p>
          </div>
        </div>
        <StatusBadge status={appt.status} />
      </div>
    </button>
  );
}
