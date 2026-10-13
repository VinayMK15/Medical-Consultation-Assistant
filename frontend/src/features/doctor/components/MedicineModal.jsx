import React, { useRef, useState } from 'react';
import Modal from '../../../shared/components/ui/Modal';
import {
  FORM_OPTIONS,
  FREQUENCY_OPTIONS,
  DURATION_OPTIONS,
  INSTRUCTION_OPTIONS,
  COMMON_MEDICATIONS,
} from '../../../shared/utils/consultation';

/**
 * Medicine entry lives here rather than inline in the prescription table.
 *
 * The table used to be six columns of live inputs — every row was its own form,
 * which made the grid hard to scan and impossible to read on a narrow column.
 * Editing now happens in one deliberate dialog with an explicit form/dosage
 * split, so a syrup can never be dosed in tablets.
 */

const DEFAULTS = {
  name: '',
  form: 'tablet',
  dosage: '1 Tablet',
  frequency: '1-0-0 (Morning)',
  duration: '7 Days',
  instructions: 'After meals',
};

/**
 * An existing row stores only a dosage string — the form is not persisted —
 * so reverse-map it when seeding the editor.
 */
function inferForm(dosage = '') {
  const d = String(dosage).toLowerCase();
  if (d.includes('ml')) return 'syrup';
  if (d.includes('capsule')) return 'capsule';
  if (d.includes('sachet')) return 'sachet';
  if (d.includes('puff') || d.includes('inhal')) return 'inhaler';
  if (d.includes('drop')) return 'drops';
  if (d.includes('layer') || d.includes('ointment')) return 'ointment';
  return 'tablet';
}

function seedFrom(initial) {
  if (!initial) return DEFAULTS;
  return {
    name: initial.name || '',
    form: inferForm(initial.dosage),
    dosage: initial.dosage || '1 Tablet',
    frequency: initial.frequency || '1-0-0 (Morning)',
    duration: initial.duration || '7 Days',
    instructions: initial.instructions || 'After meals',
  };
}

const fieldCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600';

export default function MedicineModal({ onClose, onSave, initial = null }) {
  const editing = Boolean(initial);
  // Seeded at mount rather than in an effect: the parent remounts this
  // component via a key whenever the target row changes, so lazy initial state
  // is both correct and free of a render-then-update flash.
  const [form, setForm] = useState(() => seedFrom(initial));
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  const formDef = FORM_OPTIONS.find((f) => f.value === form.form) || FORM_OPTIONS[0];

  // Changing form must not leave an impossible dosage selected — picking
  // "Syrup" while dosage still reads "2 Tablets" would save an incoherent row.
  const changeForm = (nextForm) => {
    const def = FORM_OPTIONS.find((f) => f.value === nextForm) || FORM_OPTIONS[0];
    setForm((p) => ({ ...p, form: nextForm, dosage: def.dosage[0] }));
  };

  // A saved record may carry a dosage this form's list does not contain
  // (written before FORM_OPTIONS existed). Offer it rather than silently
  // dropping the doctor's data from the select.
  const dosages = formDef.dosage.includes(form.dosage)
    ? formDef.dosage
    : [form.dosage, ...formDef.dosage];

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Medicine name is required.');
      nameRef.current?.focus();
      return;
    }
    onSave({
      id: initial?.id || `med-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: form.name.trim(),
      dosage: form.dosage,
      frequency: form.frequency,
      duration: form.duration,
      instructions: form.instructions,
    });
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      labelledBy="medicine-modal-title"
      initialFocusRef={nameRef}
      panelClassName="max-w-lg rounded-2xl border border-slate-200"
      closeButtonClassName="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      closeButtonLabel="Close medicine form"
    >
      <div className="px-6 pt-6">
        <h3
          id="medicine-modal-title"
          className="text-lg font-bold tracking-tight text-slate-950"
        >
          {editing ? 'Edit medicine' : 'Add medicine'}
        </h3>
      </div>

      {/* A modal is an allowed scroll region; keeps the dialog usable on a
          short window rather than growing past the viewport. */}
      <form onSubmit={submit} className="max-h-[70vh] overflow-y-auto px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="medicine-name" className={labelCls}>
              Medicine name
            </label>
            <input
              ref={nameRef}
              id="medicine-name"
              list="medicine-suggestions"
              value={form.name}
              onChange={(e) => {
                setForm((p) => ({ ...p, name: e.target.value }));
                if (error) setError('');
              }}
              placeholder="e.g. Tab. Atorvastatin 10mg"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'medicine-name-error' : undefined}
              className={`${fieldCls} ${error ? 'border-red-400' : ''}`}
            />
            {/* Names only — form, dosage, frequency, duration and instruction
                stay the doctor's decision. */}
            <datalist id="medicine-suggestions">
              {COMMON_MEDICATIONS.map((m) => (
                <option key={m.name} value={m.name} />
              ))}
            </datalist>
            {error && (
              <p id="medicine-name-error" role="alert" className="mt-1.5 text-sm text-red-600">
                {error}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="medicine-form" className={labelCls}>
              Form
            </label>
            <select
              id="medicine-form"
              value={form.form}
              onChange={(e) => changeForm(e.target.value)}
              className={fieldCls}
            >
              {FORM_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="medicine-dosage" className={labelCls}>
              Dosage
            </label>
            <select
              id="medicine-dosage"
              value={form.dosage}
              onChange={(e) => setForm((p) => ({ ...p, dosage: e.target.value }))}
              className={fieldCls}
            >
              {dosages.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="medicine-frequency" className={labelCls}>
              Frequency
            </label>
            <select
              id="medicine-frequency"
              value={form.frequency}
              onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}
              className={fieldCls}
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="medicine-duration" className={labelCls}>
              Duration
            </label>
            <select
              id="medicine-duration"
              value={form.duration}
              onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))}
              className={fieldCls}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="medicine-instructions" className={labelCls}>
              Instruction
            </label>
            <select
              id="medicine-instructions"
              value={form.instructions}
              onChange={(e) => setForm((p) => ({ ...p, instructions: e.target.value }))}
              className={fieldCls}
            >
              {INSTRUCTION_OPTIONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
          >
            {editing ? 'Save changes' : 'Save medicine'}
          </button>
        </div>
      </form>
    </Modal>
  );
}