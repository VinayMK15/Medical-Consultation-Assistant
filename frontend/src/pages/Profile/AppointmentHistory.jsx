import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_STYLES = {
  pending:   'bg-amber-50  text-amber-700  border-amber-200',
  confirmed: 'bg-blue-50   text-blue-700   border-blue-200',
  completed: 'bg-green-50  text-green-700  border-green-200',
  cancelled: 'bg-red-50    text-red-600    border-red-200',
};

function StatusBadge({ status = 'pending' }) {
  const key = status.toLowerCase();
  const style = STATUS_STYLES[key] || 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span className={`rounded-full border px-3 py-0.5 text-xs font-bold capitalize ${style}`}>
      {status}
    </span>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AppointmentCard({ appt }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        {/* Doctor info */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold uppercase text-white shadow-sm shadow-blue-500/20">
            {(appt.doctor_name || 'D').charAt(0)}
          </div>
          <div>
            <p className="font-bold text-slate-900">{appt.doctor_name || 'Unknown Doctor'}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">
              {appt.specialty || 'General'}
            </p>
          </div>
        </div>
        <StatusBadge status={appt.status} />
      </div>

      {/* Divider */}
      <div className="my-4 border-t border-slate-100" />

      {/* Details grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Date & Time</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">{formatDate(appt.date)}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Symptoms</p>
          <p className="mt-0.5 text-sm text-slate-600 leading-5">
            {appt.symptoms || 'Not specified'}
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 py-16 text-center">
      <span className="mb-4 text-4xl">📅</span>
      <h3 className="text-base font-bold text-slate-900">No appointments found</h3>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        You haven't booked any consultations yet. Start by describing your symptoms on the dashboard.
      </p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50 py-12 text-center">
      <span className="mb-3 text-3xl">⚠️</span>
      <h3 className="text-sm font-bold text-red-700">Could not load appointments</h3>
      <p className="mt-1 text-xs text-red-500">{message}</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AppointmentHistory() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAppointments() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/api/patient/appointments');
        if (!cancelled) setAppointments(res.data || []);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err.response?.data?.detail ||
            err.message ||
            'An unexpected error occurred.';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAppointments();
    return () => { cancelled = true; };
  }, []);

  const upcoming  = appointments.filter((a) => ['pending', 'confirmed'].includes(a.status?.toLowerCase()));
  const past      = appointments.filter((a) => ['completed', 'cancelled'].includes(a.status?.toLowerCase()));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal-600">History</p>
          <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">Appointment History</h2>
        </div>
        {!loading && !error && (
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            {appointments.length} total
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-6">
        {loading && <LoadingSkeleton />}
        {!loading && error && <ErrorState message={error} />}
        {!loading && !error && appointments.length === 0 && <EmptyState />}

        {!loading && !error && appointments.length > 0 && (
          <div className="space-y-8">
            {upcoming.length > 0 && (
              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Upcoming
                </h3>
                <div className="space-y-3">
                  {upcoming.map((appt) => (
                    <AppointmentCard key={appt.id} appt={appt} />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Past
                </h3>
                <div className="space-y-3">
                  {past.map((appt) => (
                    <AppointmentCard key={appt.id} appt={appt} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
