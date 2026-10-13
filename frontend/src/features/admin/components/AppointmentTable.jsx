import React, { useMemo, useState } from 'react';
import {
  Badge, Button, DetailCard, EmptyState, ErrorBanner, FilterTabs, TableSkeleton,
} from './AdminUI';
import { formatDateShort, formatTo12h, relativeDayLabel, todayKey } from '../../../shared/utils/datetime';
import { hasContent, parseConsultationNotes } from '../../../shared/utils/consultation';
import PatientReportModal from '../../../shared/components/PatientReportModal';

/**
 * Appointment history table, shared by the doctor and patient detail pages.
 *
 * The two pages show the same records from opposite ends, so `perspective`
 * only decides whose name fills the second column — every other column,
 * filter and empty state is identical.
 */

const STATUS_TONES = {
  pending:   { tone: 'pending',  label: 'Pending' },
  completed: { tone: 'approved', label: 'Completed' },
  cancelled: { tone: 'rejected', label: 'Cancelled' },
};

function statusMeta(raw) {
  return STATUS_TONES[String(raw || '').trim().toLowerCase()] || { tone: 'slate', label: raw || 'Unknown' };
}

/**
 * Whether a consultation holds anything worth opening a report for.
 *
 * Deliberately checks the *parsed* shape rather than the raw string. The
 * serialiser writes a complete skeleton — every key present, every value
 * empty — so an untouched "Save Draft" is a truthy string that would offer
 * "View report" over a page reading "Not recorded" end to end. Plain-text
 * legacy notes land in `advice` and count as content, as they should.
 */
function hasReport(consultation) {
  if (!consultation) return false;
  return (
    hasContent(consultation.diagnosis) ||
    hasContent(consultation.medications) ||
    hasContent(consultation.advice) ||
    hasContent(consultation.vitals)
  );
}

export default function AppointmentTable({
  appointments = [],
  counts = {},
  loading = false,
  error = '',
  perspective = 'doctor',
  filter = 'all',
  onFilterChange,
  onSelectPerson,
}) {
  const today = todayKey();

  // Which appointment's report is open, if any. Kept local to the table so
  // both detail pages get the viewer without either of them owning it.
  const [reportAppt, setReportAppt] = useState(null);

  // `prescription_notes` is the serialiser's JSON blob. It used to be printed
  // straight into the cell, which filled the column with `{"diagnosis":"…`.
  // Parsed here so the cell can offer a report instead.
  const reportData = useMemo(
    () => (reportAppt ? parseConsultationNotes(reportAppt.prescription_notes, reportAppt) : null),
    [reportAppt]
  );

  // The admin serializer names these `doctor_name` / `doctor_specialization`,
  // while the report falls back to `specialty` — the same keys the patient and
  // doctor APIs return. Pass them explicitly so the report header is populated
  // rather than showing "—" for the department.
  const reportDoctor = useMemo(
    () =>
      reportAppt
        ? {
            full_name: reportAppt.doctor_name,
            specialization: reportAppt.doctor_specialization,
            phone: reportAppt.doctor_phone,
          }
        : null,
    [reportAppt]
  );

  const options = [
    { value: 'all',       label: 'All' },
    { value: 'upcoming',  label: 'Upcoming' },
    { value: 'pending',   label: 'Pending',   count: counts.pending },
    { value: 'completed', label: 'Completed', count: counts.completed },
    { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
  ];

  // "Upcoming" is a date comparison, not a stored status, so it is resolved
  // on the client from the ordering the API already returns.
  const visible = appointments.filter(a => {
    if (filter === 'upcoming') return a.appointment_date >= today && String(a.status).toLowerCase() !== 'cancelled';
    if (filter === 'all') return true;
    return String(a.status || '').trim().toLowerCase() === filter;
  });

  const isDoctorView = perspective === 'doctor';

  return (
    <>
    <DetailCard
      title="Appointments"
      subtitle={
        loading
          ? 'Loading consultation history…'
          : `${visible.length} shown · ${counts.total ?? appointments.length} total`
      }
      icon="clipboard"
      actions={onFilterChange ? <FilterTabs value={filter} onChange={onFilterChange} options={options} /> : null}
      bodyClassName=""
    >
      {error && <div className="px-5 pt-4"><ErrorBanner message={error} /></div>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3">Date &amp; Time</th>
              <th className="px-5 py-3">{isDoctorView ? 'Patient' : 'Doctor'}</th>
              <th className="px-5 py-3">Symptoms / Notes</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Prescription</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <TableSkeleton cols={5} rowsCount={4} />
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon="calendar"
                    title={filter === 'all' ? 'No appointments yet' : `No ${filter} appointments`}
                    message={
                      filter === 'all'
                        ? (isDoctorView ? 'Bookings made with this doctor will appear here.' : 'This patient has not booked a consultation yet.')
                        : 'Try a different filter to see more records.'
                    }
                  />
                </td>
              </tr>
            ) : (
              visible.map(appt => {
                const meta = statusMeta(appt.status);
                const rel = String(appt.status).toLowerCase() === 'cancelled' ? null : relativeDayLabel(appt.appointment_date);
                const isPast = appt.appointment_date < today;
                const personName = isDoctorView ? appt.patient_name : appt.doctor_name;
                const personSub = isDoctorView
                  ? [appt.patient_age ? `Age ${appt.patient_age}` : null, appt.patient_gender].filter(Boolean).join(' · ')
                  : appt.doctor_specialization;
                const personHref = isDoctorView && onSelectPerson
                  ? () => onSelectPerson({ id: appt.patient_id, name: appt.patient_name, type: 'patient' })
                  : null;

                return (
                  <tr key={appt.id} className={`align-top transition-colors hover:bg-slate-50 ${isPast ? 'text-slate-500' : ''}`}>
                    {/* Date & time */}
                    <td className="whitespace-nowrap px-5 py-4">
                      <p className="font-semibold text-slate-800">{formatDateShort(appt.appointment_date)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatTo12h(appt.slot_time)}
                        {rel && <span className="ml-1.5 font-semibold text-blue-600">· {rel}</span>}
                      </p>
                    </td>

                    {/* Counterparty */}
                    <td className="px-5 py-4">
                      {personHref ? (
                        <button onClick={personHref} className="group text-left">
                          <p className="font-semibold text-slate-800 underline-offset-2 group-hover:text-blue-600 group-hover:underline">
                            {personName || '—'}
                          </p>
                        </button>
                      ) : (
                        <p className="font-semibold text-slate-800">{personName || '—'}</p>
                      )}
                      {personSub && <p className="mt-0.5 text-xs text-slate-500">{personSub}</p>}
                    </td>

                    {/* Symptoms */}
                    <td className="max-w-xs px-5 py-4">
                      <p className="leading-6 text-slate-600">{appt.symptoms_summary || '—'}</p>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>

                    {/* Prescription */}
                    <td className="px-5 py-4">
                      {hasReport(parseConsultationNotes(appt.prescription_notes, appt)) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="document"
                          onClick={() => setReportAppt(appt)}
                        >
                          View report
                        </Button>
                      ) : (
                        <span className="text-sm text-slate-500">
                          {String(appt.status).toLowerCase() === 'completed' ? 'No notes' : 'Awaiting consult'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </DetailCard>

    {/* The same report the doctor prints, so an admin reads exactly what the
        patient was given rather than a re-interpretation of the stored JSON. */}
    <PatientReportModal
      isOpen={Boolean(reportAppt)}
      onClose={() => setReportAppt(null)}
      appt={reportAppt}
      consultationData={reportData}
      doctorInfo={reportDoctor}
    />
    </>
  );
}