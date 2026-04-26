import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';

const statusStyles = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  restricted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

function Badge({ children, tone = 'pending' }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusStyles[tone]}`}>
      {children}
    </span>
  );
}

function initials(name) {
  return name
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'DR';
}

export default function AdminDashboard() {
  const { user, logout } = useContext(AuthContext);
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [actionLog, setActionLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState(null);
  const [apiError, setApiError] = useState('');

  const approvedCount = useMemo(
    () => actionLog.filter((entry) => entry.action === 'Approved').length,
    [actionLog]
  );

  useEffect(() => {
    const loadPendingDoctors = async () => {
      setLoading(true);
      setApiError('');

      try {
        const response = await api.get('/api/admin/pending-doctors');
        setPendingDoctors(response.data);
      } catch (err) {
        setApiError(err.response?.data?.detail || 'Failed to load pending provider accounts.');
      } finally {
        setLoading(false);
      }
    };

    loadPendingDoctors();
  }, []);

  const handleApprove = async (doctor) => {
    setLoadingId(doctor.id);
    setApiError('');

    try {
      await api.post(`/api/admin/verify-doctor/${doctor.id}`);
      setPendingDoctors((prev) => prev.filter((item) => item.id !== doctor.id));
      setActionLog((prev) => [
        {
          id: doctor.id,
          name: doctor.full_name || doctor.email,
          email: doctor.email,
          specialization: doctor.specialization || 'Unspecified',
          action: 'Approved',
          time: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to approve provider account.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
              AD
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-950">MedAssist Admin</h1>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-indigo-600">Restricted platform controls</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="restricted">Admin access</Badge>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              {user?.name || user?.email || 'Administrator'}
            </div>
            <button
              onClick={logout}
              className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-6 px-5 py-6 lg:px-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Platform control center</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Provider verification queue</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Review doctor accounts that are waiting for admin approval. Backend routes still enforce admin-only access.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800">
              Approval grants provider dashboard access.
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Pending providers</p>
            <p className="mt-2 text-3xl font-bold text-amber-500">{pendingDoctors.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Approved this session</p>
            <p className="mt-2 text-3xl font-bold text-green-600">{approvedCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Access level</p>
            <p className="mt-3">
              <Badge tone="restricted">Restricted</Badge>
            </p>
          </div>
        </section>

        {apiError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <span className="font-bold">Warning:</span> {apiError}
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-950">Pending provider applications</h3>
                <p className="mt-1 text-xs font-medium text-slate-400">Loaded from admin-only backend endpoint</p>
              </div>
              <Badge>{loading ? 'Loading' : `${pendingDoctors.length} awaiting review`}</Badge>
            </div>

            {loading ? (
              <div className="px-6 py-16 text-center text-sm font-semibold text-slate-400">
                Loading pending providers...
              </div>
            ) : pendingDoctors.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-bold text-green-600">All caught up</p>
                <p className="mt-2 text-sm text-slate-500">No pending provider applications.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                      <th className="px-6 py-3">Provider</th>
                      <th className="px-6 py-3">Email</th>
                      <th className="px-6 py-3">Specialization</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingDoctors.map((doctor) => (
                      <tr key={doctor.id} className="transition hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                              {initials(doctor.full_name)}
                            </div>
                            <span className="font-bold text-slate-800">{doctor.full_name || 'Unnamed provider'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{doctor.email}</td>
                        <td className="px-6 py-4">
                          <Badge>{doctor.specialization || 'Unspecified'}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge>Pending verification</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleApprove(doctor)}
                            disabled={loadingId === doctor.id}
                            className="rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-green-500/20 transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {loadingId === doctor.id ? 'Approving...' : 'Approve'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-950">Action log</h3>
              <p className="mt-1 text-xs text-slate-400">This session only</p>
            </div>

            {actionLog.length === 0 ? (
              <div className="py-8 text-sm leading-6 text-slate-500">
                Provider approval activity will appear here after you take action.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {actionLog.map((entry) => (
                  <li key={`${entry.id}-${entry.time}`} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-800">{entry.name}</p>
                        <p className="mt-1 text-xs text-slate-400">{entry.email}</p>
                        <p className="mt-1 text-xs font-semibold text-indigo-600">{entry.specialization}</p>
                      </div>
                      <Badge tone="approved">{entry.action}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{entry.time}</p>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
