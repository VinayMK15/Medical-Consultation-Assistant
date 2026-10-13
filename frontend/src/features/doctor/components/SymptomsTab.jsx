import React from 'react';
import { ClipboardListIcon } from '../../../shared/components/ui/icons';

/**
 * Symptoms tab — patient-entered data plus the recommended workup.
 *
 * The "AI Pre-Consultation Triage Reference" panel and "Common Differential
 * Considerations" were removed. The triage string was not a separate source:
 * it concatenated `symptoms_summary` with the first three workup items — the
 * exact contents of the two panels below — then labelled the result "AI
 * Pre-Consultation" a second time. Both panels are now the only content, so
 * `triageReference` is no longer a prop.
 */
export default function SymptomsTab({ appt, reference, specialization }) {
  const workup = reference?.workup;

  return (
    <div className="space-y-4">
      {/* Patient-Reported Symptoms Summary — what the patient actually typed */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
          <ClipboardListIcon className="h-4 w-4 text-blue-600" />
          Patient-Reported Symptoms Summary
        </p>
        <p className="leading-7 text-sm text-slate-700 bg-slate-50 rounded-xl p-4 border border-slate-100">
          {appt?.symptoms_summary || 'No symptoms reported.'}
        </p>
      </div>

      {workup?.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
            <svg className="h-3.5 w-3.5 shrink-0 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Recommended Workup
          </p>
          <ul className="mt-3 space-y-2">
            {workup.map((w) => (
              <li key={w} className="flex items-start gap-2 text-sm text-slate-600">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {w}
              </li>
            ))}
          </ul>
          {/* Kept: this is AI-derived reference content, not a diagnosis. */}
          <p className="mt-4 border-t border-slate-100 pt-2 text-xs italic text-slate-500">
            General reference for {specialization || 'general practice'} — not a diagnosis
          </p>
        </div>
      ) : (
        /* Explicit empty state. Previously `{reference && ...}` made the whole
           block vanish, leaving the tab as one lonely panel. */
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center">
          <p className="text-sm font-medium text-slate-500">
            No recommended workup available for this specialisation.
          </p>
        </div>
      )}
    </div>
  );
}