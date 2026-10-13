import React, { useState } from 'react';
import { SPECIALTY_DIAGNOSES } from '../../../shared/utils/consultation';
import MedicineModal from './MedicineModal';

export default function RxBuilderTab({
  diagnosis,
  onDiagnosisChange,
  medications,
  onMedicationsChange,
  specialization,
  readOnly = false,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState(null);

  const specialtyList =
    SPECIALTY_DIAGNOSES[specialization] || SPECIALTY_DIAGNOSES['General Physician'];

  const openAdd = () => {
    setEditingMed(null);
    setIsModalOpen(true);
  };

  const openEdit = (med) => {
    setEditingMed(med);
    setIsModalOpen(true);
  };

  // One handler serves both paths: the modal decides by id whether the row is
  // new or an edit, so "add" and "edit" cannot drift apart.
  const handleSaveMedicine = (med) => {
    if (readOnly) return;
    const exists = (medications || []).some((m) => m.id === med.id);
    onMedicationsChange(
      exists
        ? medications.map((m) => (m.id === med.id ? med : m))
        : [...(medications || []), med]
    );
  };

  const handleRemoveMed = (id) => {
    if (readOnly) return;
    onMedicationsChange((medications || []).filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* ── Section 1: Provisional Diagnosis ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label
          htmlFor="provisional-diagnosis"
          className="text-xs font-black tracking-wider text-slate-700 uppercase"
        >
          Provisional Diagnosis
        </label>

        <div className="mt-3">
          <input
            id="provisional-diagnosis"
            type="text"
            value={diagnosis || ''}
            onChange={(e) => onDiagnosisChange(e.target.value)}
            disabled={readOnly}
            placeholder="e.g. Atypical Angina / Exertional Chest Discomfort"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-600"
          />
        </div>

        {/* Quick diagnosis chips. Kept: these set a diagnosis the doctor edits
            freely, and nothing is auto-prescribed from them. */}
        {!readOnly && specialtyList && specialtyList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">Quick suggestions:</span>
            {specialtyList.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onDiagnosisChange(item)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  diagnosis === item
                    ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Prescribed Medications ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="font-serif text-2xl font-black text-blue-600 leading-none">℞</span>
            <h3 className="text-sm font-black tracking-wide text-slate-900 uppercase">
              Prescribed Medications
            </h3>
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 self-start rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add medicine
            </button>
          )}
        </div>

        {/* Read-only display. The table used to be six columns of live inputs,
            so every row was a form; editing now happens in one dialog. */}
        {!medications || medications.length === 0 ? (
          <div className="py-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 font-serif text-xl font-bold text-slate-500">
              ℞
            </span>
            <p className="mt-3 text-sm font-bold text-slate-700">No medications added yet</p>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              {readOnly
                ? 'No medications were prescribed for this consultation.'
                : 'Use “Add medicine” above to prescribe your first medication.'}
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-black uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-2 w-8 text-center">#</th>
                  <th className="py-2.5 px-3">Medicine</th>
                  <th className="py-2.5 px-3">Dosage</th>
                  <th className="py-2.5 px-3">Frequency</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Instructions</th>
                  {!readOnly && <th className="py-2.5 px-2 w-24 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {medications.map((med, index) => (
                  <tr key={med.id || index} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-2 text-center font-bold text-slate-500">
                      {index + 1}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">{med.name}</td>
                    <td className="py-3 px-3 text-slate-700">{med.dosage}</td>
                    <td className="py-3 px-3 font-bold text-blue-700">{med.frequency}</td>
                    <td className="py-3 px-3 text-slate-700">{med.duration}</td>
                    <td className="py-3 px-3 text-slate-600">{med.instructions}</td>

                    {!readOnly && (
                      <td className="py-2 px-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(med)}
                            title={`Edit ${med.name}`}
                            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveMed(med.id)}
                            title={`Remove ${med.name}`}
                            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mounted only while open, and keyed by the row being edited, so the
          dialog always seeds fresh state instead of carrying the previous
          one's values across. */}
      {!readOnly && isModalOpen && (
        <MedicineModal
          key={editingMed?.id || 'new'}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveMedicine}
          initial={editingMed}
        />
      )}
    </div>
  );
}