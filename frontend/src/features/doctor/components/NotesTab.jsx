import React from 'react';

/**
 * Doctor's advice, free text.
 *
 * The six "clinical snippet" chips that used to sit under the field are gone.
 * They were cardiology-specific sentences insertable into *any* patient's
 * record, and each button truncated the text to 55 characters — so a doctor
 * could not read what they were about to insert. One click of an unreadable
 * canned sentence is unverified clinical text in a medical record.
 */
export default function NotesTab({ advice, onChange, readOnly = false }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <label
        htmlFor="doctor-advice"
        className="block text-sm font-black tracking-wider text-slate-800 uppercase"
      >
        Doctor&apos;s Advice &amp; Clinical Plan
      </label>

      <div className="mt-4">
        {readOnly ? (
          <div className="min-h-[140px] rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
            {advice || <span className="italic text-slate-500">No clinical advice recorded.</span>}
          </div>
        ) : (
          <textarea
            id="doctor-advice"
            rows={6}
            value={advice || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Advice, investigations, and follow-up plan…"
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
        )}
      </div>
    </div>
  );
}