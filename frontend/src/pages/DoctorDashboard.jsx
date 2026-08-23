import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';
import ScheduleManager from '../components/ScheduleManager';
import DoctorCalendar from '../components/DoctorCalendar';

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name) {
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

/** Format appointment_date + slot_time into a readable string. */
function formatSlot(dateStr, slotTime) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const datePart = d.toLocaleDateString('en-IN', { dateStyle: 'medium' });
  return slotTime ? `${datePart}, ${slotTime}` : datePart;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles =
    status === 'Completed'
      ? 'bg-green-50 text-green-700 border-green-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  return (
    <span className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-bold ${styles}`}>
      {status}
    </span>
  );
}

function QueueCard({ appt, isSelected, onClick }) {
  const isCompleted = appt.status === 'Completed';
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        isSelected
          ? 'border-indigo-300 bg-indigo-50 shadow-sm'
          : isCompleted
          ? 'border-slate-100 bg-slate-50 opacity-60 hover:opacity-80'
          : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isCompleted
                ? 'bg-slate-100 text-slate-500'
                : 'bg-indigo-100 text-indigo-700'
            }`}
          >
            {initials(appt.patient_name)}
          </span>
          <div className="min-w-0">
            <p className={`truncate font-bold ${isCompleted ? 'text-slate-500' : 'text-slate-800'}`}>
              {appt.patient_name || 'Unknown Patient'}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-400">{formatSlot(appt.appointment_date, appt.slot_time)}</p>
          </div>
        </div>
        <StatusBadge status={appt.status} />
      </div>
    </button>
  );
}

function EmptyQueue() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-2xl">✅</div>
      <p className="font-bold text-green-700">Queue clear</p>
      <p className="text-sm text-slate-400">No appointments assigned yet.</p>
    </div>
  );
}

function WorkspaceEmpty() {
  return (
    <div className="flex h-full items-center justify-center py-20 text-center">
      <div>
        <p className="text-5xl">🩺</p>
        <p className="mt-5 text-lg font-bold text-slate-700">Select a patient from the queue</p>
        <p className="mt-2 text-sm text-slate-400">
          Appointment details, AI summary, and prescription workspace will appear here.
        </p>
      </div>
    </div>
  );
}

function PatientDetail({ appt, prescriptionNotes, onNotesChange, onMarkComplete, completing }) {
  const isCompleted = appt.status === 'Completed';
  const isCancelled = appt.status === 'Cancelled';

  return (
    <div className="flex flex-col h-full">
      {/* Patient Header */}
      <div className="border-b border-slate-100 px-7 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">
              {initials(appt.patient_name)}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-950">{appt.patient_name || 'Unknown Patient'}</h2>
              {appt.patient_email && (
                <p className="mt-0.5 text-sm text-slate-400">{appt.patient_email}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Appointment</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{formatSlot(appt.appointment_date, appt.slot_time)}</p>
            <div className="mt-2">
              <StatusBadge status={appt.status} />
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
        {/* AI Summary */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            AI Pre-Consultation Summary
          </p>
          <p className="leading-7 text-slate-700">{appt.symptoms_summary || 'No summary provided.'}</p>
        </div>

        {/* Prescription / Consultation Notes */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label
            htmlFor={`notes-${appt.id}`}
            className="mb-3 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500"
          >
            Prescription / Consultation Notes
          </label>

          {isCancelled ? (
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm leading-6 text-red-700 font-medium">
              ⚠ This appointment was cancelled by the patient and cannot be edited or completed.
            </div>
          ) : isCompleted ? (
            // Read-only view for completed appointments
            <div className="min-h-[120px] rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-7 text-slate-600 whitespace-pre-wrap">
              {appt.prescription_notes || (
                <span className="italic text-slate-400">No prescription notes were recorded.</span>
              )}
            </div>
          ) : (
            <textarea
              id={`notes-${appt.id}`}
              rows={6}
              value={prescriptionNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Enter diagnosis, prescribed medications, dosage, follow-up instructions..."
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            />
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-slate-100 bg-slate-50 px-7 py-5 flex items-center justify-between rounded-b-2xl">
        <p className="text-xs text-slate-400">
          {isCancelled
            ? 'This appointment was cancelled and cannot be edited.'
            : isCompleted
            ? 'This appointment has been closed.'
            : 'Notes are saved when you mark as completed.'}
        </p>
        <div className="flex gap-3">
          {!isCompleted && !isCancelled && (
            <button
              onClick={onMarkComplete}
              disabled={completing}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {completing ? 'Saving...' : 'Mark as Completed'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DoctorDashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState([]);
  const [activeAppointment, setActiveAppointment] = useState(null);
  const [prescriptionNotes, setPrescriptionNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState('appointments');

  // Fetch appointments on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setApiError('');
      try {
        const res = await api.get('/api/doctor/appointments');
        const apptList = res.data?.data || res.data || [];
        setAppointments(apptList);
        // Auto-select the first pending appointment
        const firstPending = apptList.find((a) => a.status !== 'Completed');
        if (firstPending) setActiveAppointment(firstPending);
      } catch (err) {
        setApiError(err.response?.data?.detail || 'Failed to load appointments.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Reset prescription notes whenever a different appointment is selected
  const handleSelectAppointment = (appt) => {
    setActiveAppointment(appt);
    // Pre-fill with existing notes if already completed
    setPrescriptionNotes(appt.prescription_notes || '');
    setSuccessMsg('');
    setApiError('');
  };

  const handleMarkComplete = async () => {
    if (!activeAppointment) return;
    setCompleting(true);
    setApiError('');
    try {
      await api.patch(`/api/doctor/appointments/${activeAppointment.id}/complete`, {
        prescription_notes: prescriptionNotes,
      });

      // Update local state — mark as completed and store the notes
      const updated = appointments.map((a) =>
        a.id === activeAppointment.id
          ? { ...a, status: 'Completed', prescription_notes: prescriptionNotes }
          : a
      );
      setAppointments(updated);

      // Show success, then clear the workspace
      setSuccessMsg(`Appointment with ${activeAppointment.patient_name} marked as completed.`);
      setActiveAppointment(null);
      setPrescriptionNotes('');
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to update appointment.');
    } finally {
      setCompleting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/doctor/login');
  };

  const doctorName = user?.name || user?.full_name || 'Doctor';
  const pendingCount = appointments.filter((a) => a.status !== 'Completed').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white shadow-sm shadow-indigo-500/20">
              M
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-950">MedAssist</h1>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-indigo-600">Provider portal</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                pendingCount > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-green-200 bg-green-50 text-green-700'
              }`}
            >
              {pendingCount > 0 ? `${pendingCount} pending` : 'All clear'}
            </span>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold uppercase text-white">
                {doctorName.charAt(0)}
              </span>
              <span className="text-sm font-semibold text-slate-700">Dr. {doctorName}</span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-4 flex gap-1">
          <button
            id="tab-appointments"
            onClick={() => setActiveTab('appointments')}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              activeTab === 'appointments'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            🩺 Appointments
          </button>
          <button
            id="tab-schedule"
            onClick={() => setActiveTab('schedule')}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              activeTab === 'schedule'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            🕐 Shift Hours
          </button>
          <button
            id="tab-calendar"
            onClick={() => setActiveTab('calendar')}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              activeTab === 'calendar'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            📅 Calendar
          </button>
        </div>
      </header>

      {/* Banners */}
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        {apiError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <span className="font-bold">Error:</span> {apiError}
          </div>
        )}
        {successMsg && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            ✅ {successMsg}
          </div>
        )}
      </div>

      {/* Main Layout */}
      <main className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        {activeTab === 'schedule' ? (
          /* ── Schedule Tab ── */
          <ScheduleManager />
        ) : activeTab === 'calendar' ? (
          /* ── Calendar Tab ── */
          <DoctorCalendar />
        ) : loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              <p className="text-sm font-semibold text-slate-400">Loading appointments...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]" style={{ minHeight: 'calc(100vh - 160px)' }}>

            {/* ── Left: Patient Queue ── */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Patient queue</p>
                <h2 className="mt-1 text-base font-bold text-slate-950">
                  {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
                </h2>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {appointments.length === 0 ? (
                  <EmptyQueue />
                ) : (
                  <div className="space-y-2">
                    {appointments.map((appt) => (
                      <QueueCard
                        key={appt.id}
                        appt={appt}
                        isSelected={activeAppointment?.id === appt.id}
                        onClick={() => handleSelectAppointment(appt)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right: Workspace ── */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {!activeAppointment ? (
                <WorkspaceEmpty />
              ) : (
                <PatientDetail
                  appt={activeAppointment}
                  prescriptionNotes={prescriptionNotes}
                  onNotesChange={setPrescriptionNotes}
                  onMarkComplete={handleMarkComplete}
                  completing={completing}
                />
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
