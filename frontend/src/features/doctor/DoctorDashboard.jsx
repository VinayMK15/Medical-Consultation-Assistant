import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AuthContext } from '../../shared/context/AuthContext';
import api from '../../shared/utils/api';
import { todayKey } from '../../shared/utils/datetime';
import AppShell from '../../shared/components/AppShell';
import {
  ClipboardListIcon,
  ClockIcon,
  CalendarIcon,
  CheckCircleIcon,
  DocumentIcon,
  ActivityIcon,
  PencilIcon,
  UserIcon,
  SettingsIcon,
} from '../../shared/components/ui/icons';
import ScheduleManager from './components/ScheduleManager';
import DoctorCalendar from './components/DoctorCalendar';
import DoctorProfileTab from './components/DoctorProfileTab';
import DoctorSettingsTab from './components/DoctorSettingsTab';
import QueueCard, { StatusBadge, formatSlot, initials } from './QueueCard';
import VitalsTab from './components/VitalsTab';
import RxBuilderTab from './components/RxBuilderTab';
import NotesTab from './components/NotesTab';
import SymptomsTab from './components/SymptomsTab';
import PatientReportModal from '../../shared/components/PatientReportModal';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import Modal from '../../shared/components/ui/Modal';
import Button from '../../shared/components/ui/Button';
import {
  parseConsultationNotes,
  serializeConsultationNotes,
} from '../../shared/utils/consultation';
import useDocumentTitle from '../../hooks/useDocumentTitle';

// ─── Helpers ────────────────────────────────────────────────────────────────

// Returns 'open' | 'closed'
// Closed on Sundays (fixed weekly-off convention used by the Schedule &
// Leave calendar) or outside the doctor's shift_start–shift_end window.
// Does NOT check blocked_dates/on-leave status: that data isn't loaded
// in this component, and no new fetch is added just for this pill.
function isClinicOpen(shiftStart, shiftEnd) {
  if (!shiftStart || !shiftEnd) return 'closed';
  const now = new Date();
  if (now.getDay() === 0) return 'closed'; // Sunday
  const [startH, startM] = shiftStart.split(':').map(Number);
  const [endH, endM] = shiftEnd.split(':').map(Number);
  if ([startH, startM, endH, endM].some((n) => Number.isNaN(n))) return 'closed';
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const minutesStart = startH * 60 + startM;
  const minutesEnd = endH * 60 + endM;
  return minutesNow >= minutesStart && minutesNow < minutesEnd ? 'open' : 'closed';
}

/** "16:30" → "4:30 PM". Shift times are stored as 24-hour strings. */
function formatClock(time24) {
  if (!time24) return '';
  const [h, m] = String(time24).split(':').map(Number);
  if (Number.isNaN(h)) return String(time24);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

// ─── Static specialty reference (generic, NOT per-patient) ──────────────────
// These lists are keyed only by the doctor's own specialization and are
// never derived from any patient's symptoms_summary. Each card carries a
// "not a diagnosis" caption so they read as reference, not AI output.
const SPECIALTY_REFERENCE = {
  Cardiologist: {
    considerations: ['Stable angina / exertional ischemia', 'Musculoskeletal chest strain', 'GERD / reflux-related tightness', 'Anxiety-related palpitations', 'Hypertensive urgency'],
    workup: ['12-lead resting ECG', 'Blood pressure trend review', 'Lipid profile', 'High-sensitivity troponin (if indicated)', 'Echocardiogram referral (if indicated)'],
  },
  Neurologist: {
    considerations: ['Tension-type headache', 'Migraine without aura', 'Cervicogenic headache', 'Medication-overuse headache', 'Transient ischemic symptoms'],
    workup: ['Detailed headache diary', 'Neurological examination', 'Blood pressure review', 'MRI brain (if red flags)', 'Ophthalmology referral for visual symptoms'],
  },
  Pulmonologist: {
    considerations: ['Viral upper respiratory infection', 'Asthma exacerbation', 'Allergic rhinitis with post-nasal drip', 'Acute bronchitis', 'COPD flare (in known cases)'],
    workup: ['Pulse oximetry', 'Chest auscultation findings', 'Peak flow / spirometry', 'Chest X-ray (if indicated)', 'Sputum review (if productive cough)'],
  },
  'General Physician': {
    considerations: ['Viral fever / flu-like illness', 'Dehydration with fatigue', 'Nutritional deficiency', 'Stress-related somatic symptoms', 'Early bacterial infection'],
    workup: ['Temperature / vitals chart', 'Complete blood count', 'Hydration and rest advice review', 'Blood sugar (random)', 'Follow-up timeline documentation'],
  },
  'Internal Medicine': {
    considerations: ['Gastritis / acid peptic symptoms', 'Irritable bowel pattern', 'Metabolic syndrome markers', 'Medication side-effect review', 'Chronic fatigue workup'],
    workup: ['Abdominal examination', 'Liver / renal function tests', 'HbA1c and lipid panel', 'Medication reconciliation', 'Diet and activity history'],
  },
  Dermatologist: {
    considerations: ['Contact dermatitis', 'Eczema / atopic pattern', 'Fungal infection (tinea)', 'Urticaria / hives', 'Acne vulgaris'],
    workup: ['Lesion morphology notes', 'Distribution / symmetry chart', 'KOH mount (if fungal suspected)', 'Patch-test history', 'Photo documentation with consent'],
  },
  'Orthopedic Surgeon': {
    considerations: ['Mechanical back pain', 'Muscle strain / sprain', 'Early osteoarthritis', 'Postural neck pain', 'Tendinopathy / overuse injury'],
    workup: ['Range-of-motion assessment', 'X-ray of affected joint (if indicated)', 'Pain scale documentation', 'Physiotherapy referral note', 'Weight / load counseling'],
  },
  Pediatrician: {
    considerations: ['Viral fever in children', 'Upper respiratory infection', 'Vaccination-due review', 'Growth-chart deviation', 'Nutritional deficiency'],
    workup: ['Weight / height percentile', 'Immunization record check', 'Hydration status', 'Throat / ear examination', 'Parental counseling notes'],
  },
  Psychiatrist: {
    considerations: ['Generalized anxiety pattern', 'Depressive episode screening', 'Stress-related insomnia', 'Adjustment difficulty', 'Panic-pattern episodes'],
    workup: ['PHQ-9 / GAD-7 screening', 'Sleep diary review', 'Substance-use history', 'Support-system mapping', 'Safety assessment documentation'],
  },
  Gastroenterologist: {
    considerations: ['Acid reflux / GERD', 'IBS-pattern symptoms', 'Gastritis flare', 'Constipation-predominant pattern', 'Diet-trigger review'],
    workup: ['Diet diary (2 weeks)', 'Abdominal examination', 'H. pylori testing (if indicated)', 'Liver function tests', 'Endoscopy referral criteria check'],
  },
  Endocrinologist: {
    considerations: ['Type 2 diabetes review', 'Thyroid dysfunction screen', 'Weight-gain pattern analysis', 'PCOS-associated markers', 'Medication-induced metabolic shift'],
    workup: ['HbA1c / fasting glucose', 'TSH with free T4', 'Lipid profile', 'Weight trend chart', 'Medication reconciliation'],
  },
  Ophthalmologist: {
    considerations: ['Refractive error', 'Dry-eye pattern', 'Allergic conjunctivitis', 'Early cataract screen', 'Digital eye-strain pattern'],
    workup: ['Visual acuity chart', 'Slit-lamp findings', 'Intraocular pressure', 'Fundus examination', 'Refraction workup'],
  },
  'ENT Specialist': {
    considerations: ['Allergic rhinitis', 'Sinusitis pattern', 'Tonsillitis / pharyngitis', 'Cerumen impaction', 'Eustachian-tube dysfunction'],
    workup: ['Nasal endoscopy findings', 'Throat examination', 'Audiometry (if hearing symptoms)', 'Sinus X-ray / CT (if indicated)', 'Allergy trigger history'],
  },
  Urologist: {
    considerations: ['Urinary tract infection', 'Renal colic pattern', 'Benign prostatic pattern', 'Overactive bladder pattern', 'Dehydration-linked symptoms'],
    workup: ['Urine routine / culture', 'Renal ultrasound (if indicated)', 'PSA review (age-appropriate)', 'Fluid-intake diary', 'Post-void residual check'],
  },
  Oncologist: {
    considerations: ['Benign lump evaluation', 'Lymphadenopathy workup', 'Weight-loss pattern review', 'Family-history risk mapping', 'Prior imaging comparison'],
    workup: ['Lesion measurements', 'Prior reports compilation', 'CBC with differential', 'Imaging referral (if indicated)', 'Counseling and consent notes'],
  },
  _fallback: {
    considerations: ['History of presenting symptoms', 'Past medical history review', 'Medication and allergy review', 'Family and social history', 'Red-flag symptom screening'],
    workup: ['Focused physical examination', 'Baseline vitals documentation', 'Routine blood work (as indicated)', 'Specialist referral criteria', 'Follow-up plan documentation'],
  },
};

function getReference(specialization) {
  return SPECIALTY_REFERENCE[specialization] || SPECIALTY_REFERENCE._fallback;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function EmptyQueue() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="font-bold text-green-700">Queue clear</p>
      <p className="text-sm text-slate-500">No appointments assigned yet.</p>
    </div>
  );
}

function WorkspaceEmpty() {
  return (
    <div className="flex h-full items-center justify-center py-20 text-center">
      <div>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
          </svg>
        </span>
        <p className="mt-5 text-lg font-bold text-slate-700">Select a patient from the queue</p>
        <p className="mt-2 text-sm text-slate-500">
          Appointment details, AI summary, and prescription workspace will appear here.
        </p>
      </div>
    </div>
  );
}

function PatientDetail({
  appt,
  consultationData,
  onConsultationChange,
  onSaveDraft,
  onMarkComplete,
  completing,
  savingDraft,
  isDirty,
  specialization,
  doctorInfo,
  onRequestConfirm,
}) {
  const [detailTab, setDetailTab] = useState('symptoms');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const isCompleted = appt.status === 'Completed';
  const isCancelled = appt.status === 'Cancelled';
  const reference = getReference(specialization);

  // Short labels for tabs
  const tabs = [
    { key: 'symptoms', label: 'Symptoms', full: 'Patient-Reported Symptoms', icon: <ClipboardListIcon className="h-4 w-4" /> },
    { key: 'vitals', label: 'Vitals', full: 'Vitals & Biometric Tracking', icon: <ActivityIcon className="h-4 w-4" /> },
    { key: 'rx', label: 'Prescription', full: 'Prescription Builder', icon: <DocumentIcon className="h-4 w-4" /> },
    { key: 'notes', label: 'Notes', full: 'Doctor Notes & Advice', icon: <PencilIcon className="h-4 w-4" /> },
  ];

  // Scrollable tab bar: chevrons + sliding underline
  const tabBarRef = useRef(null);
  const tabRefs = useRef({});
  const [underline, setUnderline] = useState({ left: 0, width: 0 });
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const updateTabChrome = () => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const active = tabRefs.current[detailTab];
    if (active) {
      setUnderline({ left: active.offsetLeft, width: active.offsetWidth });
    }
    setCanScroll({
      left: bar.scrollLeft > 4,
      right: bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4,
    });
  };

  useEffect(updateTabChrome, [detailTab]);
  useEffect(() => {
    updateTabChrome();
    window.addEventListener('resize', updateTabChrome);
    return () => window.removeEventListener('resize', updateTabChrome);
  }, []);

  const scrollTabs = (dir) => {
    tabBarRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Patient Header */}
      <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          {/* `flex-1` so this block claims the width the action bar leaves rather than
            sitting at its content width. Without it the meta row wraps to two
            lines at `xl`, where the header splits into columns. */}
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-base font-bold text-white shadow-sm">
              {initials(appt.patient_name)}
            </div>
            <div className="min-w-0">
              {/* Name + status + id. Status sits next to the name because it is
                  the single most important fact about this record. */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <h2 className="truncate text-xl font-bold tracking-tight text-slate-950">
                  {appt.patient_name || 'Unknown Patient'}
                </h2>
                <StatusBadge status={appt.status} />
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {appt.patient_id != null
                    ? `Patient ID #PT-${appt.patient_id}`
                    : `Appointment ref #${appt.id}`}
                </span>
              </div>

              {/* Meta — each fact is its own nowrap group so a long email can
                  never push the appointment time onto a second line. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-slate-500">
                {appt.patient_email && (
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    <span className="truncate">{appt.patient_email}</span>
                  </span>
                )}
                {appt.patient_age != null && appt.patient_gender && (
                  <span className="inline-flex shrink-0 items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="whitespace-nowrap">
                      {appt.patient_age} yrs, {appt.patient_gender}
                    </span>
                  </span>
                )}
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  <span className="whitespace-nowrap">
                    {formatSlot(appt.appointment_date, appt.slot_time)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="no-print flex shrink-0 flex-wrap items-center gap-2">
            {/* Secondary actions sit together on the left; the primary action
                (complete / update) is isolated on the right so the eye lands
                on it first. A hairline divider keeps the groups distinct. */}
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
            >
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659" />
              </svg>
              Print Rx / Report
            </button>

            {!isCancelled && !isCompleted && (
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={savingDraft || completing}
                className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-50 min-h-11">
                {savingDraft ? 'Saving...' : isDirty ? 'Save Draft •' : 'Save Draft'}
              </button>
            )}

            {/* A guard the doctor cannot see is a guard they cannot act on, so
                the unsaved state is surfaced next to the button that clears
                it. Text, not a bare dot — `aria-live` announces it politely
                without stealing focus. */}
            {isDirty && !isCancelled && !isCompleted && (
              <span
                aria-live="polite"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Unsaved
              </span>
            )}

            {/* Hairline divider isolates the primary action from the
                secondary ones so the eye lands on it first. */}
            {!isCancelled && (
              <span aria-hidden="true" className="mx-0.5 hidden h-6 w-px bg-slate-200 sm:block" />
            )}

            {!isCancelled && (
              <button
                onClick={isCompleted ? onSaveDraft : onMarkComplete}
                disabled={completing || savingDraft}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-70 min-h-11">
                {completing ? (
                  'Saving...'
                ) : isCompleted ? (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Update Rx / Notes
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Mark Completed
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable tab bar */}
      <div className="no-print relative shrink-0 border-b border-slate-100">
        <div className="flex items-center">
          {canScroll.left && (
            <button
              type="button"
              onClick={() => scrollTabs(-1)}
              aria-label="Scroll tabs left"
              className="z-10 flex h-10 w-8 shrink-0 items-center justify-center bg-white text-slate-500 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)] transition hover:text-slate-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}
          <div
            ref={tabBarRef}
            onScroll={updateTabChrome}
            className="relative flex flex-1 gap-1 overflow-x-auto px-4 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                ref={(el) => { if (el) tabRefs.current[t.key] = el; }}
                onClick={() => setDetailTab(t.key)}
                title={t.full}
                aria-label={t.full}
                aria-current={detailTab === t.key ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-4 pb-3 pt-2.5 text-sm font-bold transition ${detailTab === t.key
                    ? 'text-blue-700'
                    : 'text-slate-600 hover:text-slate-700'
                  }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
            {/* Sliding active underline */}
            <span
              className="absolute bottom-0 h-0.5 rounded-full bg-blue-600 transition-all duration-200"style={{ left: underline.left, width: underline.width }}
            />
          </div>
          {canScroll.right && (
            <button
              type="button"
              onClick={() => scrollTabs(1)}
              aria-label="Scroll tabs right"
              className="z-10 flex h-10 w-8 shrink-0 items-center justify-center bg-white text-slate-500 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.08)] transition hover:text-slate-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable body with upgraded tabs */}
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6 space-y-4">
        {detailTab === 'symptoms' && (
          <SymptomsTab
            appt={appt}
            reference={reference}
            specialization={specialization}
          />
        )}

        {detailTab === 'vitals' && (
          <VitalsTab
            vitals={consultationData?.vitals}
            onChange={(nextV) => onConsultationChange({ ...consultationData, vitals: nextV })}
            readOnly={isCancelled}
            onRequestConfirm={onRequestConfirm}
          />
        )}

        {detailTab === 'rx' && (
          isCancelled ? (
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm leading-6 font-medium text-red-700">
              This appointment was cancelled by the patient and cannot be edited.
            </div>
          ) : (
            <RxBuilderTab
              diagnosis={consultationData?.diagnosis}
              onDiagnosisChange={(diag) => onConsultationChange({ ...consultationData, diagnosis: diag })}
              medications={consultationData?.medications}
              onMedicationsChange={(meds) => onConsultationChange({ ...consultationData, medications: meds })}
              specialization={specialization}
              readOnly={isCancelled}
            />
          )
        )}

        {detailTab === 'notes' && (
          isCancelled ? (
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm leading-6 font-medium text-red-700">
              This appointment was cancelled by the patient and cannot be edited.
            </div>
          ) : (
            <NotesTab
              advice={consultationData?.advice}
              onChange={(adv) => onConsultationChange({ ...consultationData, advice: adv })}
              readOnly={isCancelled}
              onRequestConfirm={onRequestConfirm}
            />
          )
        )}
      </div>

      {/* Footer note */}
      <div className="no-print shrink-0 border-t border-slate-100 bg-slate-50 px-7 py-4 rounded-b-2xl">
        <p className="text-xs text-slate-500">
          {isCancelled
            ? 'This appointment was cancelled and cannot be edited.'
            : isCompleted
              ? 'This appointment has been completed. You can still modify notes and print the report anytime.'
              : 'Changes in Vitals, Prescription, and Notes sync directly to the printed report. Nothing is stored until you use "Save Draft" or "Mark Completed" — switching patients, refreshing, or closing the tab will discard unsaved edits.'}
        </p>
      </div>

      {/* High-fidelity Patient Report Preview & Print Modal */}
      <PatientReportModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        appt={appt}
        consultationData={consultationData}
        doctorInfo={doctorInfo}
      />
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DoctorDashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState([]);
  const [activeAppointment, setActiveAppointment] = useState(null);
  // consultationData is the single source of truth for the editable
  // consultation. A parallel `prescriptionNotes` string was kept in sync by
  // hand and only ever read for the save call, so it silently drifted; the
  // save path now serialises from consultationData directly.
  const [consultationData, setConsultationData] = useState(() => parseConsultationNotes('', null));

  // Signature of the last state known to be persisted, compared against the
  // live serialisation to answer exactly one question: would anything be lost?
  // Reusing the serialiser the save path uses means this can never drift from
  // what actually gets written.
  const savedSignatureRef = useRef('');

  const liveSignature = useMemo(
    () => serializeConsultationNotes(consultationData),
    [consultationData]
  );

  // Gated on activeAppointment: with no patient selected there is nothing to
  // lose, and the empty consultationData would otherwise read as "dirty".
  const isDirty = Boolean(activeAppointment) && liveSignature !== savedSignatureRef.current;

  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState('appointments');
  const [appointmentsOffset, setAppointmentsOffset] = useState(0);
  // How many rows are loaded so far. Kept as its own constant rather than the
  // inline 5 that used to be repeated at the fetch site and the button.
  const PAGE_SIZE = 5;
  // False once a short page comes back, i.e. the queue is exhausted. Without
  // this, Load More stays clickable and pages into empty results forever.
  const [hasMore, setHasMore] = useState(true);
  // Bumped by Refresh to force a re-fetch. Offset alone cannot express
  // "reload from the top": setting it back to 0 when it is already 0 is a
  // no-op, so the effect keyed on it would not re-run.
  const [reloadToken, setReloadToken] = useState(0);
  // The welcome modal. Greeted once per session, after appointments finish
  // loading, only on the appointments tab and only when the queue is
  // non-empty. `greetedRef` is what makes it once-per-session: without it the
  // old effect re-armed on every activeTab/pendingCount change, which as a
  // modal meant it re-popped every time you completed a consultation or
  // switched tabs and came back. It self-dismisses after 5s (see the effect
  // below) so it never lingers over the queue.
  const [showWelcome, setShowWelcome] = useState(false);
  const greetedRef = useRef(false);
  const [queueFilter, setQueueFilter] = useState('all'); // 'all' | 'waiting' | 'done'
  const [queueSearch, setQueueSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  // Tracks the selected appointment id across refetches so Refresh can
  // preserve the detail-panel selection without side effects in updaters.
  const activeIdRef = useRef(null);
  // Session-only "viewed" tracking for the "New" tag. There is no
  // persisted backend field for this — the Set lives in memory and
  // resets on refresh by design.
  const [viewedIds, setViewedIds] = useState(() => new Set());

  // Fetch one page of the queue. Shared by the initial load, Load More and
  // Refresh, which differ only in where they start and whether the result
  // replaces the list or extends it.
  const loadAppointments = useCallback(async ({ offset, replace }) => {
    setLoading(true);
    try {
      const res = await api.get('/api/doctor/appointments', {
        // `skip`, not `offset`. The backend names this parameter `skip` and
        // FastAPI ignores unknown query params without complaint, so sending
        // `offset` pinned every page to the first PAGE_SIZE rows -- appended
        // over and over, which is what produced the duplicate `key={appt.id}`
        // warnings and an infinitely growing queue.
        params: { skip: offset, limit: PAGE_SIZE },
      });
      const page = res.data?.data || [];
      setAppointments((prev) => (replace ? page : [...prev, ...page]));
      // A short page means there is nothing after it.
      setHasMore(page.length === PAGE_SIZE);
      setApiError('');
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to load appointments.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Offset 0 is the head of the list, so it replaces what is there rather
    // than appending a second copy of it.
    loadAppointments({
      offset: appointmentsOffset,
      replace: appointmentsOffset === 0,
    });
    // Deliberately NOT advancing appointmentsOffset here. Doing so rebuilt
    // this callback, which re-ran this effect, which fetched again -- so the
    // queue auto-paged through the entire history on load, without the doctor
    // ever pressing Load More.
  }, [loadAppointments, appointmentsOffset, reloadToken]);

  // ── Guard: close / reload / navigate away ──
  // The AuthContext inactivity timeout fires window.location.replace(), which
  // trips this same handler, so the 30-minute sign-out is covered too.
  //
  // `returnValue` cannot carry custom copy — browsers show their own generic
  // "Leave site?" dialog. Setting a message string here is silently ignored;
  // that is a platform limit, not a bug.
  useEffect(() => {
    if (!isDirty) return undefined;

    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Stat counts ──
  // Declared up here, ahead of the welcome-card effect below, because that
  // effect lists `pendingCount` in its dependency array. Dependency arrays
  // are evaluated during render, so a `const` declared further down this body
  // is still in its temporal dead zone and throws
  // "Cannot access 'pendingCount' before initialization" on every render.
  // Keep every derived count above the first useEffect that references one.
  // The queue lists every appointment, while these cards were scoped to today
  // — so a doctor with 5 queued patients saw "Total Consultations 0" directly
  // above a queue of 5. Counts now match what the queue shows, and the one
  // genuinely date-specific figure is labelled as such.
  const todayStr = todayKey();
  const todaysAppointments = appointments.filter((a) => a.appointment_date === todayStr);
  const totalCount = appointments.length;
  const pendingCount = appointments.filter((a) => a.status === 'Pending').length;
  const completedToday = todaysAppointments.filter((a) => a.status === 'Completed').length;
  const todayTotal = todaysAppointments.length;
  const completedPct = todayTotal > 0 ? Math.round((completedToday / todayTotal) * 100) : 0;
  const shiftSubtitle = user?.shift_start && user?.shift_end
    ? `${user.shift_start} – ${user.shift_end}`
    : null;

  const statCards = [
    {
      icon: <CalendarIcon className="h-5 w-5" />,
      accent: 'bg-blue-50 text-blue-600',
      label: 'Total Bookings',
      value: totalCount,
      sub: totalCount === 1 ? 'in queue' : 'in queue',
    },
    {
      icon: <ClockIcon className="h-5 w-5" />,
      accent: 'bg-amber-50 text-amber-700',
      label: 'Waiting in Queue',
      value: pendingCount,
      sub: pendingCount === 1 ? 'pending consultation' : 'pending consultations',
    },
    {
      icon: <CheckCircleIcon className="h-5 w-5" />,
      accent: 'bg-emerald-50 text-emerald-700',
      label: 'Completed Today',
      value: completedToday,
      sub: todayTotal > 0 ? `${completedPct}% of today's ${todayTotal}` : 'none scheduled today',
    },
  ];

  // Greet once per session: after the first load completes, on the appointments
  // tab, with a non-empty queue. `greetedRef` guards re-entry so switching
  // tabs or completing a consultation never re-opens it.
  useEffect(() => {
    if (loading) return;
    if (greetedRef.current) return;
    if (activeTab !== 'appointments' || pendingCount === 0) return;
    greetedRef.current = true;
    setShowWelcome(true);
  }, [loading, activeTab, pendingCount]);

  // Auto-dismiss the greeting after 5s. The timer is keyed on `showWelcome`, so
  // it only runs while the modal is actually open and is cleared on unmount and
  // on a manual dismiss (Escape / overlay click / "Stay here"), which prevents
  // a pending timer from firing against an already-closed modal.
  useEffect(() => {
    if (!showWelcome) return;
    const timer = setTimeout(() => setShowWelcome(false), 5000);
    return () => clearTimeout(timer);
  }, [showWelcome]);

  // Reset consultation data whenever a different appointment is selected.
  // One implementation, called either directly or from the discard
  // confirmation, so "switch" and "switch after confirming" cannot drift.
  const selectAppointment = (appt) => {
    setActiveAppointment(appt);
    activeIdRef.current = appt.id;
    // Pre-fill with existing notes if already completed
    const parsed = parseConsultationNotes(appt.prescription_notes, appt);
    setConsultationData(parsed);
    savedSignatureRef.current = serializeConsultationNotes(parsed);
    setViewedIds((prev) => new Set(prev).add(appt.id));
    setSuccessMsg('');
    setApiError('');
  };

  // An in-progress consultation lives only in React state, so clicking another
  // patient discards it outright. One click in a list, no browser chrome
  // involved — this is the loss path most likely to happen by accident.
  const handleSelectAppointment = (appt) => {
    // Re-selecting the same patient is not a discard, so it must not prompt.
    if (isDirty && appt.id !== activeAppointment?.id) {
      setPendingConfirm({
        title: 'Discard unsaved consultation?',
        body: `You have unsaved changes for ${activeAppointment?.patient_name}. Selecting ${appt.patient_name} will discard them. Save the draft first if you want to keep them.`,
        confirmLabel: 'Discard and switch',
        cancelLabel: 'Keep editing',
        tone: 'danger',
        action: () => selectAppointment(appt),
      });
      return;
    }
    selectAppointment(appt);
  };

  // Refresh refetches and overwrites consultationData from the server, which
  // discards every unsaved edit — so it asks first, like the other paths.
  const runRefresh = () => {
    // Back to the first page and replace, rather than fetching the next page
    // and appending. Otherwise a newly booked appointment, which sorts into
    // page one, could never appear without reloading the page by hand.
    const reload = () => {
      setRefreshing(true);
      setAppointmentsOffset(0);
      setReloadToken((t) => t + 1);
    };
    if (!isDirty) {
      reload();
      return;
    }
    setPendingConfirm({
      title: 'Discard unsaved consultation?',
      body: 'Refreshing reloads the appointment from the server and discards your unsaved changes.',
      confirmLabel: 'Discard and refresh',
      cancelLabel: 'Cancel',
      tone: 'danger',
      action: reload,
    });
  };

  const handleSaveDraft = async () => {
    if (!activeAppointment) return;
    setSavingDraft(true);
    setApiError('');
    try {
      const serialized = serializeConsultationNotes(consultationData);
      await api.patch(`/api/doctor/appointments/${activeAppointment.id}/notes`, {
        prescription_notes: serialized,
      });

      const updated = appointments.map((a) =>
        a.id === activeAppointment.id
          ? { ...a, prescription_notes: serialized }
          : a
      );
      setAppointments(updated);
      setActiveAppointment((prev) => (prev ? { ...prev, prescription_notes: serialized } : null));
      // These notes are now the server's truth, so the dirty flag must clear.
      savedSignatureRef.current = serialized;
      setSuccessMsg('Consultation notes & prescription saved.');
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to save notes.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!activeAppointment) return;
    setCompleting(true);
    setApiError('');
    try {
      const serialized = serializeConsultationNotes(consultationData);
      await api.patch(`/api/doctor/appointments/${activeAppointment.id}/complete`, {
        prescription_notes: serialized,
      });

      // Update local state — mark as completed and store the notes
      const updated = appointments.map((a) =>
        a.id === activeAppointment.id
          ? { ...a, status: 'Completed', prescription_notes: serialized }
          : a
      );
      setAppointments(updated);
      setActiveAppointment((prev) => (prev ? { ...prev, status: 'Completed', prescription_notes: serialized } : null));
      savedSignatureRef.current = serialized;

      // Show success
      setSuccessMsg(`Appointment with ${activeAppointment.patient_name} marked as completed.`);
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to update appointment.');
    } finally {
      setCompleting(false);
    }
  };

  const handleLogout = () => {
    // The worst version of this bug: a silent sign-out that throws away a
    // half-written prescription, discovered long after the session ended.
    if (isDirty) {
      setPendingConfirm({
        title: 'Sign out with unsaved changes?',
        body: 'This consultation has unsaved changes. Signing out discards them and they cannot be recovered.',
        confirmLabel: 'Sign out and discard',
        cancelLabel: 'Stay signed in',
        tone: 'danger',
        action: () => {
          logout();
          navigate('/doctor/login');
        },
      });
      return;
    }
    logout();
    navigate('/doctor/login');
  };

  useDocumentTitle('Doctor Dashboard');
  const doctorName = user?.name || user?.full_name || 'Doctor';
  // Prefix the honorific exactly once. Accounts registered as "Dr. Pooja Hegde"
  // render as "Dr. Dr. Pooja Hegde" if this is applied unconditionally — which
  // is what the old welcome header did.
  const displayName = doctorName.startsWith('Dr.') ? doctorName : `Dr. ${doctorName}`;
  const specialization = user?.specialization || null;

  // Dynamic top-bar content from the doctor's real profile
  const subtitle = specialization
    ? (user?.practice_city ? `${specialization} • ${user.practice_city} Clinic` : specialization)
    : 'Provider portal';
  const clinicOpen = isClinicOpen(user?.shift_start, user?.shift_end);

  // ── Queue filtering (status tabs + text search) ──
  const waitingCount = pendingCount;
  const doneCount = appointments.filter((a) => a.status === 'Completed').length;
  const searchLower = queueSearch.trim().toLowerCase();
  const visibleAppointments = appointments.filter((a) => {
    if (queueFilter === 'waiting' && a.status !== 'Pending') return false;
    if (queueFilter === 'done' && a.status !== 'Completed') return false;
    if (searchLower) {
      const haystack = `${a.patient_name || ''} ${a.symptoms_summary || ''}`.toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }
    return true;
  });

  const filterTabs = [
    { key: 'all', label: `All (${appointments.length})` },
    { key: 'waiting', label: `Waiting (${waitingCount})` },
    { key: 'done', label: `Done (${doneCount})` },
  ];

  // ── Sidebar Doctor Hero Card (mirrors patient profile style) ──
  const sidebarHero = (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
      <div className="flex flex-col items-center text-center gap-2">
        <div className="relative">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xl font-bold uppercase text-white shadow-md shadow-blue-500/20">
            {doctorName.charAt(0)}
          </div>
          {user?.is_verified && (
            <span
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-2 ring-white"title="Verified Healthcare Provider"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
          )}
        </div>
        <div className="w-full min-w-0">
          <p className="text-sm font-bold text-slate-900 leading-snug truncate"title={displayName}>
            {displayName}
          </p>
          {specialization && (
            <p className="text-xs font-semibold text-blue-600 truncate mt-0.5"title={specialization}>
              {specialization}
            </p>
          )}
          <p className="text-xs text-slate-500 truncate mt-0.5"title={user?.email}>
            {user?.email}
          </p>
        </div>
        {/* The clinic open/closed pill used to repeat here, directly beneath
            the identical one in the top bar. The top bar carries it, so the
            sidebar card keeps only identity. It stays identical on every tab
            because it is derived from the shift, not from the active tab. */}
      </div>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Doctor Portal</title>
        <meta name="description" content="Manage your practice, view appointments, and connect with patients through the MedAssist doctor portal." />
      </Helmet>
      <AppShell
        lock
        brandLabel="MedAssist Doctor Workstation"
        subtitle={subtitle}
        sidebarHero={sidebarHero}
      statusBadge={
        clinicOpen === 'open' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Clinic Open
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Clinic Closed
          </span>
        )
      }
      actions={
        activeTab === 'appointments' ? (
          <button
            type="button"
            onClick={runRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.985 14.652H-.007l4.992 4.992M20.015 9.348a8.25 8.25 0 00-13.803-3.7M3.985 14.652a8.25 8.25 0 0013.803 3.7" />
              </svg>
            )}
            Refresh
          </button>
        ) : null
      }
      user={{ name: doctorName, email: user?.email }}
      // No menuItems: the avatar dropdown duplicated "My Profile" and
      // "Settings", which the sidebar already lists and which point at the
      // exact same tabs. Two names for one destination made it look like
      // there were two different profile pages.
      onLogout={handleLogout}
      navItems={[
        { key: 'appointments', label: 'Appointments', icon: <ClipboardListIcon className="h-5 w-5" /> },
        { key: 'schedule', label: 'Shift Hours', icon: <ClockIcon className="h-5 w-5" /> },
        { key: 'calendar', label: 'Calendar', icon: <CalendarIcon className="h-5 w-5" /> },
        { key: 'profile', label: 'Profile', icon: <UserIcon className="h-5 w-5" /> },
        { key: 'settings', label: 'Settings', icon: <SettingsIcon className="h-5 w-5" /> },
      ]}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {/* Banners now live INSIDE the layout wrapper. As siblings of it they sat
          outside the flex column, so an error or success banner appearing
          pushed the wrapper past the viewport and brought the page scroll
          straight back. */}
      <div
        className={`mx-auto max-w-7xl px-5 py-6 lg:px-8 ${
          // <main> is `display: block`, NOT a flex column, so `flex-1` and
          // `min-h-0` on this wrapper are INERT — the wrapper sizes itself to
          // its content and <main>'s own overflow-y-auto becomes the scroll
          // region. `h-full` is what actually binds a tab to the viewport: it
          // resolves against <main>'s definite height, since <main> is a
          // stretched flex item in the shell's row. Measured: with `flex-1` the
          // Calendar overflowed its viewport by 108px; with `h-full`, 0px.
          //
          // Calendar needs `h-full` so `auto-rows-fr` binds to the viewport height.
          // Profile has a footer, so it page-scrolls (no flex constraint).
          // Appointments, Schedule, Settings lock internally with `flex-1`.
          activeTab === 'calendar'
            ? 'flex h-full min-h-0 flex-col'
            : activeTab === 'profile'
              ? ''
              : 'flex min-h-0 flex-1 flex-col'
        }`}
      >
        <div className="shrink-0">
          {apiError && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <span className="font-bold">Error:</span> {apiError}
            </div>
          )}
          {successMsg && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {successMsg}
            </div>
          )}
        </div>

        {activeTab === 'schedule' ? (
          /* ── Schedule Tab ── */
          <ScheduleManager />
        ) : activeTab === 'calendar' ? (
          /* ── Calendar Tab ── */
          <DoctorCalendar />
        ) : activeTab === 'profile' ? (
          /* ── Profile Tab ── */
          <DoctorProfileTab onOpenShiftHours={() => setActiveTab('schedule')} />
        ) : activeTab === 'settings' ? (
          /* ── Settings Tab ── */
          <DoctorSettingsTab />
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
              <p className="text-sm font-semibold text-slate-500">Loading appointments...</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Stat cards (always rendered, even with zero appointments) ──
                Laid out icon-left / text-right rather than stacked. Stacked,
                each card ran ~150px and the four of them pushed the patient
                queue and the whole consultation workspace below the fold in
                the narrow layout. Same information, roughly half the height. */}
            <div className="mb-6 grid shrink-0 grid-cols-2 gap-4 xl:grid-cols-4">
              {statCards.map((c) => (
                <div key={c.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${c.accent}`}>
                    {c.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
                    <p className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="text-xl font-black leading-none text-slate-900">{c.value}</span>
                      <span className="truncate text-xs font-medium text-slate-500">{c.sub}</span>
                    </p>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <DocumentIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-600">Clinic Hours</p>
                  {/* Derived from the shift, not hardcoded. This previously
                      read "Available on Duty" with a green dot regardless of
                      the time, which contradicted the Clinic Closed/Open badge
                      directly above it. */}
                  {clinicOpen === 'open' ? (
                    <p className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="flex items-center gap-1.5 text-sm font-bold leading-none text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Open now
                      </span>
                      <span className="truncate text-xs font-medium text-slate-500">
                        closes {formatClock(user?.shift_end)}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="flex items-center gap-1.5 text-sm font-bold leading-none text-slate-700">
                        <span className="h-2 w-2 rounded-full bg-slate-400" />
                        Closed now
                      </span>
                      <span className="truncate text-xs font-medium text-slate-500">
                        {shiftSubtitle
                          ? `opens ${formatClock(user?.shift_start)}`
                          : 'no shift set'}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">

              {/* ── Left: Patient Queue ── */}
              <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                    <ClipboardListIcon className="h-4 w-4" />
                    Patient Queue ({appointments.length})
                  </p>

                  {/* Filter tabs (always visible, even when empty) */}
                  <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
                    {filterTabs.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setQueueFilter(t.key)}
                        className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition ${queueFilter === t.key
                            ? 'bg-white text-blue-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-700'
                          }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Search (always visible, even when empty) */}
                  <div className="relative mt-2">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                    </span>
                    <input
                      id="queue-search"
                      type="text"
                      // The only way to filter the patient queue. It was
                      // placeholder-only, so it had no accessible name.
                      aria-label="Search the patient queue by patient name or symptoms"
                      value={queueSearch}
                      onChange={(e) => setQueueSearch(e.target.value)}
                      placeholder="Search patient, symptoms…"
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                  {appointments.length === 0 ? (
                    <EmptyQueue />
                  ) : visibleAppointments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                      <p className="text-sm font-bold text-slate-600">No matching appointments</p>
                      <p className="text-xs text-slate-500">Try a different filter or search term.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {visibleAppointments.map((appt) => (
                        <QueueCard
                          key={appt.id}
                          appt={appt}
                          isSelected={activeAppointment?.id === appt.id}
                          isNew={!viewedIds.has(appt.id)}
                          onClick={() => handleSelectAppointment(appt)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Load More button */}
              {hasMore && appointments.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAppointmentsOffset(prev => prev + PAGE_SIZE)}
                  disabled={appointmentsOffset >= 20 || !!apiError}
                  aria-busy={loading}
                >
                  {loading ? 'Loading…' : `Load More (${appointments.length} loaded)`}
                </Button>
              )}

              {appointmentsOffset >= 20 && <p className="text-sm text-slate-500 pt-2">All appointments loaded.</p>}

              {/* ── Right: Workspace ── */}
              <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {!activeAppointment ? (
                  <WorkspaceEmpty />
                ) : (
                  <PatientDetail
                    key={activeAppointment.id}
                    appt={activeAppointment}
                    consultationData={consultationData}
                    onConsultationChange={setConsultationData}
                    onSaveDraft={handleSaveDraft}
                    onMarkComplete={handleMarkComplete}
                    completing={completing}
                    savingDraft={savingDraft}
                    isDirty={isDirty}
                    specialization={specialization}
                    doctorInfo={user}
                    onRequestConfirm={setPendingConfirm}
                  />
                )}
              </div>

            </div>
          </>
        )}
      </div>

      {/* Destructive-action confirmation. One instance serves every demo load
          and the vitals clear, so the "are you sure" wording lives in one
          place. `pendingConfirm` is set by a request and cleared by the dialog,
          so it doubles as the open flag. */}
      <ConfirmDialog
        isOpen={Boolean(pendingConfirm)}
        onClose={() => setPendingConfirm(null)}
        onConfirm={() => pendingConfirm?.action()}
        title={pendingConfirm?.title}
        body={pendingConfirm?.body}
        confirmLabel={pendingConfirm?.confirmLabel}
        cancelLabel={pendingConfirm?.cancelLabel}
        tone={pendingConfirm?.tone}
      />

      {/* ── Welcome modal ──────────────────────────────────────────────────
          Was an inline card between the error banners and the workspace. It
          pushed the stat cards and the whole patient queue down, and it
          duplicated the "Waiting in Queue" stat card directly below it, so
          the same fact appeared twice in the same column. The queue count is
          still there; this is now the greeting.

          Built on the shared Modal so it gets Escape, the focus trap, the
          scroll lock and focus restoration for free — a hand-rolled overlay
          would have been the eighth dialog in this app to skip all four. */}
      <Modal
        isOpen={showWelcome}
        onClose={() => setShowWelcome(false)}
        labelledBy="welcome-modal-title"
        panelClassName="max-w-md rounded-2xl"
        overlayClassName="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
        closeButtonLabel="Close welcome message"
      >
        <div className="p-6 text-center sm:p-7">
          <span
            aria-hidden="true"
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xl font-bold uppercase text-white shadow-md shadow-blue-500/25"
          >
            {(displayName.replace(/^Dr\.?\s*/i, '')[0]) || 'D'}
          </span>

          <h2 id="welcome-modal-title" className="mt-4 text-lg font-bold text-slate-950">
            Welcome, {displayName}
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            You have{' '}
            <span className="font-bold text-blue-600">{pendingCount}</span> pending appointment
            {pendingCount !== 1 ? 's' : ''} in your queue.
          </p>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setShowWelcome(false)}>
              Stay here
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setShowWelcome(false);
                handleSelectAppointment(
                  appointments.find((a) => a.status === 'Pending') || appointments[0]
                );
              }}
              disabled={appointments.length === 0}
            >
              Start consultation
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
    </>
  );
}
