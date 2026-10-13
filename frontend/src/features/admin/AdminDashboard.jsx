import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import api from '../../shared/utils/api';
import AdminLayout from './AdminLayout';
import Modal from '../../shared/components/ui/Modal';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import Icon from './components/Icon';
import { PasswordInput } from '../../shared/components/ui/Input';
import {
  Avatar, Badge, Button, DetailCard, EmptyState, ErrorBanner, FilterTabs, ListSkeleton,
  StatCard, TableSkeleton,
} from './components/AdminUI';
import { formatDateShort } from '../../shared/utils/datetime';
import useDocumentTitle from '../../hooks/useDocumentTitle';

/**
 * Admin list views: verification queue, active doctors, patient directory.
 *
 * The active tab lives in the `?tab=` query string rather than component
 * state so the detail pages can deep-link back to the exact list the admin
 * came from, and so a refresh or a shared URL lands in the same place.
 */

const TAB_META = {
  queue:    { title: 'Verification Queue', subtitle: 'Review and approve pending provider accounts.' },
  doctors:  { title: 'Active Doctors',      subtitle: 'Browse and manage every verified doctor on the platform.' },
  patients: { title: 'Patient Directory',   subtitle: 'Browse and manage every registered patient account.' },
};

export default function AdminDashboard() {
  // Tab state lives in the `?tab=` query string (see the file comment), which is
// what makes the list views deep-linkable.
  const [searchParams] = useSearchParams();
  const activeTab = TAB_META[searchParams.get('tab')] ? searchParams.get('tab') : 'queue';

  useDocumentTitle('Admin Dashboard');
  const meta = TAB_META[activeTab];

  return (
    <AdminLayout activeTab={activeTab} title={meta.title} subtitle={meta.subtitle}>
      {activeTab === 'queue'    && <VerificationQueueView key="queue" />}
      {activeTab === 'doctors'  && <ActiveDoctorsView     key="doctors" />}
      {activeTab === 'patients' && <PatientDirectoryView  key="patients" />}
    </AdminLayout>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shared create/edit modal
 * ──────────────────────────────────────────────────────────────────────────── */

const SPECIALTIES = [
  'Cardiologist', 'General Physician', 'Neurologist', 'Pulmonologist',
  'Internal Medicine', 'Dermatologist', 'Orthopedist', 'Pediatrician',
  'Psychiatrist', 'Gastroenterologist', 'Endocrinologist', 'Ophthalmologist',
  'ENT Specialist', 'Urologist', 'Oncologist',
];

const FIELD_CLASS =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';
const LABEL_CLASS = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500';

function initialFormData(mode, user) {
  if (mode === 'edit' && user) {
    return {
      email: user.email || '',
      password: '',
      full_name: user.full_name || '',
      age: user.age || '',
      gender: user.gender || 'Male',
      specialization: user.specialization || 'General Physician',
      city: user.city || '',
      address: user.address || '',
      is_verified: user.is_verified ?? true,
    };
  }
  return {
    email: '', password: '', full_name: '', age: '', gender: 'Male',
    specialization: 'General Physician', city: '', address: '', is_verified: true,
  };
}

/**
 * Wraps a labelled control.
 *
 * `htmlFor`/`id` are generated here because `Field` is always used with a child
 * that carries its own `name`. Previously the <label> had no `htmlFor`, so
 * clicking it did nothing and none of these eight admin fields had an
 * accessible name.
 */
function Field({ label, hint, children }) {
  // useId rather than a module counter: it is per-instance, stable across
  // renders, and can't collide the way an incrementing counter can.
  const autoId = React.useId();
  const child =
    React.isValidElement(children) && !children.props.id
      ? React.cloneElement(children, { id: autoId })
      : children;

  return (
    <div>
      <label htmlFor={autoId} className={LABEL_CLASS}>
        {label}
        {hint && (
          <span className="ml-1 font-medium normal-case tracking-normal text-slate-500">
            {hint}
          </span>
        )}
      </label>
      {child}
    </div>
  );
}

function UserFormModal({ isOpen, mode, role, user, onClose, onSubmit, submitting, error }) {
  const [formData, setFormData] = useState(() => initialFormData(mode, user));
  const isDoctor = role === 'doctor';
  const entity = isDoctor ? 'Doctor' : 'Patient';

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  return (
    // Migrated onto the shared Modal primitive. This was a bare div overlay:
    // no role="dialog", no aria-modal, no Escape handler, no focus trap, so
    // a keyboard user tabbed straight through it into the page behind.
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="user-form-title"
      closeOnBackdrop={!submitting}
      onClosePrevented={() => submitting}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-6 backdrop-blur-sm"
      panelClassName="max-w-lg rounded-2xl"
      closeButtonClassName="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      closeButtonLabel="Close dialog"
    >
      <form onSubmit={e => { e.preventDefault(); onSubmit(formData); }}>
          <header className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon name={mode === 'create' ? 'plus' : 'edit'} className="h-4 w-4" />
              </span>
              <div>
                <h3 id="user-form-title" className="text-base font-bold text-slate-900">
                  {mode === 'create' ? `Add new ${entity}` : `Edit ${entity}`}
                </h3>
                <p className="text-sm text-slate-500">
                  {mode === 'create' ? `Create a ${entity.toLowerCase()} account` : 'Update account details'}
                </p>
              </div>
            </header>

          <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
            {error && <ErrorBanner message={error} />}

            <Field label="Full Name">
              <input type="text" name="full_name" required value={formData.full_name} onChange={handleChange}
                placeholder={isDoctor ? 'e.g. Dr. Priya Sharma' : 'e.g. Rahul Verma'} className={FIELD_CLASS} />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Email Address">
                <input type="email" name="email" required value={formData.email} onChange={handleChange}
                  placeholder="name@example.com" className={FIELD_CLASS} />
              </Field>
              <Field label="Password">
                <PasswordInput
                  id="user-password"
                  type="password"
                  name="password"
                  required={mode === 'create'}
                  value={formData.password}
                  onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={mode === 'edit' ? 'Leave blank to keep current password' : 'At least 8 characters'}
                  className={FIELD_CLASS}
                  showToggle={mode !== 'edit'}
                  strengthMeter={true}
                />
                {mode === 'edit' && (
                  <p className="mt-1 text-xs text-slate-500">
                    Only enter a new password to reset it. Leaving this blank keeps the current one.
                  </p>
                )}
              </Field>
            </div>

            {isDoctor ? (
              <Field label="Specialization">
                <select name="specialization" value={formData.specialization} onChange={handleChange} className={FIELD_CLASS}>
                  {SPECIALTIES.map(spec => <option key={spec} value={spec}>{spec}</option>)}
                </select>
              </Field>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Age">
                  <input type="number" name="age" value={formData.age} onChange={handleChange} placeholder="e.g. 34" className={FIELD_CLASS} />
                </Field>
                <Field label="Gender">
                  <select name="gender" value={formData.gender} onChange={handleChange} className={FIELD_CLASS}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="City">
                <input type="text" name="city" value={formData.city} onChange={handleChange} placeholder="e.g. Bengaluru" className={FIELD_CLASS} />
              </Field>
              <Field label={isDoctor ? 'Practice Address' : 'Address Area'}>
                <input type="text" name="address" value={formData.address} onChange={handleChange} placeholder="e.g. Koramangala" className={FIELD_CLASS} />
              </Field>
            </div>

            {isDoctor && (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input type="checkbox" name="is_verified" checked={formData.is_verified} onChange={handleChange}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                {/* Defaults to checked, so the consequence is spelled out rather
                    than left to a silently pre-ticked box. */}
                <span className="text-sm font-semibold text-slate-700">
                  Verify and activate the account instantly
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                    Marks this provider as verified. Leave unchecked to send them
                    to the review queue instead.
                  </span>
                </span>
              </label>
            )}
          </div>

          <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="dark" disabled={submitting} aria-busy={submitting}>
              {submitting ? 'Saving…' : mode === 'create' ? `Create ${entity}` : 'Save changes'}
            </Button>
          </footer>
        </form>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * View 1 — Verification Queue
 * ──────────────────────────────────────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "3h ago" / "6d ago" for an ISO timestamp.
 *
 * A raw `created_at` is useless for triage — the admin's whole job on this
 * screen is deciding what to look at first, and the only signal that separates
 * a signup from last Tuesday is how long it has been waiting. Returns null for
 * a missing or unparseable value so callers can hide the chip entirely rather
 * than print "NaN ago".
 */
function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/**
 * The specialisation / city breakdown.
 *
 * These were static grey labels before: they showed a count that the admin
 * could read but not act on, and when the queue was empty they rendered the
 * two headings with nothing under them. They are now toggle buttons that feed
 * the same filter state as the search box, so the breakdown is a shortcut
 * instead of dead weight.
 */
function BreakdownChips({ label, counts, value, onChange }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  const shown = entries.slice(0, 6);
  const hidden = entries.length - shown.length;

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map(([item, count]) => {
          const active = value === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onChange(active ? '' : item)}
              aria-pressed={active}
              title={`${count} pending · ${active ? 'clear this filter' : `filter by ${item}`}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                active
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
              }`}
            >
              {item}
              <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
        {hidden > 0 && <span className="px-1 text-xs text-slate-400">+{hidden} more</span>}
      </div>
    </div>
  );
}

/**
 * Card-shaped loading placeholder.
 *
 * The queue used to render `TableSkeleton` here, which emits <tr> rows — but
 * the results area is a div-based card grid, not a table, so the browser
 * discarded every row and the screen showed an empty box while loading.
 */
function QueueSkeleton({ rowsCount = 6 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: rowsCount }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="mt-1.5 h-4 w-4 rounded bg-slate-200" />
            <div className="h-9 w-9 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3.5 w-32 rounded bg-slate-200" />
              <div className="h-3 w-44 rounded bg-slate-100" />
            </div>
          </div>
          <div className="mt-4 flex gap-1.5">
            <div className="h-6 w-28 rounded-full bg-slate-100" />
            <div className="h-6 w-20 rounded-full bg-slate-100" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-11 flex-1 rounded-xl bg-slate-100" />
            <div className="h-11 flex-1 rounded-xl bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function VerificationQueueView() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState(null);
  const [apiError, setApiError] = useState('');
  const [actionLog, setActionLog] = useState([]);
  const [pendingReject, setPendingReject] = useState(null);
  const [search, setSearch] = useState('');
  // This is a .jsx file, so the allowed values cannot be written as a TS
  // generic. `useState<'all' | '24h'>(...)` parses as a chain of comparison /
  // bitwise-or operators that evaluates to the number 0, and the array
  // destructuring above then throws "number 0 is not iterable". Keep the union
  // documented here instead: 'all' | '24h' | '7d' | '30d'.
  const [filter, setFilter] = useState('all');
  // The breakdown chips write to these, so they filter the list exactly like
  // the search box does rather than just decorating it.
  const [specialization, setSpecialization] = useState('');
  const [city, setCity] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const approvedCount = useMemo(() => actionLog.filter(e => e.action === 'Approved').length, [actionLog]);
  const rejectedCount = useMemo(() => actionLog.filter(e => e.action === 'Rejected').length, [actionLog]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/api/admin/users', { params: { role: 'doctor', is_verified: false, limit: 200 } });
        if (!cancelled) { setRows(res.data?.data || res.data || []); setApiError(''); }
      } catch (err) {
        if (!cancelled) setApiError(err.response?.data?.detail || 'Failed to load pending providers.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────
  const timeCutoff = useMemo(() => {
    const now = new Date();
    switch (filter) {
      case '24h': return new Date(now - 24 * 60 * 60 * 1000);
      case '7d':  return new Date(now - 7 * 24 * 60 * 60 * 1000);
      case '30d': return new Date(now - 30 * 24 * 60 * 60 * 1000);
      default:    return null;
    }
  }, [filter]);

  const matchedRows = useMemo(() => {
    // Step 1 — free-text plus the two breakdown chip filters.
    const q = search.trim().toLowerCase();
    return rows.filter(d => {
      if (specialization && (d.specialization || 'General') !== specialization) return false;
      if (city && (d.city || '—') !== city) return false;
      if (!q) return true;
      return (
        (d.full_name || '').toLowerCase().includes(q) ||
        (d.email || '').toLowerCase().includes(q) ||
        (d.specialization || '').toLowerCase().includes(q) ||
        (d.city || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, specialization, city]);

  // Step 2 — the age window, applied last.
  const filteredRows = useMemo(() => {
    if (filter === 'all' || !timeCutoff) return matchedRows;
    return matchedRows.filter(d => {
      const t = new Date(d.created_at).getTime();
      return !Number.isNaN(t) && t >= timeCutoff.getTime();
    });
  }, [matchedRows, filter, timeCutoff]);

  const hasActiveFilters =
    Boolean(search.trim()) || filter !== 'all' || specialization !== '' || city !== '';

  /**
   * Every filter change clears the selection.
   *
   * Otherwise a doctor who is checked and then filtered out of view stays in
   * `selectedIds`, and "Approve 3" fires against rows the admin can no longer
   * see. A silent stale selection is worse than losing the selection.
   */
  const applySearch = (value) => { setSearch(value); setSelectedIds(new Set()); };
  const applyFilter = (value) => { setFilter(value); setSelectedIds(new Set()); };
  const applySpecialization = (value) => { setSpecialization(value); setSelectedIds(new Set()); };
  const applyCity = (value) => { setCity(value); setSelectedIds(new Set()); };
  const clearFilters = () => {
    setSearch('');
    setFilter('all');
    setSpecialization('');
    setCity('');
    setSelectedIds(new Set());
  };

  /**
   * Count per age bucket, taken from `matchedRows` — i.e. before the age window
   * is applied. That is what makes the segmented control informative instead of
   * decorative: "7d · 3" tells the admin what clicking it will show.
   */
  const bucketCounts = useMemo(() => {
    const now = Date.now();
    const acc = { all: matchedRows.length, '24h': 0, '7d': 0, '30d': 0 };
    matchedRows.forEach(d => {
      const t = new Date(d.created_at).getTime();
      if (Number.isNaN(t)) return;
      const age = now - t;
      if (age <= DAY_MS) acc['24h'] += 1;
      if (age <= 7 * DAY_MS) acc['7d'] += 1;
      if (age <= 30 * DAY_MS) acc['30d'] += 1;
    });
    return acc;
  }, [matchedRows]);

  // Sorted by count so the busiest specialisation / city leads; the previous
  // version kept insertion order, which showed whichever signup happened to be
  // first rather than the most useful one.
  const specializationCounts = useMemo(() => {
    const acc = {};
    rows.forEach(d => {
      const spec = d.specialization || 'General';
      acc[spec] = (acc[spec] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(acc).sort((a, b) => b[1] - a[1]));
  }, [rows]);

  const cityCounts = useMemo(() => {
    const acc = {};
    rows.forEach(d => {
      const c = d.city || '—';
      acc[c] = (acc[c] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(acc).sort((a, b) => b[1] - a[1]));
  }, [rows]);

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every(d => selectedIds.has(d.id));
  const someVisibleSelected = filteredRows.some(d => selectedIds.has(d.id));

  const toggleSelected = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleSelectAllVisible = () => setSelectedIds(prev => {
    const next = new Set(prev);
    if (allVisibleSelected) filteredRows.forEach(d => next.delete(d.id));
    else filteredRows.forEach(d => next.add(d.id));
    return next;
  });

  // Approving is reversible, so it runs immediately. Rejecting permanently
  // deletes the account, so it opens ConfirmDialog instead — window.confirm
  // cannot be styled and, more to the point, cannot name what is lost.
  //
  // Both drop the id from `selectedIds` on success: the row leaves the queue,
  // so leaving it checked would leave the "N selected" bar describing rows
  // that no longer exist.
  const runApprove = async (doctor) => {
    setLoadingId(doctor.id);
    setApiError('');
    try {
      await api.put(`/api/admin/approve-doctor/${doctor.id}`);
      setRows(prev => prev.filter(d => d.id !== doctor.id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(doctor.id);
        return next;
      });
      setActionLog(prev => [{ ...doctor, action: 'Approved', time: new Date().toLocaleTimeString() }, ...prev]);
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to approve provider.');
    } finally {
      setLoadingId(null);
    }
  };

  const runReject = async (doctor) => {
    setPendingReject(null);
    setLoadingId(doctor.id);
    setApiError('');
    try {
      await api.delete(`/api/admin/reject-doctor/${doctor.id}`);
      setRows(prev => prev.filter(d => d.id !== doctor.id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(doctor.id);
        return next;
      });
      setActionLog(prev => [{ ...doctor, action: 'Rejected', time: new Date().toLocaleTimeString() }, ...prev]);
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to reject provider.');
    } finally {
      setLoadingId(null);
    }
  };

  /**
   * Approve every checked row, one request at a time.
   *
   * Sequential on purpose: `Promise.all` would fire N deletes/approves at once
   * and a single rejection would leave the admin guessing which half landed.
   * runApprove already records each outcome in the session log and surfaces
   * any failure through apiError.
   */
  const runBulkApprove = async () => {
    const targets = [...selectedIds]
      .map(id => rows.find(d => d.id === id))
      .filter(Boolean);
    if (targets.length === 0) { setSelectedIds(new Set()); return; }
    setBulkBusy(true);
    try {
      for (const doctor of targets) {
        await runApprove(doctor);
      }
    } finally {
      setBulkBusy(false);
      setSelectedIds(new Set());
    }
  };

  const runBulkReject = async (ids) => {
    setPendingReject(null);
    setBulkBusy(true);
    setApiError('');
    try {
      for (const id of ids) {
        await api.delete(`/api/admin/reject-doctor/${id}`);
      }
      setRows(prev => prev.filter(d => !ids.includes(d.id)));
      // One log line per account: the old code logged N identical "Bulk
      // rejected" rows with no name, which read as N failures.
      const stamp = new Date().toLocaleTimeString();
      setActionLog(prev => [
        ...prev,
        ...ids
          .map(id => rows.find(d => d.id === id))
          .filter(Boolean)
          .map(doctor => ({ ...doctor, action: 'Rejected', time: stamp })),
      ]);
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to bulk reject.');
    } finally {
      setBulkBusy(false);
      setPendingReject(null);
      setSelectedIds(new Set());
    }
  };

  const refetchQueue = async () => {
    setLoading(true);
    setApiError('');
    try {
      const res = await api.get('/api/admin/users', { params: { role: 'doctor', is_verified: false, limit: 200 } });
      setRows(res.data?.data || res.data || []);
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to refresh queue.');
    } finally {
      setLoading(false);
    }
  };

  const runAction = (doctor, approve) =>
    approve ? runApprove(doctor) : setPendingReject(doctor);

  const pendingRejectsAll = pendingReject?.id === null;
  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-5">
      <Helmet>
        <title>Admin Panel</title>
        <meta name="description" content="Manage doctors, patients, and platform operations through the MedAssist admin panel." />
      </Helmet>

      {/* "Awaiting Review" is the unfiltered queue total. It used to read
          filteredRows.length, so the headline number silently changed every
          time the admin typed in the search box — which made it impossible to
          trust. The filtered count now lives in the hint line instead. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Awaiting Review"
          value={rows.length}
          hint={
            loading
              ? 'Loading the queue…'
              : hasActiveFilters
                ? `${filteredRows.length} match the current filters`
                : 'Applications not yet reviewed'
          }
          accent="text-amber-500"
          icon="clock"
          iconTone="bg-amber-50 text-amber-700"
          loading={loading}
        />
        <StatCard
          label="Approved This Session"
          value={approvedCount}
          hint="Since you opened this queue"
          accent="text-emerald-600"
          icon="check"
          iconTone="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          label="Rejected This Session"
          value={rejectedCount}
          hint="Accounts deleted permanently"
          accent="text-red-600"
          icon="x"
          iconTone="bg-red-50 text-red-600"
        />
      </div>

      {apiError && <ErrorBanner message={apiError} />}

      {/* Queue and session activity sit side by side on wide screens so the
          audit trail is visible while the admin works, instead of being pushed
          a full screen below the fold. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <DetailCard
          title="Pending Provider Applications"
          subtitle={loading ? 'Loading applications…' : 'New doctors cannot take bookings until you approve them'}
          icon="clipboard"
          bodyClassName="p-0"
          actions={
            !loading && (
              <Badge tone={filteredRows.length ? 'pending' : 'approved'} icon={filteredRows.length ? 'clock' : 'check'}>
                {filteredRows.length} pending
              </Badge>
            )
          }
        >
          {/* ── Toolbar: search · age window · refresh ──────────────────────
              These were three separate full-width rows (a 256px search box, then
              four enormous "pill" buttons stretched by grid-cols-4). One row
              that wraps keeps them related and stops the controls from
              competing with the queue itself. */}
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={e => applySearch(e.target.value)}
                placeholder="Search by name, email, specialty or city…"
                aria-label="Search pending providers"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => applySearch('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Icon name="x" className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterTabs
                value={filter}
                onChange={applyFilter}
                ariaLabel="Filter by how long an application has been waiting"
                options={[
                  { value: 'all', label: 'All', count: bucketCounts.all },
                  { value: '24h', label: '24h', count: bucketCounts['24h'] },
                  { value: '7d', label: '7d', count: bucketCounts['7d'] },
                  { value: '30d', label: '30d', count: bucketCounts['30d'] },
                ]}
              />
              {/* `variant="outline"` does not exist in BUTTON_STYLES, so this
                  previously resolved to no classes at all and rendered as bare
                  bold text with no button chrome. */}
              <Button variant="ghost" icon="refresh" onClick={refetchQueue} disabled={loading} aria-busy={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          </div>

          {/* Breakdown chips — hidden entirely when the queue is empty, which
              is when they previously left two bare headings floating. */}
          {rows.length > 0 && (
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3.5 lg:flex-row lg:items-start lg:gap-8">
              <BreakdownChips
                label="Specialization"
                counts={specializationCounts}
                value={specialization}
                onChange={applySpecialization}
              />
              <BreakdownChips
                label="City"
                counts={cityCounts}
                value={city}
                onChange={applyCity}
              />
            </div>
          )}

          {/* Selection bar. Only mounted while something is checked, so the
              bulk actions appear next to the cards they affect. */}
          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-blue-100 bg-blue-50 px-5 py-3">
              <p className="text-sm font-bold text-blue-900">
                {selectedCount} selected
              </p>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  variant="success"
                  icon="check"
                  disabled={bulkBusy}
                  aria-busy={bulkBusy}
                  onClick={runBulkApprove}
                >
                  {bulkBusy ? 'Approving…' : `Approve${selectedCount > 1 ? ` ${selectedCount}` : ''}`}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon="x"
                  disabled={bulkBusy}
                  onClick={() => setPendingReject({
                    id: null,
                    name: `${selectedCount} provider${selectedCount > 1 ? 's' : ''}`,
                  })}
                >
                  Reject{selectedCount > 1 ? ` ${selectedCount}` : ''}
                </Button>
              </div>
            </div>
          )}

          <div className="px-5 py-4">
            {loading ? (
              <>
                <p role="status" className="sr-only">Loading pending applications</p>
                <QueueSkeleton />
              </>
            ) : filteredRows.length === 0 ? (
              hasActiveFilters ? (
                <EmptyState
                  icon="search"
                  title="No applications match these filters"
                  message={`${rows.length} application${rows.length === 1 ? '' : 's'} in the queue, none matching the current search and filters.`}
                  action={
                    <Button variant="ghost" icon="x" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon="check"
                  title="Queue is clear"
                  message="No doctor applications are waiting for review. New registrations appear here automatically."
                />
              )
            ) : (
              <>
                <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex cursor-pointer select-none items-center gap-2.5 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      // Mixed state, which React cannot express via `checked`
                      // alone — the old header had no select-all at all.
                      ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                      onChange={toggleSelectAllVisible}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    Select all {filteredRows.length} shown
                  </label>
                  <p className="text-xs tabular-nums text-slate-400">
                    {filteredRows.length} of {rows.length} pending
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {filteredRows.map(doctor => {
                    const isSelected = selectedIds.has(doctor.id);
                    const isBusy = loadingId === doctor.id;
                    const name = doctor.full_name || 'Unnamed provider';
                    const waiting = timeAgo(doctor.created_at);
                    const isStale = waiting !== null && waiting.endsWith('d') && parseInt(waiting, 10) >= 7;
                    const years = Number(doctor.experience_years);

                    return (
                      // The card is the click target again: tapping anywhere
                      // opens the full application. It keeps role/tabIndex/key
                      // handling so it is not mouse-only, and the two inner
                      // buttons stop propagation so they do not also open it.
                      // (A <button> inside a <button> would be invalid HTML,
                      // which is why this is a div with role="button".)
                      <div
                        key={doctor.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/admin/doctors/${doctor.id}`)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                            e.preventDefault();
                            navigate(`/admin/doctors/${doctor.id}`);
                          }
                        }}
                        aria-label={`Review the application from ${name}`}
                        className={`flex flex-col rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                          isSelected
                            ? 'border-blue-300 bg-blue-50/50 ring-2 ring-blue-500/20'
                            : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(doctor.id)}
                            onClick={e => e.stopPropagation()}
                            aria-label={`Select ${name}`}
                            className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          <Avatar name={name} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">{name}</p>
                            <p className="truncate text-xs text-slate-500">{doctor.email || 'No email on file'}</p>
                          </div>
                          {waiting && (
                            <span
                              title={`Applied ${doctor.created_at}`}
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                isStale ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {waiting}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge tone="info" icon="badge">{doctor.specialization || 'General Physician'}</Badge>
                          {doctor.city && <Badge tone="slate" icon="pin">{doctor.city}</Badge>}
                          {Number.isFinite(years) && years > 0 && (
                            <Badge tone="teal" icon="award">{years} yrs</Badge>
                          )}
                        </div>

                        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3.5">
                          <Button
                            size="sm"
                            variant="brand"
                            icon="check"
                            className="flex-1"
                            disabled={isBusy}
                            onClick={e => { e.stopPropagation(); runApprove(doctor); }}
                            aria-label={`Approve ${name}`}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            icon="x"
                            className="flex-1"
                            disabled={isBusy}
                            onClick={e => { e.stopPropagation(); runAction(doctor, false); }}
                            aria-label={`Reject ${name}`}
                          >
                            Reject
                          </Button>
                        </div>

                        {/* Only the row being saved is disabled. The previous
                            `disabled={!!loadingId}` froze every card in the
                            queue the moment any single approve started. */}
                        {isBusy && (
                          <p role="status" className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                            Saving…
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </DetailCard>

        <DetailCard
          title="Session Activity"
          subtitle="Approvals and rejections you have made"
          icon="clipboard"
          actions={actionLog.length > 0 && <Badge tone="slate">{actionLog.length}</Badge>}
        >
          {actionLog.length === 0 ? (
            <EmptyState
              icon="clipboard"
              className="px-4 py-10"
              title="No activity yet"
              message="Approve or reject a provider and the outcome is listed here for this session."
            />
          ) : (
            <ul className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
              {actionLog.map((entry, i) => (
                <li key={`${entry.id ?? 'bulk'}-${i}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      entry.action === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                    }`}
                  >
                    <Icon name={entry.action === 'Approved' ? 'check' : 'x'} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{entry.full_name || 'Unnamed provider'}</p>
                    {/* Bulk-reject log rows carry no email; the old markup
                        printed "undefined" underneath them. */}
                    {entry.email && <p className="truncate text-xs text-slate-500">{entry.email}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={entry.action === 'Approved' ? 'approved' : 'rejected'}>{entry.action}</Badge>
                    <p className="mt-1 text-xs tabular-nums text-slate-400">{entry.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DetailCard>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingReject)}
        onClose={() => setPendingReject(null)}
        onConfirm={() => {
          if (pendingRejectsAll) {
            runBulkReject([...selectedIds]);
          } else {
            runReject(pendingReject);
          }
        }}
        title={pendingRejectsAll
          ? `Reject and delete ${pendingReject?.name || 'these providers'}?`
          : `Reject and delete ${pendingReject?.full_name || 'this provider'}?`}
        body={pendingRejectsAll
          ? `Reject ${selectedCount} provider${selectedCount === 1 ? '' : 's'}? Their accounts, appointments and consultation records are deleted permanently, and they must register again from scratch.`
          : 'The application is permanently deleted. Their account, submitted qualifications and registration details cannot be recovered, and they must register again from scratch.'}
        confirmLabel="Reject and delete"
        cancelLabel="Keep application"
        tone="danger"
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * View 2 — Active Doctors
 * ──────────────────────────────────────────────────────────────────────────── */

function ActiveDoctorsView() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/api/admin/users', { params: { role: 'doctor', is_verified: true, limit: 200 } });
        if (!cancelled) { setRows(res.data?.data || res.data || []); setApiError(''); }
      } catch (err) {
        if (!cancelled) setApiError(err.response?.data?.detail || 'Failed to load active doctors.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async (formData) => {
    setSubmitting(true);
    setModalError('');
    try {
      const res = await api.post('/api/admin/users', { ...formData, role: 'doctor' });
      if (res.data.is_verified) setRows(prev => [{ ...res.data, full_name: res.data.full_name }, ...prev]);
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
      const res = await api.put(`/api/admin/users/${selectedUser.id}`, formData, { params: { role: 'doctor' } });
      // The update endpoint returns a compact record; merge it onto the row so
      // the table keeps every column it already had.
      setRows(prev => prev.map(d => (d.id === selectedUser.id ? { ...d, ...res.data } : d)));
      setIsModalOpen(false);
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to update doctor details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    setPendingDelete({ id, name });
  };

  const runDelete = async (id) => {
    setPendingDelete(null);
    setApiError('');
    try {
      await api.delete(`/api/admin/users/${id}`, { params: { role: 'doctor' } });
      setRows(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to delete doctor.');
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = rows.filter(d =>
    (d.full_name || '').toLowerCase().includes(q) ||
    (d.specialization || '').toLowerCase().includes(q) ||
    (d.city || '').toLowerCase().includes(q)
  );
  const cities = useMemo(() => [...new Set(rows.map(d => d.city).filter(Boolean))], [rows]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Active Doctors" value={rows.length} accent="text-blue-600" icon="stethoscope" iconTone="bg-blue-50 text-blue-600" loading={loading} />
        <StatCard label="Cities Covered" value={cities.length} accent="text-indigo-600" icon="pin" iconTone="bg-indigo-50 text-indigo-600" loading={loading} />
        <StatCard label="Showing Results" value={filtered.length} accent="text-emerald-700" icon="filter" iconTone="bg-emerald-50 text-emerald-700" loading={loading} />
      </div>

      {apiError && <ErrorBanner message={apiError} />}

      <DetailCard
        title="Active Providers"
        subtitle="Select a doctor to open their full record, schedule and appointments"
        icon="stethoscope"
        actions={
          <>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, specialty, city…"
                aria-label="Search doctors"
                className="w-56 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <Button variant="brand" icon="plus" onClick={() => { setSelectedUser(null); setModalMode('create'); setModalError(''); setIsModalOpen(true); }}>
              Add Doctor
            </Button>
          </>
        }
        bodyClassName=""
      >
        <div className="max-h-[calc(100dvh-320px)] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
              <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Doctor</th>
                <th className="px-5 py-3">Specialization</th>
                <th className="px-5 py-3">City</th>
                <th className="px-5 py-3">Registered</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton cols={5} rowsCount={4} hasAvatar />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon="stethoscope"
                      title={search ? 'No doctors match your search' : 'No active doctors yet'}
                      message={search ? 'Try a different name, specialty or city.' : 'Approved doctors will appear here.'}
                    />
                  </td>
                </tr>
              ) : filtered.map(doc => (
                <tr key={doc.id} className="group transition-colors hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <button
                      onClick={() => navigate(`/admin/doctors/${doc.id}`)}
                      className="flex items-center gap-3 text-left"
                      title="Open full doctor record"
                    >
                      <Avatar name={doc.full_name} colorClass="bg-blue-100 text-blue-700" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800 underline-offset-2 group-hover:text-blue-600 group-hover:underline">
                          {doc.full_name}
                        </p>
                        <p className="truncate text-xs text-slate-500">{doc.email}</p>
                      </div>
                    </button>
                  </td>
                  <td className="px-5 py-4"><Badge tone="info">{doc.specialization || 'General'}</Badge></td>
                  <td className="px-5 py-4 text-slate-600">{doc.city || '—'}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">
                    {doc.created_at ? formatDateShort(doc.created_at.slice(0, 10)) : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="brand" icon="chevronRight" onClick={() => navigate(`/admin/doctors/${doc.id}`)} title="View full record">
                        View
                      </Button>
                      <Button size="sm" variant="ghost" icon="edit" onClick={() => { setSelectedUser(doc); setModalMode('edit'); setModalError(''); setIsModalOpen(true); }} title="Edit doctor" />
                      <Button size="sm" variant="danger" icon="trash" onClick={() => handleDelete(doc.id, doc.full_name)} title="Delete doctor" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailCard>

      <UserFormModal
        key={`${isModalOpen}-${modalMode}-${selectedUser?.id ?? 'new'}`}
        isOpen={isModalOpen} mode={modalMode} role="doctor" user={selectedUser}
        onClose={() => setIsModalOpen(false)}
        onSubmit={modalMode === 'create' ? handleCreate : handleUpdate}
        submitting={submitting} error={modalError}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => runDelete(pendingDelete.id)}
        title={`Permanently delete ${pendingDelete?.name || 'this doctor'}?`}
        body="The account is deleted along with every appointment, consultation record and prescription they have written. Patients can no longer book with them. This cannot be undone."
        confirmLabel="Delete permanently"
        cancelLabel="Keep account"
        tone="danger"
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * View 3 — Patient Directory
 * ──────────────────────────────────────────────────────────────────────────── */

function PatientDirectoryView() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/api/admin/users', { params: { role: 'patient', limit: 200 } });
        if (!cancelled) { setRows(res.data?.data || res.data || []); setApiError(''); }
      } catch (err) {
        if (!cancelled) setApiError(err.response?.data?.detail || 'Failed to load patients.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async (formData) => {
    setSubmitting(true);
    setModalError('');
    try {
      const res = await api.post('/api/admin/users', { ...formData, role: 'patient' });
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
      const res = await api.put(`/api/admin/users/${selectedUser.id}`, formData, { params: { role: 'patient' } });
      setRows(prev => prev.map(p => (p.id === selectedUser.id ? { ...p, ...res.data } : p)));
      setIsModalOpen(false);
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to update patient details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    setPendingDelete({ id, name });
  };

  const runDelete = async (id) => {
    setPendingDelete(null);
    setApiError('');
    try {
      await api.delete(`/api/admin/users/${id}`, { params: { role: 'patient' } });
      setRows(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setApiError(err.response?.data?.detail || 'Failed to delete patient.');
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = rows.filter(p =>
    (p.full_name || '').toLowerCase().includes(q) ||
    (p.email || '').toLowerCase().includes(q) ||
    (p.city || '').toLowerCase().includes(q)
  );
  const cities = useMemo(() => [...new Set(rows.map(p => p.city).filter(Boolean))], [rows]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Registered Patients" value={rows.length} accent="text-violet-600" icon="users" iconTone="bg-violet-50 text-violet-600" loading={loading} />
        <StatCard label="Cities" value={cities.length} accent="text-teal-700" icon="pin" iconTone="bg-teal-50 text-teal-700" loading={loading} />
        <StatCard label="Showing Results" value={filtered.length} accent="text-blue-600" icon="filter" iconTone="bg-blue-50 text-blue-600" loading={loading} />
      </div>

      {apiError && <ErrorBanner message={apiError} />}

      <DetailCard
        title="Patient Directory"
        subtitle="Select a patient to open their full profile and appointment history"
        icon="users"
        actions={
          <>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, email, city…"
                aria-label="Search patients"
                className="w-56 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>
            <Button variant="violet" icon="plus" onClick={() => { setSelectedUser(null); setModalMode('create'); setModalError(''); setIsModalOpen(true); }}>
              Add Patient
            </Button>
          </>
        }
        bodyClassName=""
      >
        {loading ? (
          <ListSkeleton rowsCount={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="users"
            title={search ? 'No patients match your search' : 'No patients registered yet'}
            message={search ? 'Try a different name, email or city.' : 'Registered patients will appear here.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(patient => (
              <li key={patient.id} className="group flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                <button
                  onClick={() => navigate(`/admin/patients/${patient.id}`)}
                  className="flex min-w-0 items-center gap-4 text-left"
                  title="Open full patient record"
                >
                  <Avatar name={patient.full_name} colorClass="bg-violet-100 text-violet-700" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800 underline-offset-2 group-hover:text-violet-600 group-hover:underline">
                      {patient.full_name || 'Unknown Patient'}
                    </p>
                    <p className="truncate text-xs text-slate-500">{patient.email}</p>
                  </div>
                </button>

                <div className="flex flex-wrap items-center justify-between gap-4 sm:ml-auto sm:justify-end">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {patient.city && <Badge tone="slate" icon="pin">{patient.city}</Badge>}
                    {patient.age && <Badge tone="slate">Age {patient.age}</Badge>}
                    {patient.gender && <Badge tone="indigo">{patient.gender}</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="violet" icon="chevronRight" onClick={() => navigate(`/admin/patients/${patient.id}`)} title="View full record">
                      View
                    </Button>
                    <Button size="sm" variant="ghost" icon="edit" onClick={() => { setSelectedUser(patient); setModalMode('edit'); setModalError(''); setIsModalOpen(true); }} title="Edit patient" />
                    <Button size="sm" variant="danger" icon="trash" onClick={() => handleDelete(patient.id, patient.full_name)} title="Delete patient" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      <UserFormModal
        key={`${isModalOpen}-${modalMode}-${selectedUser?.id ?? 'new'}`}
        isOpen={isModalOpen} mode={modalMode} role="patient" user={selectedUser}
        onClose={() => setIsModalOpen(false)}
        onSubmit={modalMode === 'create' ? handleCreate : handleUpdate}
        submitting={submitting} error={modalError}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => runDelete(pendingDelete.id)}
        title={`Permanently delete ${pendingDelete?.name || 'this patient'}?`}
        body="The account is deleted along with every appointment, consultation record and prescription they hold. Their booking history and saved clinic details are lost. This cannot be undone."
        confirmLabel="Delete permanently"
        cancelLabel="Keep account"
        tone="danger"
      />
    </div>
  );
}
