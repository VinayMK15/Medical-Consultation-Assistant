import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../shared/utils/api';
import {
  formatDateTime,
  relativeDayLabel,
  daysUntil,
} from '../../../shared/utils/datetime';
import { downloadAppointmentIcs } from '../../../shared/utils/calendar';
import PatientReportModal from '../../../shared/components/PatientReportModal';
import { parseConsultationNotes } from '../../../shared/utils/consultation';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T00:00:00');
}

const STATUS_STYLES = {
  pending:   'bg-amber-50  text-amber-700  border-amber-200',
  confirmed: 'bg-blue-50   text-blue-700   border-blue-200',
  completed: 'bg-green-50  text-green-700  border-green-200',
  cancelled: 'bg-red-50    text-red-600    border-red-200',
};

const STATUS_DOT = {
  pending:   'bg-amber-400',
  confirmed: 'bg-blue-500',
  completed: 'bg-green-500',
  cancelled: 'bg-red-400',
};

const STATUS_ACCENT = {
  pending: 'before:bg-amber-400',
  confirmed: 'before:bg-blue-500',
  completed: 'before:bg-emerald-500',
  cancelled: 'before:bg-red-400',
};

function StatusBadge({ status = 'pending' }) {
  const key   = status.toLowerCase();
  const style = STATUS_STYLES[key] || 'bg-slate-50 text-slate-600 border-slate-200';
  const dot   = STATUS_DOT[key]   || 'bg-slate-400';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold capitalize ${style}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

// ── Appointment Card ──────────────────────────────────────────────────────────

function AppointmentCard({ appt, onCancel, onBookAgain }) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  // The prescription panel is detail, not the common intent of the card
  // ("when, who, what status"). Inlined permanently it added ~240px to every
  // completed card and made the page grow without bound. Nothing is lost when
  // collapsed — the Actions footer keeps its Print Report button.
  const [showDetails, setShowDetails] = useState(false);
  const status = (appt.status || 'pending').toLowerCase();
  const isPending = status === 'pending';
  // "Upcoming" is a future date that hasn't been cancelled — the same rule
  // the section split below uses, so a card and its heading always agree.
  const diff = daysUntil(appt.appointment_date);
  const isUpcoming = diff !== null && diff >= 0 && status !== 'cancelled' && status !== 'completed';
  const relativeLabel = isUpcoming ? relativeDayLabel(appt.appointment_date) : null;
  const parsedConsultation = useMemo(
    () => parseConsultationNotes(appt.prescription_notes, appt),
    [appt]
  );

  const runCancel = async () => {
    setCancelling(true);
    setCancelError('');
    try {
      await onCancel(appt.id);
      setConfirming(false);
    } catch (err) {
      // Inline rather than alert(): a blocking dialog here discards the
      // page state and gives no way to retry in context.
      setCancelError(err.response?.data?.detail || 'Could not cancel this appointment. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white pl-1 shadow-sm transition hover:border-slate-300 hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] ${
        STATUS_ACCENT[status] || 'before:bg-slate-300'
      }`}
    >
      {/* Card Top */}
      <div className="flex items-start gap-3.5 p-4 pl-4">
        {/* Doctor avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-bold uppercase text-white shadow-sm shadow-blue-500/20">
          {(appt.doctor_name || 'D').charAt(0)}
        </div>

        {/* Doctor info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="font-bold text-slate-900 leading-tight">{appt.doctor_name || 'Unknown Doctor'}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 mt-0.5">
                {appt.specialty || 'General Physician'}
              </p>
              {/* How soon it is, for anything still ahead. Saves the reader
                  doing the date arithmetic against "today". */}
              {isUpcoming && relativeLabel && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {relativeLabel}
                </p>
              )}
            </div>
            <StatusBadge status={appt.status} />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-slate-100" />

      {/* Details row. Icons dropped at this density — the labels already
          name the field, and four icon boxes per card was visual noise. */}
      <div className="grid grid-cols-1 gap-x-5 gap-y-3 px-4 py-3.5 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Date & Time</p>
          {/* 12-hour via the shared formatter. This page used to render the
              raw "09:00" while the booking modal showed "9:00 AM" for the
              very same slot. */}
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-700">
            {formatDateTime(appt.appointment_date, appt.slot_time)}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Symptoms</p>
          <p className="mt-0.5 truncate text-sm text-slate-600">{appt.symptoms || 'Not specified'}</p>
        </div>
      </div>

      {/* Where the consultation happens. Shown only while the visit is still
          ahead — it's what someone needs before travelling, and noise on a
          card for something already done. */}
      {isUpcoming && appt.address && (
        <div className="mx-4 mb-3.5 flex items-start gap-2.5 rounded-xl border border-teal-100 bg-teal-50/60 px-3 py-2">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-700">Clinic</p>
            <p className="mt-0.5 text-xs font-semibold leading-snug text-teal-900">{appt.address}</p>
          </div>
        </div>
      )}

      {/* Prescription & Consultation Summary */}
      {status === 'completed' && appt.prescription_notes && (
        <>
          <div className="mx-4 mb-3.5">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 text-left transition hover:border-indigo-200 hover:bg-indigo-50"
            >
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700">
                <span className="font-serif font-black text-sm">℞</span>
                Prescription &amp; consultation summary
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-indigo-600">
                {showDetails ? 'Hide' : 'View'}
                <svg
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </span>
            </button>
          </div>

          {showDetails && (
            <div className="mx-4 mb-3.5 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-indigo-100/90 pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <span className="font-serif font-black text-sm">℞</span>
                Official Prescription & Consultation Summary
              </p>
              {parsedConsultation.diagnosis && (
                <p className="mt-1 text-xs font-bold text-slate-900">
                  Diagnosis: <span className="text-indigo-950">{parsedConsultation.diagnosis}</span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659" />
              </svg>
              View & Print Report
            </button>
          </div>

          {/* Vitals row if present */}
          {parsedConsultation.vitals && (parsedConsultation.vitals.bp || parsedConsultation.vitals.hr) && (
            <div className="mt-2 text-xs text-indigo-900 flex flex-wrap gap-x-3 gap-y-1">
              <span className="font-semibold text-indigo-700">Recorded Vitals:</span>
              {parsedConsultation.vitals.bp && <span>BP: <strong>{parsedConsultation.vitals.bp}</strong> mmHg</span>}
              {parsedConsultation.vitals.hr && <span>HR: <strong>{parsedConsultation.vitals.hr}</strong> bpm</span>}
              {parsedConsultation.vitals.spo2 && <span>SpO2: <strong>{parsedConsultation.vitals.spo2}%</strong></span>}
              {parsedConsultation.vitals.temp && <span>Temp: <strong>{parsedConsultation.vitals.temp}°F</strong></span>}
            </div>
          )}

          {/* Medications preview if present */}
          {parsedConsultation.medications && parsedConsultation.medications.length > 0 && (
            <div className="mt-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1">
                Prescribed Medications ({parsedConsultation.medications.length}):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {parsedConsultation.medications.map((m, idx) => (
                  <span
                    key={idx}
                    className="rounded-md border border-indigo-200/80 bg-white px-2 py-1 text-sm font-semibold text-indigo-950"
                  >
                    {m.name} • <span className="text-blue-600 font-bold">{m.frequency}</span> ({m.duration})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Doctor advice if present */}
          {parsedConsultation.advice && (
            <p className="mt-2.5 text-xs text-indigo-900 leading-relaxed italic bg-white/70 p-2.5 rounded-lg border border-indigo-100">
              "{parsedConsultation.advice}"
            </p>
          )}
            </div>
          )}
        </>
      )}

      {/* Actions */}
      {(isUpcoming || (isPending && onCancel) || status === 'completed') && (
        <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
          {cancelError && (
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-600">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              {cancelError}
            </p>
          )}

          {confirming ? (
            /* Two-step confirm: one click used to destroy a booking with no
               way back. */
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700">
                Cancel this appointment? This can't be undone.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setConfirming(false); setCancelError(''); }}
                  disabled={cancelling}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Keep it
                </button>
                <button
                  onClick={runCancel}
                  disabled={cancelling}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50 min-h-11">
                  {cancelling ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Cancelling…
                    </>
                  ) : (
                    'Yes, cancel'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {status === 'completed' && (
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659" />
                  </svg>
                  Print Report
                </button>
              )}
              {isUpcoming && (
                <button
                  onClick={() => downloadAppointmentIcs(appt)}
                  className="flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add to calendar
                </button>
              )}
              {/* Gated on onBookAgain being supplied, not on status. The previous
                  condition admitted `status === 'completed'`, so every past
                  card rendered a fully styled button whose onClick was
                  undefined — it did nothing. */}
                {(isUpcoming || status === 'completed') && onBookAgain && (
                <button
                  onClick={() => onBookAgain(appt)}
                  className="flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Book again
                </button>
              )}
              {isPending && onCancel && (
                <button
                  onClick={() => { setConfirming(true); setCancelError(''); }}
                  disabled={cancelling}
                  className="flex min-h-11 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                  Cancel Appointment
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Report Modal */}
      <PatientReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        appt={appt}
        consultationData={parsedConsultation}
        doctorInfo={{
          full_name: appt.doctor_name,
          specialization: appt.specialty,
          license_number: appt.doctor_license,
          practice_address: appt.address,
          phone: appt.doctor_phone,
        }}
      />
    </div>
  );
}

// ── Skeletons / States ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

function EmptyState({ filtered, onClearFilters, onBrowseDoctors }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
      {/* SVG rather than an emoji, matching the empty states in the booking
          modal and the dashboard panels. */}
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-slate-900">
        {filtered ? 'No matching appointments' : 'No appointments yet'}
      </h3>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-600">
        {filtered
          ? 'Try adjusting your filters to see more results.'
          : 'Book a consultation from the dashboard to get started.'}
      </p>
      {filtered ? (
        <button
          onClick={onClearFilters}
          className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 inline-flex items-center min-h-11">
          Clear filters
        </button>
      ) : (
        <button
          onClick={onBrowseDoctors}
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 min-h-11">
          Find a doctor
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-red-500 ring-1 ring-red-200">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-red-700">Could not load appointments</h3>
      <p className="mt-1 max-w-xs text-xs leading-5 text-red-600">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 inline-flex items-center min-h-11">
          Try again
        </button>
      )}
    </div>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

// ── Next Appointment Strip ────────────────────────────────────────────────────

/**
 * The single most useful fact on this page: when is the next visit, with
 * whom, and where. The page used to open with a bare "5 total" badge and
 * make the reader scroll the list to find it.
 */
function NextAppointmentCard({ appt, onBookAgain }) {
  const relative = relativeDayLabel(appt.appointment_date);
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white ring-1 ring-white/25">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">Next appointment</p>
              {relative && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white ring-1 ring-white/25">
                  {relative}
                </span>
              )}
            </div>
            <p className="mt-1 text-base font-bold leading-tight text-white">
              {formatDateTime(appt.appointment_date, appt.slot_time)}
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-blue-100">
              {appt.doctor_name}
              {appt.specialty ? ` · ${appt.specialty}` : ''}
            </p>
            {appt.address && (
              <p className="mt-1 flex items-start gap-1 text-sm leading-snug text-blue-100/90">
                <svg className="mt-0.5 h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="min-w-0">{appt.address}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => downloadAppointmentIcs(appt)}
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-bold text-white ring-1 ring-white/25 transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add to calendar
          </button>
          <button
            onClick={() => onBookAgain(appt)}
            className="min-h-11 rounded-lg bg-white px-3 py-2 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Book again
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

/**
 * Status as pill chips carrying their own counts, instead of a dropdown that
 * hid the distribution until opened. The counts double as a summary, so the
 * filter controls and the at-a-glance breakdown are the same thing.
 */
function FilterBar({
  search, onSearch, dateFilter, onDateFilter,
  statusFilter, onStatusFilter, counts, totalCount,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map(({ key, label }) => {
          const isActive = statusFilter === key;
          const n = key === 'all' ? totalCount : (counts[key] || 0);
          // Zero-count options stay visible but muted, so the shape of the
          // history is legible without opening anything.
          const isEmpty = n === 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onStatusFilter(key)}
              aria-pressed={isActive}
              className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                isActive
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : isEmpty
                    ? 'border-slate-200 bg-white text-slate-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              {label}
              <span className={`rounded-full px-1.5 text-xs ${
                isActive ? 'bg-white/20 text-white' : isEmpty ? 'text-slate-500' : 'text-slate-600'
              }`}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803 7.5 7.5 0 0 0 15.803 15.803Z" />
          </svg>
          <input
            id="appt-search"
            type="search"
            placeholder="Search by doctor name…"
            aria-label="Search appointments by doctor name"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          />
        </div>

        <select
          value={dateFilter}
          onChange={(e) => onDateFilter(e.target.value)}
          aria-label="Filter by date"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
        >
          <option value="all">All Dates</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
          <option value="today">Today</option>
          <option value="30days">Last 30 Days</option>
        </select>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AppointmentHistory() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  // Filters
  const [search, setSearch]           = useState('');
  const [dateFilter, setDateFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function fetchAppointments() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/api/patient/appointments');
        if (!cancelled) setAppointments(res.data?.data || res.data || []);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.detail || err.message || 'Unexpected error.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAppointments();
    return () => { cancelled = true; };
  }, []);

  // Lets the error state offer a retry instead of stranding the page.
  const retry = () => {
    setLoading(true);
    setError(null);
    api.get('/api/patient/appointments')
      .then((res) => setAppointments(res.data?.data || res.data || []))
      .catch((err) => setError(err.response?.data?.detail || err.message || 'Unexpected error.'))
      .finally(() => setLoading(false));
  };

  const clearFilters = () => {
    setSearch('');
    setDateFilter('all');
    setStatusFilter('all');
  };

  const handleCancel = async (id) => {
    // Re-thrown so AppointmentCard can show the failure inline next to the
    // button. Swallowing it here would leave the card's spinner spinning
    // and no explanation on screen.
    await api.patch(`/api/appointments/${id}/cancel`);
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'Cancelled' } : a))
    );
  };

  // ── Filtering logic ──
  const filtered = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return appointments.filter((a) => {
      // Search
      if (search && !((a.doctor_name || '').toLowerCase().includes(search.toLowerCase()))) return false;

      // Status
      if (statusFilter !== 'all' && (a.status || '').toLowerCase() !== statusFilter) return false;

      // Date
      const d = isoDate(a.appointment_date);
      if (dateFilter === 'upcoming' && d && d < today) return false;
      if (dateFilter === 'past'     && d && d >= today) return false;
      if (dateFilter === 'today'    && d && d.toDateString() !== today.toDateString()) return false;
      if (dateFilter === '30days') {
        const ago30 = new Date(today);
        ago30.setDate(ago30.getDate() - 30);
        if (!d || d < ago30 || d > today) return false;
      }

      return true;
    });
  }, [appointments, search, dateFilter, statusFilter]);

  const upcoming = filtered.filter((a) => ['pending', 'confirmed'].includes((a.status || '').toLowerCase()));
  const past     = filtered.filter((a) => ['completed', 'cancelled'].includes((a.status || '').toLowerCase()));
  const isFiltered = search || dateFilter !== 'all' || statusFilter !== 'all';

  // Status counts come from ALL appointments, not the filtered set, so the
  // chips keep showing the real distribution while a filter is active.
  // Otherwise selecting "Cancelled" would leave every other chip reading 0.
  const statusCounts = useMemo(() => {
    const c = {};
    for (const a of appointments) {
      const k = (a.status || 'pending').toLowerCase();
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [appointments]);

  // Soonest first, so the strip always names the actual next visit.
  const nextAppt = useMemo(() => {
    if (upcoming.length === 0) return null;
    return [...upcoming].sort((a, b) => {
      const at = new Date(`${a.appointment_date}T${a.slot_time || '00:00'}`).getTime();
      const bt = new Date(`${b.appointment_date}T${b.slot_time || '00:00'}`).getTime();
      if (Number.isNaN(at)) return 1;
      if (Number.isNaN(bt)) return -1;
      return at - bt;
    })[0];
  }, [upcoming]);

  // History nobody needs immediately shouldn't dominate the page. Both sections
  // are capped at the same preview size and grow in the same increments, so a
  // patient with 30 completed appointments gets a ~3,000px page they control
  // rather than a single 14,000px cliff. One shared constant, so raising the
  // cap later is a single edit.
  const PREVIEW_LIMIT = 3;
  const LOAD_MORE_STEP = 5;

  const [pastLimit, setPastLimit] = useState(PREVIEW_LIMIT);
  const [upcomingLimit, setUpcomingLimit] = useState(PREVIEW_LIMIT);

  // Filters change what is in the list, so a limit carried over from the
  // previous query would hide nothing new. Reset both.
  useEffect(() => {
    setPastLimit(PREVIEW_LIMIT);
    setUpcomingLimit(PREVIEW_LIMIT);
  }, [search, dateFilter, statusFilter]);

  const visibleUpcoming = upcoming.slice(0, upcomingLimit);
  const hiddenUpcoming = upcoming.length - visibleUpcoming.length;
  const visiblePast = past.slice(0, pastLimit);
  const hiddenPast = past.length - visiblePast.length;

  return (
    <div className="space-y-4">
      {/* Slim header. The page already renders "Appointment History" as its
          title above, so repeating it here in a second card header was pure
          duplication — the slot is better spent on the filter row. */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        {!loading && !error && appointments.length > 0 ? (
          <FilterBar
            search={search}
            onSearch={setSearch}
            dateFilter={dateFilter}
            onDateFilter={setDateFilter}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            counts={statusCounts}
            totalCount={appointments.length}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </span>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-700">History</p>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-5">
        {!loading && !error && isFiltered && filtered.length > 0 && (
          /* Result-of-filter note. The header chips carry the totals, so
             this only appears once a filter has narrowed the list. */
          <p className="mb-4 text-sm font-semibold text-slate-600">
            Showing {filtered.length} of {appointments.length} appointment{appointments.length === 1 ? '' : 's'}
            <button
              onClick={clearFilters}
              className="ml-2 font-bold text-blue-600 transition hover:text-blue-800 hover:underline"
            >
              Clear
            </button>
          </p>
        )}

        {loading && <LoadingSkeleton />}
        {!loading && error && <ErrorState message={error} onRetry={retry} />}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            filtered={!!isFiltered}
            onClearFilters={clearFilters}
            onBrowseDoctors={() => navigate('/')}
          />
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-6">
            {/* The one card worth leading with: the next visit and its
                actions. Hidden while a filter is active so it never
                contradicts what the user asked to see. */}
            {nextAppt && !isFiltered && (
              <NextAppointmentCard appt={nextAppt} onBookAgain={() => navigate('/')} />
            )}

            {upcoming.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-teal-700">
                    Upcoming
                  </h3>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                    {upcoming.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {visibleUpcoming.map((appt) => (
                    <AppointmentCard
                      key={appt.id}
                      appt={appt}
                      onCancel={handleCancel}
                      onBookAgain={() => navigate('/')}
                    />
                  ))}
                </div>

                {/* The three states are mutually exclusive by construction:
                    show-more while anything is hidden, show-less only once
                    everything is loaded and the limit has been raised, and
                    neither when the list already fits inside the preview. */}
                {hiddenUpcoming > 0 && (
                  <button
                    onClick={() => setUpcomingLimit((n) => n + LOAD_MORE_STEP)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  >
                    Show {Math.min(LOAD_MORE_STEP, hiddenUpcoming)} more upcoming appointment{Math.min(LOAD_MORE_STEP, hiddenUpcoming) === 1 ? '' : 's'}
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
                {hiddenUpcoming === 0 && upcomingLimit > PREVIEW_LIMIT && (
                  <button
                    onClick={() => setUpcomingLimit(PREVIEW_LIMIT)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                    Show less
                  </button>
                )}
              </section>
            )}

            {past.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-600">
                    Past
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-600">
                    {past.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {visiblePast.map((appt) => (
                    // onBookAgain is passed here too. Without it the completed
                    // cards rendered a "Book again" button with no handler.
                    <AppointmentCard
                      key={appt.id}
                      appt={appt}
                      onBookAgain={() => navigate('/')}
                    />
                  ))}
                </div>

                {hiddenPast > 0 && (
                  <button
                    onClick={() => setPastLimit((n) => n + LOAD_MORE_STEP)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  >
                    Show {Math.min(LOAD_MORE_STEP, hiddenPast)} more past appointment{Math.min(LOAD_MORE_STEP, hiddenPast) === 1 ? '' : 's'}
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
                {hiddenPast === 0 && pastLimit > PREVIEW_LIMIT && (
                  <button
                    onClick={() => setPastLimit(PREVIEW_LIMIT)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                    Show less
                  </button>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
