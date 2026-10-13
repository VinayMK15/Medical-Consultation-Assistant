import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../shared/utils/api';
import AdminLayout from './AdminLayout';
import ConfirmDialog from '../../shared/components/ConfirmDialog';
import AppointmentTable from './components/AppointmentTable';
import SchedulePanel from './components/SchedulePanel';
import Icon from './components/Icon';
import {
  Avatar, Badge, Button, DetailCard, ErrorBanner, InfoField,
  PageSkeleton, SectionLabel, StatCard,
} from './components/AdminUI';
import { formatDateShort } from '../../shared/utils/datetime';

/**
 * Full record for one doctor: profile, practice, working hours and the full
 * appointment history.
 *
 * Two independent panels (profile / schedule) plus the appointment table each
 * fetch on their own, so a slow schedule endpoint never blocks the profile
 * from painting. Mutations — hours and active status — patch the panel that
 * owns the data and leave the others alone.
 *
 * Vacation days are read-only context here and are not shown at all; the
 * doctor owns their own calendar.
 */

export default function DoctorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  const [schedule, setSchedule] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [appointments, setAppointments] = useState([]);
  const [counts, setCounts] = useState({});
  const [apptLoading, setApptLoading] = useState(true);
  const [apptError, setApptError] = useState('');
  const [apptFilter, setApptFilter] = useState('all');

  const [actionError, setActionError] = useState('');
  const [togglingActive, setTogglingActive] = useState(false);
  // `null` = dialog closed; `true` = reactivating; `false` = deactivating.
  const [pendingToggle, setPendingToggle] = useState(null);

  const goBack = useCallback(() => navigate('/admin/dashboard?tab=doctors'), [navigate]);

  // ── Load profile ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        const res = await api.get(`/api/admin/users/${id}`, { params: { role: 'doctor' } });
        if (!cancelled) { setDoctor(res.data); setProfileError(''); }
      } catch (err) {
        if (!cancelled) setProfileError(err.response?.data?.detail || 'Could not load this doctor.');
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ── Load schedule ─────────────────────────────────────────────────────────
  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const res = await api.get(`/api/admin/doctors/${id}/schedule`);
      setSchedule(res.data);
      setScheduleError('');
    } catch (err) {
      setScheduleError(err.response?.data?.detail || 'Could not load the schedule.');
    } finally {
      setScheduleLoading(false);
    }
  }, [id]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  // ── Load appointments ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setApptLoading(true);
      try {
        const res = await api.get(`/api/admin/users/${id}/appointments`, {
          params: { role: 'doctor', limit: 500 },
        });
        if (!cancelled) {
          setAppointments(res.data?.data || []);
          setCounts(res.data?.counts || {});
          setApptError('');
        }
      } catch (err) {
        if (!cancelled) setApptError(err.response?.data?.detail || 'Could not load appointments.');
      } finally {
        if (!cancelled) setApptLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveSchedule = async (draft) => {
    setSavingSchedule(true);
    setActionError('');
    try {
      await api.put(`/api/admin/doctors/${id}/schedule`, draft);
      await loadSchedule();
      return true;
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Could not update the schedule.');
      return false;
    } finally {
      setSavingSchedule(false);
    }
  };

  const goToPatient = ({ id: patientId }) => navigate(`/admin/patients/${patientId}`);

  /**
   * Flip is_active in place. The detail endpoint is re-read rather than the
   * local object patched, so the admin always sees the server's version.
   */
  const toggleActive = async () => {
    const next = !doctor.is_active;
    setPendingToggle(next);
  };

  const runToggle = async (next) => {
    setPendingToggle(null);
    setTogglingActive(true);
    setActionError('');
    try {
      await api.put(`/api/admin/users/${id}`, { is_active: next }, { params: { role: 'doctor' } });
      const res = await api.get(`/api/admin/users/${id}`, { params: { role: 'doctor' } });
      setDoctor(res.data);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Could not change the account status.');
    } finally {
      setTogglingActive(false);
    }
  };

  const stats = doctor?.appointment_stats || {};
  const headerSubtitle = useMemo(() => {
    if (profileLoading) return 'Loading doctor record…';
    if (!doctor) return '';
    return `${doctor.specialization} · ${doctor.city || 'Location not set'}`;
  }, [doctor, profileLoading]);

  return (
    <AdminLayout
      activeTab="doctors"
      title={doctor?.full_name || 'Doctor Profile'}
      subtitle={headerSubtitle}
      onBack={goBack}
      backLabel="All Doctors"
      actions={
        <Button
          variant="ghost"
          icon="printer"
          className="hidden sm:inline-flex"
          onClick={() => window.print()}
          title="Print this profile"
        >
          Print
        </Button>
      }
    >
      {profileError ? (
        <div className="space-y-5">
          <ErrorBanner message={profileError} />
          <Button variant="ghost" icon="chevronLeft" onClick={goBack}>Back to Active Doctors</Button>
        </div>
      ) : profileLoading ? (
        <PageSkeleton />
      ) : (
        <div className="space-y-6">

          {/* ── Identity banner ── */}
          <ProfileHeader
            doctor={doctor}
            stats={stats}
            onToggleActive={toggleActive}
            togglingActive={togglingActive}
          />

          {actionError && <ErrorBanner message={actionError} />}

          {/* ── Metric row ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Total Appointments" value={stats.total ?? 0} accent="text-blue-600"
              icon="clipboard" iconTone="bg-blue-50 text-blue-600"
              hint="All time"
            />
            <StatCard
              label="Awaiting Consultation" value={stats.pending ?? 0} accent="text-amber-500"
              icon="clock" iconTone="bg-amber-50 text-amber-700"
              hint="Pending status"
            />
            <StatCard
              label="Completed" value={stats.completed ?? 0} accent="text-emerald-500"
              icon="check" iconTone="bg-emerald-50 text-emerald-700"
              hint="With prescription"
            />
            <StatCard
              label="Cancelled" value={stats.cancelled ?? 0} accent="text-red-500"
              icon="x" iconTone="bg-red-50 text-red-600"
              hint="By patient or doctor"
            />
          </div>

          {/* ── Profile grid ── */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="space-y-5">
              <DetailCard title="Personal Information" subtitle="Contact and credential details" icon="userCircle">
                <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                  <div>
                    <InfoField label="Full Name" value={doctor.full_name} icon="userCircle" />
                    <InfoField label="Email" value={doctor.email} icon="mail" />
                    <InfoField label="Phone" value={doctor.phone} icon="phone" />
                    <InfoField label="License Number" value={doctor.license_number} icon="badge" mono />
                  </div>
                  <div>
                    <InfoField label="Specialization" value={doctor.specialization} icon="card" />
                    <InfoField label="Experience" value={doctor.experience_years ? `${doctor.experience_years} years` : null} icon="award" />
                    <InfoField label="Qualifications" value={doctor.qualifications} icon="document" />
                    <InfoField
                      label="Registered On"
                      value={doctor.created_at ? formatDateShort(doctor.created_at.slice(0, 10)) : null}
                      icon="calendar"
                    />
                  </div>
                </div>
                {doctor.bio && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <SectionLabel>About</SectionLabel>
                    <p className="text-sm leading-6 text-slate-600">{doctor.bio}</p>
                  </div>
                )}
              </DetailCard>

              <DetailCard title="Practice Information" subtitle="Clinic location and fees" icon="building">
                <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                  <div>
                    <InfoField label="Practice City" value={doctor.practice_city} icon="pin" />
                    <InfoField label="Practice Address" value={doctor.practice_address} icon="pin" />
                  </div>
                  <div>
                    <InfoField
                      label="Consultation Fee"
                      value={doctor.consultation_fee ? `₹${Number(doctor.consultation_fee).toLocaleString('en-IN')}` : null}
                      icon="card"
                    />
                    <InfoField
                      label="Map Location"
                      value={doctor.practice_lat && doctor.practice_lng ? 'Open in Maps' : null}
                      icon="externalLink"
                      href={
                        doctor.practice_lat && doctor.practice_lng
                          ? `https://www.google.com/maps/search/?api=1&query=${doctor.practice_lat},${doctor.practice_lng}`
                          : undefined
                      }
                    />
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <SectionLabel>Account Status</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={doctor.is_verified ? 'approved' : 'pending'} icon={doctor.is_verified ? 'shield' : 'clock'}>
                      {doctor.is_verified ? 'Verified by admin' : 'Awaiting verification'}
                    </Badge>
                    <Badge tone={doctor.is_active ? 'info' : 'slate'} icon={doctor.is_active ? 'check' : 'x'}>
                      {doctor.is_active ? 'Accepting bookings' : 'Deactivated'}
                    </Badge>
                    <Badge tone="slate" icon="card">{doctor.specialization}</Badge>
                  </div>
                </div>
              </DetailCard>
            </div>

            {/* Right column: working hours only — vacation is the doctor's own setting. */}
            <div className="space-y-5">
              <SchedulePanel
                schedule={schedule}
                loading={scheduleLoading}
                error={scheduleError}
                saving={savingSchedule}
                onSave={saveSchedule}
              />
            </div>
          </div>

          {/* ── Appointments ── */}
          <AppointmentTable
            appointments={appointments}
            counts={counts}
            loading={apptLoading}
            error={apptError}
            perspective="doctor"
            filter={apptFilter}
            onFilterChange={setApptFilter}
            onSelectPerson={goToPatient}
          />
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingToggle !== null}
        onClose={() => setPendingToggle(null)}
        onConfirm={() => runToggle(pendingToggle)}
        title={pendingToggle
          ? `Reactivate ${doctor?.full_name || 'this doctor'}?`
          : `Deactivate ${doctor?.full_name || 'this doctor'}?`}
        body={pendingToggle
          ? 'They reappear in patient search and can take new bookings immediately. Any schedule they had set stays as it is.'
          : 'Patients stop seeing them in search and no new bookings can be made. Their existing appointments and consultation records are kept, and this can be reversed at any time.'}
        confirmLabel={pendingToggle ? 'Reactivate' : 'Deactivate'}
        cancelLabel="Cancel"
        tone="danger"
      />
    </AdminLayout>
  );
}

/* ── Identity banner ───────────────────────────────────────────────────────── */

function ProfileHeader({ doctor, stats, onToggleActive, togglingActive }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center lg:p-6">
        <Avatar name={doctor.full_name} size="xl" colorClass="bg-blue-100 text-blue-700" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-bold tracking-tight text-slate-950">{doctor.full_name}</h2>
            <Badge tone={doctor.is_verified ? 'approved' : 'pending'} icon={doctor.is_verified ? 'check' : 'clock'}>
              {doctor.is_verified ? 'Verified' : 'Pending'}
            </Badge>
            <Badge tone={doctor.is_active ? 'info' : 'rejected'}>{doctor.is_active ? 'Active' : 'Inactive'}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {doctor.specialization}
            {doctor.experience_years ? ` · ${doctor.experience_years} years experience` : ''}
            {doctor.practice_city ? ` · ${doctor.practice_city}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="mail" className="h-4 w-4 text-slate-500" />
              {doctor.email}
            </span>
            {doctor.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="phone" className="h-4 w-4 text-slate-500" />
                {doctor.phone}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clipboard" className="h-4 w-4 text-slate-500" />
              {stats.total ?? 0} appointment{(stats.total ?? 0) === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <Button
            variant={doctor.is_active ? 'danger' : 'success'}
            icon={doctor.is_active ? 'x' : 'check'}
            onClick={onToggleActive}
            disabled={togglingActive}
            title={doctor.is_active ? 'Stop this doctor appearing in patient search' : 'Allow this doctor to take bookings again'}
          >
            {togglingActive ? 'Saving…' : doctor.is_active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      </div>
    </div>
  );
}