import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../shared/utils/api';
import AdminLayout from './AdminLayout';
import AppointmentTable from './components/AppointmentTable';
import Icon from './components/Icon';
import {
  Avatar, Badge, Button, DetailCard, ErrorBanner, InfoField,
  Notice, PageSkeleton, StatCard,
} from './components/AdminUI';
import { formatDateShort } from '../../shared/utils/datetime';

/**
 * Full record for one patient: profile, contact details, location and the full
 * appointment history.
 *
 * Mirrors DoctorDetail so the two read identically — same banner, same metric
 * row, same appointment table — with the practice column set swapped for
 * location.
 *
 * Deliberately read-only. Notification preferences and account settings belong
 * to the patient, who manages them from their own profile, so an admin has no
 * reason to see or change them here.
 */

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  const [appointments, setAppointments] = useState([]);
  const [counts, setCounts] = useState({});
  const [apptLoading, setApptLoading] = useState(true);
  const [apptError, setApptError] = useState('');
  const [apptFilter, setApptFilter] = useState('all');

  const goBack = useCallback(() => navigate('/admin/dashboard?tab=patients'), [navigate]);

  // ── Load profile ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        const res = await api.get(`/api/admin/users/${id}`, { params: { role: 'patient' } });
        if (!cancelled) { setPatient(res.data); setProfileError(''); }
      } catch (err) {
        if (!cancelled) setProfileError(err.response?.data?.detail || 'Could not load this patient.');
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ── Load appointments ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setApptLoading(true);
      try {
        const res = await api.get(`/api/admin/users/${id}/appointments`, {
          params: { role: 'patient', limit: 500 },
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

  const goToDoctor = ({ id: doctorId }) => navigate(`/admin/doctors/${doctorId}`);

  const stats = patient?.appointment_stats || {};

  const headerSubtitle = useMemo(() => {
    if (profileLoading) return 'Loading patient record…';
    if (!patient) return '';
    const bits = [];
    if (patient.age) bits.push(`Age ${patient.age}`);
    if (patient.gender) bits.push(patient.gender);
    if (patient.city) bits.push(patient.city);
    return bits.join(' · ') || 'Patient';
  }, [patient, profileLoading]);

  return (
    <AdminLayout
      activeTab="patients"
      title={patient?.full_name || 'Patient Profile'}
      subtitle={headerSubtitle}
      onBack={goBack}
      backLabel="All Patients"
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
          <Button variant="ghost" icon="chevronLeft" onClick={goBack}>Back to Patient Directory</Button>
        </div>
      ) : profileLoading ? (
        <PageSkeleton />
      ) : (
        <div className="space-y-6">

          {/* ── Identity banner ── */}
          <PatientHeader patient={patient} stats={stats} />

          {/* ── Metric row ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Total Appointments" value={stats.total ?? 0} accent="text-violet-600"
              icon="clipboard" iconTone="bg-violet-50 text-violet-600"
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
            <DetailCard title="Personal Information" subtitle="Contact and demographics" icon="userCircle">
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <div>
                  <InfoField label="Full Name" value={patient.full_name} icon="userCircle" />
                  <InfoField label="Email" value={patient.email} icon="mail" />
                  <InfoField label="Phone" value={patient.phone} icon="phone" />
                </div>
                <div>
                  <InfoField label="Age" value={patient.age} icon="award" />
                  <InfoField label="Gender" value={patient.gender} icon="info" />
                  <InfoField
                    label="Registered On"
                    value={patient.created_at ? formatDateShort(patient.created_at.slice(0, 10)) : null}
                    icon="calendar"
                  />
                </div>
              </div>
            </DetailCard>

            <DetailCard title="Location" subtitle="Home city and address on record" icon="pin">
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <div>
                  <InfoField label="City" value={patient.home_city} icon="pin" />
                  <InfoField label="Address" value={patient.home_address} icon="pin" />
                </div>
                <div>
                  <InfoField
                    label="Map Location"
                    value={patient.home_lat && patient.home_lng ? 'Open in Maps' : null}
                    icon="externalLink"
                    href={
                      patient.home_lat && patient.home_lng
                        ? `https://www.google.com/maps/search/?api=1&query=${patient.home_lat},${patient.home_lng}`
                        : undefined
                    }
                  />
                  <InfoField label="Coordinates On File" value={patient.home_lat && patient.home_lng ? 'Yes' : 'Not resolved'} icon="check" />
                </div>
              </div>
              {!patient.home_lat && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <Notice tone="info" title="Map coordinates missing">
                    The address is saved but has not been geocoded yet, so distance-based doctor search will skip this patient.
                  </Notice>
                </div>
              )}
            </DetailCard>
          </div>

          {/* ── Appointments ── */}
          <AppointmentTable
            appointments={appointments}
            counts={counts}
            loading={apptLoading}
            error={apptError}
            perspective="patient"
            filter={apptFilter}
            onFilterChange={setApptFilter}
            onSelectPerson={goToDoctor}
          />
        </div>
      )}
    </AdminLayout>
  );
}

/* ── Identity banner ───────────────────────────────────────────────────────── */

function PatientHeader({ patient, stats }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center lg:p-6">
        <Avatar name={patient.full_name} size="xl" colorClass="bg-violet-100 text-violet-700" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-bold tracking-tight text-slate-950">{patient.full_name}</h2>
            {patient.age && <Badge tone="slate">Age {patient.age}</Badge>}
            {patient.gender && <Badge tone="indigo">{patient.gender}</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {patient.email}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
            {patient.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="phone" className="h-4 w-4 text-slate-500" />
                {patient.phone}
              </span>
            )}
            {patient.home_city && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="pin" className="h-4 w-4 text-slate-500" />
                {patient.home_city}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clipboard" className="h-4 w-4 text-slate-500" />
              {stats.total ?? 0} appointment{(stats.total ?? 0) === 1 ? '' : 's'}
            </span>
            {patient.created_at && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="calendar" className="h-4 w-4 text-slate-500" />
                Patient since {formatDateShort(patient.created_at.slice(0, 10))}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}