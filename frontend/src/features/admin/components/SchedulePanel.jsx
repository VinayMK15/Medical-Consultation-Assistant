import React from 'react';
import { Button, DetailCard, ErrorBanner, InfoField, Notice, SectionLabel } from './AdminUI';
import { formatTo12h, generateSlots } from '../../../shared/utils/datetime';

/**
 * Working-hours panel for a doctor.
 *
 * Read-only by default; an admin can open "Edit hours" to override a doctor's
 * shift window or slot length, which the booking flow reads directly.
 *
 * Vacation days are deliberately absent. Those belong to the doctor, who sets
 * them from their own dashboard — an admin overriding a doctor's leave would
 * put a decision that belongs to the clinician in the wrong hands.
 */

const SLOT_OPTIONS = [15, 20, 30, 45, 60];

function shiftHoursLabel(start, end) {
  if (!start || !end) return 'Not set';
  return `${formatTo12h(start)} – ${formatTo12h(end)}`;
}

export default function SchedulePanel({
  schedule,
  loading = false,
  error = '',
  saving = false,
  onSave,
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState({ shift_start: '09:00', shift_end: '17:00', slot_duration_minutes: 30 });
  const [localError, setLocalError] = React.useState('');

  const start = schedule?.shift_start || '09:00';
  const end = schedule?.shift_end || '17:00';
  const slotMinutes = schedule?.slot_duration_minutes || 30;
  const today = schedule?.today || { total: 0, booked: 0, cancelled: 0 };

  const openEditor = () => {
    setDraft({ shift_start: start, shift_end: end, slot_duration_minutes: slotMinutes });
    setLocalError('');
    setEditing(true);
  };

  const submit = async () => {
    if (draft.shift_start >= draft.shift_end) {
      setLocalError('End time must be later than start time.');
      return;
    }
    const ok = await onSave?.(draft);
    if (ok !== false) {
      setEditing(false);
      setLocalError('');
    }
  };

  // A representative day of slots, so the appointment length is concrete
  // rather than a bare number in a form field.
  const previewSlots = generateSlots(start, end, slotMinutes);

  return (
    <DetailCard
      title="Working Hours"
      subtitle={schedule?.is_vacation_today ? 'On vacation today' : 'Consultation hours this week'}
      icon="clock"
      actions={
        editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" variant="dark" icon="check" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon="edit" onClick={openEditor}>Edit hours</Button>
        )
      }
    >
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {localError && <div className="mb-4"><ErrorBanner message={localError} /></div>}

      {schedule?.is_vacation_today && (
        <div className="mb-4">
          <Notice tone="amber" title="On vacation today">
            The doctor has marked today as a day off, so no new bookings can be made. Vacation days are set by the doctor from their own dashboard.
          </Notice>
        </div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-9 rounded bg-slate-100" />
          ))}
        </div>
      ) : editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Starts at</label>
              <input
                type="time"
                value={draft.shift_start}
                onChange={e => setDraft({ ...draft, shift_start: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Ends at</label>
              <input
                type="time"
                value={draft.shift_end}
                onChange={e => setDraft({ ...draft, shift_end: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Slot length</label>
            <div className="flex flex-wrap gap-2">
              {SLOT_OPTIONS.map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDraft({ ...draft, slot_duration_minutes: mins })}
                  className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                    draft.slot_duration_minutes === mins
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>
          </div>
          <Notice tone="info">
            These hours apply to every working day. Individual days off are set under Vacation Days.
          </Notice>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <InfoField label="Consultation hours" value={shiftHoursLabel(start, end)} icon="clock" />
            <InfoField label="Slot length" value={`${slotMinutes} minutes`} icon="calendar" />
            <InfoField label="Slots per day" value={`${previewSlots.length} bookable`} icon="clock" />
            <InfoField
              label="Booked today"
              value={today.total ? `${today.booked} of ${today.total} appointments` : 'No appointments today'}
              icon="calendar"
            />
          </div>

          {previewSlots.length > 0 && (
            <div>
              <SectionLabel>Sample Day Slots</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {previewSlots.slice(0, 12).map(slot => (
                  <span key={slot} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold tabular-nums text-slate-600">
                    {formatTo12h(slot)}
                  </span>
                ))}
                {previewSlots.length > 12 && (
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                    +{previewSlots.length - 12} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </DetailCard>
  );
}
