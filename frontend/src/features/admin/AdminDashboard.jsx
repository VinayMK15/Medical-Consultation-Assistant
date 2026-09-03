import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../shared/context/AuthContext';
import api from '../../shared/utils/api';

// ─── Shared UI primitives ──────────────────────────────────────────────────────
const statusStyles = {
  pending:  'bg-amber-50  text-amber-700  border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-red-50    text-red-700    border border-red-200',
  info:     'bg-blue-50   text-blue-700   border border-blue-200',
};

function Badge({ children, tone = 'pending' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[tone]}`}>
      {children}
    </span>
  );
}

function Avatar({ name, colorClass = 'bg-indigo-100 text-indigo-700' }) {
  const initials = name?.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colorClass}`}>
      {initials}
    </div>
  );
}

function StatCard({ label, value, accent, loading = false }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      {loading ? (
        <div className="mt-3 h-8 w-16 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className={`mt-2 text-3xl font-bold tabular-nums ${accent}`}>{value ?? 0}</p>
      )}
    </div>
  );
}


// Reusable loading / error / empty states
function TableSkeleton({ cols = 5, rowsCount = 3 }) {
  return (
    <>
      {[...Array(rowsCount)].map((_, rowIndex) => (
        <tr key={rowIndex} className="animate-pulse">
          <td className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-slate-200" />
              <div className="h-4 w-28 rounded bg-slate-200" />
            </div>
          </td>
          <td className="px-6 py-4">
            <div className="h-4 w-36 rounded bg-slate-200" />
          </td>
          {cols >= 3 && (
            <td className="px-6 py-4">
              <div className="h-4 w-24 rounded bg-slate-200" />
            </td>
          )}
          {cols >= 4 && (
            <td className="px-6 py-4">
              <div className="h-5 w-16 rounded-full bg-slate-200" />
            </td>
          )}
          {cols >= 5 && (
            <td className="px-6 py-4 text-right">
              <div className="flex justify-end gap-2">
                <div className="h-7 w-16 rounded-lg bg-slate-200" />
                <div className="h-7 w-16 rounded-lg bg-slate-200" />
              </div>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

function ListSkeleton({ rowsCount = 3 }) {
  return (
    <ul className="divide-y divide-slate-100">
      {[...Array(rowsCount)].map((_, index) => (
        <li key={index} className="flex flex-col gap-4 px-6 py-4 animate-pulse sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-9 w-9 rounded-full bg-slate-200" />
            <div className="space-y-1.5">
              <div className="h-4 w-28 rounded bg-slate-200" />
              <div className="h-3 w-40 rounded bg-slate-200" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-end sm:ml-auto">
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-4 w-16 rounded bg-slate-200" />
              <div className="h-4 w-12 rounded bg-slate-200" />
              <div className="h-4 w-12 rounded bg-slate-200" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-14 rounded-lg bg-slate-200" />
              <div className="h-7 w-16 rounded-lg bg-slate-200" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}


function EmptyRow({ cols, message = 'No records found.' }) {
  return (
    <tr>
      <td colSpan={cols} className="px-6 py-14 text-center text-sm text-slate-400">{message}</td>
    </tr>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="font-bold">Error: </span>{message}
    </div>
  );
}

// ─── Reusable UserFormModal Component ──────────────────────────────────────────
function UserFormModal({ isOpen, mode, role, user, onClose, onSubmit, submitting, error }) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    age: '',
    gender: 'Male',
    specialization: 'General Physician',
    city: '',
    address: '',
    is_verified: true,
  });

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && user) {
        setFormData({
          email: user.email || '',
          password: '', // Blank by default when editing
          full_name: user.full_name || '',
          age: user.age || '',
          gender: user.gender || 'Male',
          specialization: user.specialization || 'General Physician',
          city: user.city || '',
          address: user.address || '',
          is_verified: user.is_verified ?? true,
        });
      } else {
        // Reset to initial state for creation
        setFormData({
          email: '',
          password: '',
          full_name: '',
          age: '',
          gender: 'Male',
          specialization: 'General Physician',
          city: '',
          address: '',
          is_verified: true,
        });
      }
    }
  }, [isOpen, mode, user]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const SPECIALTIES = [
    "Cardiologist", "General Physician", "Neurologist", "Pulmonologist",
    "Internal Medicine", "Dermatologist", "Orthopedist", "Pediatrician",
    "Psychiatrist", "Gastroenterologist", "Endocrinologist", "Ophthalmologist",
    "ENT Specialist", "Urologist", "Oncologist"
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4 py-6 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl transition-all max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="text-base font-bold text-slate-900">
            {mode === 'create' ? `➕ Add New ${role === 'doctor' ? 'Doctor' : 'Patient'}` : `✏️ Edit ${role === 'doctor' ? 'Doctor' : 'Patient'}`}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Full Name</label>
            <input
              type="text"
              name="full_name"
              required
              value={formData.full_name}
              onChange={handleChange}
              placeholder="e.g. Dr. Priya Sharma"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Email Address</label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="doctor@medassist.in"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Password {mode === 'edit' && <span className="text-slate-400 lowercase">(leave blank to keep)</span>}
              </label>
              <input
                type="password"
                name="password"
                required={mode === 'create'}
                value={formData.password}
                onChange={handleChange}
                placeholder={mode === 'edit' ? "••••••••" : "At least 6 chars"}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {role === 'doctor' ? (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Specialization</label>
              <select
                name="specialization"
                value={formData.specialization}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {SPECIALTIES.map(spec => (
                  <option key={spec} value={spec}>{spec}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Age</label>
                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  placeholder="e.g. 34"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Gender</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">City</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="e.g. Bangalore"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Address Area</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="e.g. Koramangala"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {role === 'doctor' && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="is_verified"
                name="is_verified"
                checked={formData.is_verified}
                onChange={handleChange}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="is_verified" className="text-xs font-semibold text-slate-700 select-none">
                Verify and activate account instantly
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-75 transition"
            >
              {submitting ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Saving…
                </>
              ) : mode === 'create' ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sidebar Config ────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'queue',    label: 'Verification Queue', icon: '🔍' },
  { id: 'doctors',  label: 'Active Doctors',      icon: '👨‍⚕️' },
  { id: 'patients', label: 'Patient Directory',   icon: '🏥' },
];

// ─── View 1: Verification Queue ────────────────────────────────────────────────
function VerificationQueueView() {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadingId, setLoadingId] = useState(null);
  const [apiError, setApiError] = useState('');
  const [actionLog, setActionLog] = useState([]);

  const approvedCount = useMemo(() => actionLog.filter(e => e.action === 'Approved').length, [actionLog]);
  const rejectedCount = useMemo(() => actionLog.filter(e => e.action === 'Rejected').length, [actionLog]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setApiError('');
      try {
        const res = await api.get('/api/admin/users', { params: { role: 'doctor', is_verified: false } });
        if (!cancelled) setRows(res.data?.data || res.data || []);
      } catch (err) {
        if (!cancelled) setApiError(err.response?.data?.detail || 'Failed to load pending providers.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleApprove = async (doctor) => {
    setLoadingId(doctor.id);
    setApiError('');
    try {
      await api.put(`/api/admin/approve-doctor/${doctor.id}`);
      setRows(prev => prev.filter(d => d.id !== doctor.id));
      setActionLog(prev => [{ ...doctor, action: 'Approved', time: new Date().toLocaleTimeString() }, ...prev]);
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to approve provider.');
    } finally { setLoadingId(null); }
  };

  const handleReject = async (doctor) => {
    setLoadingId(`${doctor.id}_reject`);
    setApiError('');
    try {
      await api.delete(`/api/admin/reject-doctor/${doctor.id}`);
      setRows(prev => prev.filter(d => d.id !== doctor.id));
      setActionLog(prev => [{ ...doctor, action: 'Rejected', time: new Date().toLocaleTimeString() }, ...prev]);
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to reject provider.');
    } finally { setLoadingId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting Review"       value={rows.length} accent="text-amber-500" loading={loading} />
        <StatCard label="Approved This Session" value={approvedCount}               accent="text-emerald-500" />
        <StatCard label="Rejected This Session" value={rejectedCount}               accent="text-red-500" />
      </div>

      {apiError && <ErrorBanner message={apiError} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        {/* Queue table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Pending Provider Applications</h3>
              <p className="mt-0.5 text-xs text-slate-400">Live data · requires admin approval</p>
            </div>
            {loading ? (
              <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
            ) : (
              <Badge tone="pending">{rows.length} pending</Badge>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3">Provider</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Specialization</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <TableSkeleton cols={5} rowsCount={3} />
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-14 text-center">
                      <p className="text-2xl">✅</p>
                      <p className="mt-2 text-sm font-semibold text-emerald-600">All caught up!</p>
                      <p className="mt-1 text-xs text-slate-400">No pending applications.</p>
                    </td>
                  </tr>
                ) : rows.map(doctor => (
                  <tr key={doctor.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={doctor.full_name} colorClass="bg-indigo-100 text-indigo-700" />
                        <span className="font-semibold text-slate-800">{doctor.full_name || 'Unnamed'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{doctor.email}</td>
                    <td className="px-6 py-4">
                      <Badge tone="info">{doctor.specialization || 'Unspecified'}</Badge>
                    </td>
                    <td className="px-6 py-4"><Badge tone="pending">Pending</Badge></td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleReject(doctor)}
                          disabled={!!loadingId}
                          className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          ❌ {loadingId === `${doctor.id}_reject` ? 'Rejecting…' : 'Reject'}
                        </button>
                        <button
                          onClick={() => handleApprove(doctor)}
                          disabled={!!loadingId}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          ✅ {loadingId === doctor.id ? 'Approving…' : 'Approve'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action log */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Action Log</h3>
            <p className="mt-0.5 text-xs text-slate-400">This session only</p>
          </div>
          {actionLog.length === 0 ? (
            <p className="text-xs leading-6 text-slate-400">Actions will appear here after you approve or reject a provider.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {actionLog.map((entry, i) => (
                <li key={i} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{entry.full_name || entry.email}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{entry.email}</p>
                    </div>
                    <Badge tone={entry.action === 'Approved' ? 'approved' : 'rejected'}>{entry.action}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">{entry.time}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── View 2: Active Doctors (with full CRUD) ───────────────────────────────────
function ActiveDoctorsView() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [search, setSearch]   = useState('');

  // Modal State Management
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [modalMode, setModalMode]       = useState('create'); // 'create' or 'edit'
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalError, setModalError]     = useState('');
  const [submitting, setSubmitting]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setApiError('');
      try {
        const res = await api.get('/api/admin/users', { params: { role: 'doctor', is_verified: true } });
        if (!cancelled) setRows(res.data?.data || res.data || []);
      } catch (err) {
        if (!cancelled) setApiError(err.response?.data?.detail || 'Failed to load active doctors.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async (formData) => {
    setSubmitting(true);
    setModalError('');
    try {
      const res = await api.post('/api/admin/users', {
        ...formData,
        role: 'doctor',
      });
      // Prepend to array immediately if verified (since verified doctors view lists verified)
      if (res.data.is_verified) {
        setRows(prev => [res.data, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to create doctor account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (formData) => {
    setSubmitting(true);
    setModalError('');
    try {
      const res = await api.put(`/api/admin/users/${selectedUser.id}`, formData);
      // Immediately reflect updates in local state
      if (!res.data.is_verified) {
        // If doctor was unverified, filter out from verified doctors list
        setRows(prev => prev.filter(d => d.id !== selectedUser.id));
      } else {
        setRows(prev => prev.map(d => d.id === selectedUser.id ? res.data : d));
      }
      setIsModalOpen(false);
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to update doctor details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${name || 'this doctor'}"? This action will clear their account and all consultations completely.`)) {
      return;
    }
    setApiError('');
    try {
      await api.delete(`/api/admin/users/${id}`);
      setRows(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to delete doctor.');
    }
  };

  const filtered = rows.filter(d => {
    const q = search.toLowerCase();
    return (
      (d.full_name   || '').toLowerCase().includes(q) ||
      (d.specialization || '').toLowerCase().includes(q) ||
      (d.city        || '').toLowerCase().includes(q)
    );
  });

  const cities = useMemo(() => [...new Set(rows.map(d => d.city).filter(Boolean))], [rows]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Active Doctors" value={rows.length} accent="text-blue-600" loading={loading} />
        <StatCard label="Cities Covered"       value={cities.length} accent="text-indigo-600" loading={loading} />
        <StatCard label="Showing Results"      value={filtered.length} accent="text-emerald-600" loading={loading} />
      </div>

      {apiError && <ErrorBanner message={apiError} />}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        
        {/* Table Header Controls */}
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Active Providers</h3>
            <p className="mt-0.5 text-xs text-slate-400">Verified doctors on the MedAssist platform</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder="Search name, specialty, city…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-64"
            />
            <button
              onClick={() => {
                setSelectedUser(null);
                setModalMode('create');
                setModalError('');
                setIsModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 transition"
            >
              ➕ Add Doctor
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3">Doctor</th>
                <th className="px-6 py-3">Specialization</th>
                <th className="px-6 py-3">City</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton cols={5} rowsCount={3} />
              ) : filtered.length === 0 ? (
                <EmptyRow cols={5} message={search ? 'No doctors match your search.' : 'No active doctors yet.'} />
              ) : filtered.map(doc => (
                <tr key={doc.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={doc.full_name} colorClass="bg-blue-100 text-blue-700" />
                      <div>
                        <p className="font-semibold text-slate-800">{doc.full_name}</p>
                        <p className="text-xs text-slate-400">{doc.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone="info">{doc.specialization || 'General'}</Badge>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{doc.city || '—'}</td>
                  <td className="px-6 py-4"><Badge tone="approved">Active</Badge></td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setSelectedUser(doc);
                          setModalMode('edit');
                          setModalError('');
                          setIsModalOpen(true);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        title="Edit doctor"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id, doc.full_name)}
                        className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition"
                        title="Delete doctor"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reusable Form Modal */}
      <UserFormModal
        isOpen={isModalOpen}
        mode={modalMode}
        role="doctor"
        user={selectedUser}
        onClose={() => setIsModalOpen(false)}
        onSubmit={modalMode === 'create' ? handleCreate : handleUpdate}
        submitting={submitting}
        error={modalError}
      />
    </div>
  );
}

// ─── View 3: Patient Directory (with full CRUD) ───────────────────────────────
function PatientDirectoryView() {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [apiError, setApiError] = useState('');
  const [search, setSearch]     = useState('');

  // Modal State Management
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [modalMode, setModalMode]       = useState('create');
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalError, setModalError]     = useState('');
  const [submitting, setSubmitting]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setApiError('');
      try {
        const res = await api.get('/api/admin/users', { params: { role: 'patient' } });
        if (!cancelled) setRows(res.data?.data || res.data || []);
      } catch (err) {
        if (!cancelled) setApiError(err.response?.data?.detail || 'Failed to load patients.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async (formData) => {
    setSubmitting(true);
    setModalError('');
    try {
      const res = await api.post('/api/admin/users', {
        ...formData,
        role: 'patient',
      });
      setRows(prev => [res.data, ...prev]);
      setIsModalOpen(false);
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to create patient account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (formData) => {
    setSubmitting(true);
    setModalError('');
    try {
      const res = await api.put(`/api/admin/users/${selectedUser.id}`, formData);
      setRows(prev => prev.map(p => p.id === selectedUser.id ? res.data : p));
      setIsModalOpen(false);
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to update patient details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${name || 'this patient'}"? All scheduled consultations for this patient will be deleted.`)) {
      return;
    }
    setApiError('');
    try {
      await api.delete(`/api/admin/users/${id}`);
      setRows(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to delete patient.');
    }
  };

  const filtered = rows.filter(p => {
    const q = search.toLowerCase();
    return (
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.email     || '').toLowerCase().includes(q) ||
      (p.city      || '').toLowerCase().includes(q)
    );
  });

  const cities = useMemo(() => [...new Set(rows.map(p => p.city).filter(Boolean))], [rows]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Registered Patients" value={rows.length} accent="text-violet-600" loading={loading} />
        <StatCard label="Cities"              value={cities.length} accent="text-teal-600" loading={loading} />
        <StatCard label="Showing Results"     value={filtered.length} accent="text-blue-600" loading={loading} />
      </div>

      {apiError && <ErrorBanner message={apiError} />}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        
        {/* Table Header Controls */}
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Patient Directory</h3>
            <p className="mt-0.5 text-xs text-slate-400">All registered patients on the platform</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder="Search name, email, city…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-64"
            />
            <button
              onClick={() => {
                setSelectedUser(null);
                setModalMode('create');
                setModalError('');
                setIsModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-violet-500/20 hover:bg-violet-700 transition"
            >
              ➕ Add Patient
            </button>
          </div>
        </div>

        {/* Directory List body */}
        {loading ? (
          <ListSkeleton rowsCount={3} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <li className="px-6 py-14 text-center text-sm text-slate-400">
                {search ? 'No patients match your search.' : 'No patients registered yet.'}
              </li>
            ) : filtered.map(patient => (
              <li key={patient.id} className="flex flex-col gap-4 px-6 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                
                {/* User avatar + basic info */}
                <div className="flex items-center gap-4">
                  <Avatar name={patient.full_name} colorClass="bg-violet-100 text-violet-700" />
                  <div>
                    <p className="font-semibold text-slate-800">{patient.full_name || 'Unknown Patient'}</p>
                    <p className="text-xs text-slate-400">{patient.email}</p>
                  </div>
                </div>

                {/* Info tags + Actions */}
                <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-end sm:ml-auto">
                  
                  {/* Metadata fields */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {patient.city  && <span>📍 {patient.city}</span>}
                    {patient.age   && <span>🎂 Age {patient.age}</span>}
                    {patient.gender && <span>👤 {patient.gender}</span>}
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setSelectedUser(patient);
                        setModalMode('edit');
                        setModalError('');
                        setIsModalOpen(true);
                      }}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                      title="Edit patient"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(patient.id, patient.full_name)}
                      className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition"
                      title="Delete patient"
                    >
                      🗑️ Delete
                    </button>
                  </div>

                </div>

              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reusable Form Modal */}
      <UserFormModal
        isOpen={isModalOpen}
        mode={modalMode}
        role="patient"
        user={selectedUser}
        onClose={() => setIsModalOpen(false)}
        onSubmit={modalMode === 'create' ? handleCreate : handleUpdate}
        submitting={submitting}
        error={modalError}
      />
    </div>
  );
}

// ─── Main Layout Component ─────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, logout } = useContext(AuthContext);
  const [activeTab, setActiveTab]     = useState('queue');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentView = {
    queue:    { title: 'Verification Queue', subtitle: 'Review and approve pending provider accounts.' },
    doctors:  { title: 'Active Doctors',      subtitle: 'Browse and manage all verified doctors on the platform.' },
    patients: { title: 'Patient Directory',   subtitle: 'Browse and manage all registered patient accounts.' },
  }[activeTab];

  const handleTabChange = useCallback((id) => {
    setActiveTab(id);
    setSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 font-sans">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-slate-900 text-white transition-transform duration-300
        lg:static lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-slate-700/60 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-black">M</div>
          <div>
            <p className="text-sm font-bold tracking-tight">MedAssist</p>
            <p className="text-xs font-medium text-blue-400">Admin Control</p>
          </div>
        </div>

        {/* Admin info */}
        <div className="mx-4 mt-5 rounded-xl bg-slate-800 px-4 py-3">
          <p className="text-xs font-semibold text-slate-300">{user?.name || user?.email || 'Administrator'}</p>
          <p className="mt-0.5 text-xs text-slate-500">Super Admin</p>
        </div>

        {/* Nav */}
        <nav className="mt-6 flex-1 space-y-1 px-3">
          <p className="px-3 pb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Navigation</p>
          {NAV_ITEMS.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
                {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/70" />}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="border-t border-slate-700/60 p-4">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 transition hover:bg-red-600/10 hover:text-red-400"
          >
            <span>🚪</span> Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900">{currentView.title}</h1>
              <p className="text-xs text-slate-400">{currentView.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 sm:inline-flex">
              🔒 Admin Access
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {(user?.name || user?.email || 'A')[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* Scrollable content — each tab mounts/unmounts independently */}
        <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
          {activeTab === 'queue'    && <VerificationQueueView key="queue" />}
          {activeTab === 'doctors'  && <ActiveDoctorsView     key="doctors" />}
          {activeTab === 'patients' && <PatientDirectoryView  key="patients" />}
        </main>
      </div>
    </div>
  );
}
