import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';

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

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        isSelected
          ? 'border-indigo-300 bg-indigo-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
            {initials(appt.patient_name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-800">{appt.patient_name || 'Unknown Patient'}</p>
            <p className="mt-0.5 truncate text-xs text-slate-400">{formatTime(appt.appointment_time)}</p>
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

function PatientDetail({ appt, onMarkComplete, completing }) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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
            <p className="mt-1 text-sm font-semibold text-slate-700">{formatTime(appt.appointment_time)}</p>
            <div className="mt-2">
              <StatusBadge status={appt.status} />
            </div>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            AI Pre-Consultation Summary
          </p>
          <p className="leading-7 text-slate-700">{appt.symptoms_summary}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-slate-100 bg-slate-50 px-7 py-5 flex justify-end gap-3 rounded-b-2xl">
        <button className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100">
          Generate PDF Report
        </button>
        {appt.status !== 'Completed' && (
          <button
            onClick={onMarkComplete}
            disabled={completing}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {completing ? 'Saving...' : 'Mark as Completed'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DoctorDashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setApiError('');
      try {
        const res = await api.get('/api/doctor/appointments');
        setAppointments(res.data);
        if (res.data.length > 0) setSelected(res.data[0]);
      } catch (err) {
        setApiError(err.response?.data?.detail || 'Failed to load appointments.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleMarkComplete = async () => {
    if (!selected) return;
    setCompleting(true);
    try {
      await api.patch(`/api/doctor/appointments/${selected.id}/complete`);
      const updated = appointments.map((a) =>
        a.id === selected.id ? { ...a, status: 'Completed' } : a
      );
      setAppointments(updated);
      setSelected((prev) => ({ ...prev, status: 'Completed' }));
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
            <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
              {pendingCount} pending
            </span>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold uppercase text-white">
                {doctorName.charAt(0)}
              </span>
              <span className="text-sm font-semibold text-slate-700">{doctorName}</span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {apiError && (
        <div className="mx-auto mt-4 max-w-7xl px-5 lg:px-8">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <span className="font-bold">Error:</span> {apiError}
          </div>
        </div>
      )}

      {/* Main Layout */}
      <main className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm font-semibold text-slate-400">Loading appointments...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
            {/* Queue */}
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
                        isSelected={selected?.id === appt.id}
                        onClick={() => setSelected(appt)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Detail Panel */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm min-h-[480px]">
              {!selected ? (
                <div className="flex h-full items-center justify-center py-20 text-center">
                  <div>
                    <p className="text-4xl">🩺</p>
                    <p className="mt-4 font-bold text-slate-600">Select a patient from the queue</p>
                    <p className="mt-2 text-sm text-slate-400">Appointment details and AI summary will appear here.</p>
                  </div>
                </div>
              ) : (
                <PatientDetail
                  appt={selected}
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
