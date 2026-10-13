import React, { useRef } from 'react';
import { formatReportDate } from '../utils/consultation';
import Modal from '../../shared/components/ui/Modal';
import BrandLogo from './BrandLogo';

const EM_DASH = '—';
const NOT_RECORDED = 'Not recorded';

/** Collapse runs of whitespace so a duplicated label prefix cannot survive. */
function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * `parseConsultationNotes` prefixes the symptom summary with
 * "AI Pre-Consultation:", and the stored summary often already carries that
 * label, which produced "AI Pre-Consultation: AI Pre-Consultation: ...".
 * Keep exactly one prefix.
 */
function normaliseTriage(text) {
  let out = cleanText(text);
  const prefix = 'AI Pre-Consultation:';
  while (out.toLowerCase().startsWith(prefix.toLowerCase())) {
    out = out.slice(prefix.length).trim();
  }
  return out;
}

export default function PatientReportModal({
  isOpen,
  onClose,
  appt,
  consultationData,
  doctorInfo,
}) {
  // Declared before the early return below so the hook order stays stable.
  // Passed to the Modal primitive, which focuses it on open.
  const closeRef = useRef(null);

  if (!isOpen || !appt) return null;

  const rawDocName = doctorInfo?.full_name || doctorInfo?.name || appt?.doctor_name || '';
  const docName = rawDocName
    ? (rawDocName.startsWith('Dr.') ? rawDocName : `Dr. ${rawDocName}`)
    : 'Authorised Medical Practitioner';
  const specialty = cleanText(doctorInfo?.specialization || appt?.specialty);
  const regNumber = cleanText(doctorInfo?.license_number || appt?.doctor_license);
  const clinicAddress = cleanText(
    doctorInfo?.practice_address || doctorInfo?.address || appt?.address
  );
  const clinicPhone = cleanText(doctorInfo?.phone || appt?.doctor_phone);

  const patientName = cleanText(appt?.patient_name);
  const patientId = appt?.patient_id != null ? `#PT-${appt.patient_id}` : '';
  const patientAge = appt?.patient_age ?? null;
  const patientGender = cleanText(appt?.patient_gender);
  const patientEmail = cleanText(appt?.patient_email);
  const apptDate = formatReportDate(appt?.appointment_date);

  // Consultation content is only ever what the doctor actually entered.
  // Nothing here invents a clinical value.
  const diagnosis = cleanText(consultationData?.diagnosis);
  const advice = cleanText(consultationData?.advice);
  const triageRef = normaliseTriage(
    consultationData?.triage_reference ||
      (appt?.symptoms_summary ? `AI Pre-Consultation: ${appt.symptoms_summary}` : '')
  );

  const vitals = consultationData?.vitals || {};
  const medications = Array.isArray(consultationData?.medications)
    ? consultationData.medications
    : [];

  const demographics = [
    patientAge != null && patientAge !== '' ? `${patientAge} yrs` : null,
    patientGender || null,
  ]
    .filter(Boolean)
    .join(', ');

  const vitalsChips = [
    { label: 'BP', value: cleanText(vitals.bp), unit: 'mmHg' },
    { label: 'HR', value: cleanText(vitals.hr), unit: 'bpm' },
    { label: 'SpO2', value: cleanText(vitals.spo2), unit: '%' },
    { label: 'Temp', value: cleanText(vitals.temp), unit: '°F' },
    { label: 'BMI', value: cleanText(vitals.bmi), unit: '' },
  ];
  const hasVitals = vitalsChips.some((v) => v.value);

  const isIncomplete = !(diagnosis && medications.length > 0 && advice && hasVitals);

  // Stable across renders: previously used Date.now(), so reopening the same
  // report produced a different ID each time and it could not be referenced.
  const documentId = appt?.id != null ? `MED-${appt.id}` : 'MED-DRAFT';

  const handlePrint = () => {
    const printEl = document.querySelector('.patient-report-printable');
    if (!printEl) { window.print(); return; }
    const styleNodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
    const styleHTML = styleNodes.map((n) => n.outerHTML).join('\n');
    const pw = window.open('', '_blank', 'width=960,height=1200');
    if (!pw) { window.print(); return; }
    pw.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Medical Consultation Report</title>${styleHTML}<style>
  @page {
    size: A4 portrait;
    margin: 6mm 8mm;
    @top-center {
      content: "Medical Consultation Report";
      font-size: 10pt;
      color: #4a5568;
      margin: 2mm 0;
    }
    @bottom-center {
      content: counter(page);
      font-size: 9pt;
      color: #718096;
    }
  }
  body {
    margin: 0;
    padding: 6mm 8mm;
    font-family: Inter, system-ui, sans-serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #2d3748;
    background: #fff;
  }
  .section {
    margin-top: 12pt;
    page-break-inside: avoid;
  }
  .section-title {
    font-size: 13pt;
    font-weight: 600;
    color: #2d3748;
    margin: 0 0 6pt;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4pt;
  }
  .info-row {
    margin: 4pt 0;
    font-size: 11pt;
  }
  .info-label {
    font-weight: 500;
    color: #4a5568;
    width: 40%;
    display: inline-block;
  }
  .info-value {
    color: #1a202c;
  }
  .badge {
    display: inline-block;
    padding: 2pt 6pt;
    font-size: 10pt;
    font-weight: 500;
    color: #fff;
    background: #3182ce;
    border-radius: 3pt;
    margin-left: 4pt;
  }
  .patient-name {
    font-size: 14pt;
    font-weight: 600;
    color: #2d3748;
    margin: 4pt 0;
    display: block;
  }
  .appointment-date {
    font-size: 11pt;
    color: #718096;
    margin: 2pt 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 6pt 0;
  }
  th, td {
    border: 1px solid #e2e8f0;
    padding: 4pt 5pt;
    font-size: 10pt;
    text-align: left;
  }
  th {
    background: #f7fafc;
    font-weight: 600;
    color: #4a5568;
  }
  .no-data {
    text-align: center;
    color: #a0aec0;
    font-style: italic;
    margin: 8pt 0;
  }
  .footer-note {
    font-size: 9pt;
    color: #718096;
    margin-top: 16pt;
    border-top: 1px solid #e2e8f0;
    padding-top: 6pt;
  }
  * {-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box;}
  .patient-report-printable{max-width:100%!important;box-shadow:none!important;border:none!important;border-radius:0!important;padding:0!important;}
</style></head><body>${printEl.outerHTML}</body></html>`);
    pw.document.close();
    pw.addEventListener('load', () => { pw.focus(); pw.print(); pw.addEventListener('afterprint', () => pw.close()); });
    setTimeout(() => { if (!pw.closed) { pw.focus(); pw.print(); pw.addEventListener('afterprint', () => pw.close()); } }, 900);
  };

  return (
    // Migrated onto the shared Modal primitive, which adds the focus trap and
    // focus restoration this dialog lacked. Its own top-bar close button is
    // kept (showCloseButton={false}) because it sits inside a designed header.
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="report-modal-title"
      showCloseButton={false}
      closeButtonRef={closeRef}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm sm:p-6"
      panelClassName="max-w-5xl rounded-3xl"
    >

        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/90 px-5 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-serif text-base font-bold text-white shadow-sm" aria-hidden="true">&#8478;</span>
            <div className="min-w-0">
              <h2 id="report-modal-title" className="truncate text-sm font-bold text-slate-900">
                Consultation Report &amp; Prescription
              </h2>
              <p className="truncate text-xs text-slate-500">MedAssist Tele-Health Portal</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 min-h-11">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659" /></svg>
              Print / Save PDF
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
              aria-label="Close report"
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto bg-slate-100/60 p-4 sm:p-6">
          <div className="patient-report-printable mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-md sm:px-8 report-header">

            {isIncomplete && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 no-print">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                <p className="text-sm leading-snug text-amber-900">
                  <span className="font-bold">Draft — incomplete consultation.</span>{' '}
                  Empty sections below are shown as &ldquo;{NOT_RECORDED}&rdquo;. Nothing on this
                  report has been filled in automatically.
                </p>
              </div>
            )}

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <BrandLogo size="sm" />
                <div className="min-w-0">
                  <h1 className="text-[17px] font-black leading-none tracking-tight text-slate-900">MedAssist Healthcare</h1>
                  {specialty && (
                    <p className="mt-0.5 text-xs font-black uppercase tracking-[0.15em] text-teal-700">Department of {specialty}</p>
                  )}
                  {(clinicAddress || clinicPhone) && (
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                      {[clinicAddress, clinicPhone ? `Tele-Consult: ${clinicPhone}` : null].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <h2 className="text-sm font-black text-slate-900">{docName}</h2>
                {specialty && <p className="text-sm font-semibold text-slate-600">{specialty}</p>}
                <p className="text-xs text-slate-500">
                  {regNumber ? `Reg. No: ${regNumber}` : `Reg. No: ${EM_DASH}`}
                </p>
              </div>
            </div>

            <div className="my-2.5 h-[3px] w-full rounded-full bg-blue-600" />

            {/* Patient info — promoted name + date for quick identification */}
            <div className="mb-4">
              <h1 className="patient-name text-2xl font-bold text-slate-900 mb-1">{patientName || 'Unnamed Patient'}</h1>
              <p className="appointment-date text-lg text-slate-600">Appointment: {apptDate || EM_DASH}</p>
              <p className="text-sm text-slate-500 mt-1">{[demographics || null, patientId || null].filter(Boolean).join(' • ') || EM_DASH}</p>
            </div>

            {/* Remaining patient details */}
            <div className="mb-2.5 rounded-lg border border-slate-300 px-4 py-2">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact</dt>
                  <dd className="mt-0.5 truncate text-sm font-bold text-slate-800" title={patientEmail}>{patientEmail || EM_DASH}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Document ID</dt>
                  <dd className="mt-0.5 truncate text-sm font-bold text-slate-800">{documentId}</dd>
                </div>
              </dl>
            </div>

            {/* Vitals */}
            <div className="mb-2.5 rounded-lg border border-blue-200/80 bg-blue-50/50 px-4 py-1.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-extrabold text-blue-900">Recorded Vitals:</span>
                {vitalsChips.map((v) => (
                  <span key={v.label} className="whitespace-nowrap text-slate-700">
                    {v.label}:{' '}
                    {v.value ? <strong className="text-slate-900">{v.value}{v.unit}</strong> : <strong className="font-normal text-slate-500">{EM_DASH}</strong>}
                  </span>
                ))}
              </div>
            </div>

            {/* Diagnosis */}
            <div className="section mb-2.5">
              <p className="section-title text-sm font-semibold uppercase tracking-wider text-slate-500">Provisional Diagnosis</p>
              {diagnosis ? (
                <p className="mt-0.5 text-sm font-black leading-snug text-slate-950">{diagnosis}</p>
              ) : (
                <p className="mt-0.5 text-sm font-semibold italic text-slate-500">{NOT_RECORDED}</p>
              )}
            </div>

            {/* AI Triage */}
            <div className="section mb-2.5">
              <p className="section-title text-sm font-semibold uppercase tracking-wider text-slate-500">AI Pre-Consultation Triage Reference</p>
              <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5">
                <p className="text-sm leading-[1.55] text-slate-700">
                  {triageRef || <span className="italic text-slate-500">{NOT_RECORDED}</span>}
                </p>
              </div>
            </div>

            {/* Medications */}
            <div className="section mb-2.5">
              <div className="mb-1 flex items-center gap-1">
                <span className="font-serif text-sm font-bold text-blue-700" aria-hidden="true">&#8478;</span>
                <p className="section-title text-sm font-semibold uppercase tracking-wider text-slate-900">Prescribed Medications</p>
              </div>
              {medications.length > 0 ? (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-800">
                        <th scope="col" className="w-5 px-1 py-0.5 text-center text-xs font-black uppercase tracking-wide text-slate-800">#</th>
                        <th scope="col" className="px-2 py-0.5 text-xs font-black uppercase tracking-wide text-slate-800">Medicine Name</th>
                        <th scope="col" className="px-2 py-0.5 text-xs font-black uppercase tracking-wide text-slate-800">Dosage</th>
                        <th scope="col" className="px-2 py-0.5 text-xs font-black uppercase tracking-wide text-slate-800">Frequency</th>
                        <th scope="col" className="px-2 py-0.5 text-xs font-black uppercase tracking-wide text-slate-800">Duration</th>
                        <th scope="col" className="px-2 py-0.5 text-xs font-black uppercase tracking-wide text-slate-800">Instructions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {medications.map((m, idx) => (
                        <tr key={m.id || `${m.name}-${idx}`}>
                          <td className="px-1 py-1 text-center font-bold text-slate-700">{idx + 1}</td>
                          <td className="px-2 py-1 font-extrabold text-slate-950">{m.name}</td>
                          <td className="px-2 py-1 text-slate-700">{m.dosage || EM_DASH}</td>
                          <td className="whitespace-nowrap px-2 py-1 font-bold text-blue-600">{m.frequency || EM_DASH}</td>
                          <td className="whitespace-nowrap px-2 py-1 text-slate-700">{m.duration || EM_DASH}</td>
                          <td className="px-2 py-1 text-slate-600">{m.instructions || EM_DASH}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2">
                  <p className="text-sm italic text-slate-500">No medications prescribed.</p>
                </div>
              )}
            </div>

            {/* Advice */}
            <div className="mb-3">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Doctor&rsquo;s Advice &amp; Plan</p>
              <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5">
                <p className="whitespace-pre-wrap text-sm leading-[1.55] text-slate-700">
                  {advice || <span className="italic text-slate-500">{NOT_RECORDED}</span>}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="footer-note flex flex-col-reverse items-start justify-between gap-3 border-t border-slate-200 pt-2.5 sm:flex-row sm:items-end">
              <div className="min-w-0">
                <p className="text-sm text-slate-600">Electronic report generated via MedAssist Healthcare Tele-Consultation System.</p>
                <p className="text-xs text-slate-500">Document ID: {documentId}</p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <div className="inline-block min-w-[150px] border-b border-slate-400 px-4 pb-0.5">
                  <p className="font-serif text-sm font-bold italic text-slate-800">{docName}</p>
                </div>
                <p className="mt-0.5 text-xs font-bold text-slate-700">Authorised Medical Practitioner</p>
                {(specialty || regNumber) && (
                  <p className="text-xs text-slate-500">
                    {[specialty || null, regNumber ? `Reg. ${regNumber}` : null].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>
            </div>

          </div>
        </div>
    </Modal>
  );
}