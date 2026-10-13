import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../../shared/context/AuthContext';
import api from '../../../shared/utils/api';
import { SPECIALIZATIONS } from '../../../shared/constants/specializations';
import { PencilIcon, DocumentIcon, ActivityIcon, ClockIcon } from '../../../shared/components/ui/icons';
import { CityAutocomplete, AddressAutocomplete } from '../../../shared/components/LocationFields';
import { formatTo12h } from '../../../shared/utils/datetime';

// ── Icon wrapper ──────────────────────────────────────────────────────────────
// Keeps every row's icon visually identical. The page previously inlined a
// path per field, and the hand-written `h-4.5 w-4.5` sizes drifted from the
// icon set used elsewhere in the portal.
function RowIcon({ children }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200/70">
      {children}
    </div>
  );
}

const Svg = ({ path, className = 'h-4 w-4', extra = null }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    {extra}
  </svg>
);

// ── Info Row ──────────────────────────────────────────────────────────────────
// Card-style, matching the patient PersonalInfo page. The doctor page used
// hairline-divided full-width rows, so the two profile pages in the same
// product looked like different products.
/**
 * `href` turns the value into a link — used for `tel:` on the phone, so a
 * doctor can call from their own profile. `action` is an optional trailing
 * control, used to send the reader to the tab that actually edits the value.
 * Both are optional: existing call sites render exactly as before.
 */
function InfoRow({ label, value, icon, href, action = null }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
      <RowIcon>{icon}</RowIcon>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{label}</p>
        {value ? (
          href ? (
            <a
              href={href}
              className="mt-0.5 block break-words rounded text-sm font-semibold text-blue-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {value}
            </a>
          ) : (
            <p className="mt-0.5 break-words text-sm font-semibold text-slate-800">{value}</p>
          )
        ) : (
          <p className="mt-0.5 font-medium text-slate-500">Not provided</p>
        )}
      </div>
      {action}
    </div>
  );
}

// ── Grouped section ───────────────────────────────────────────────────────────
function InfoGroup({ title, children, className = '' }) {
  return (
    <div className={className}>
      {/* An <h3>, not a <p>: these group titles were invisible to anyone
          navigating by heading structure. */}
      <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-teal-700">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

// ── Form Field ────────────────────────────────────────────────────────────────
/**
 * Wraps a labelled control and wires the label to it.
 *
 * The <label> previously had no `htmlFor` and the inputs had no `id`, so none
 * of these seven provider fields had an accessible name.
 */
function FormField({ label, children, hint }) {
  const autoId = React.useId();
  const child =
    React.isValidElement(children) && !children.props.id
      ? React.cloneElement(children, { id: autoId })
      : children;

  return (
    <div>
      <label htmlFor={autoId} className="mb-1.5 block text-sm font-bold text-slate-700">
        {label}
      </label>
      {child}
      {hint && (
        <p id={`${autoId}-hint`} className="mt-1 text-sm text-slate-600">
          {hint}
        </p>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10';

// ── Snapshot ──────────────────────────────────────────────────────────────────
/**
 * The nine values the edit form binds to, read off an API profile row.
 *
 * This deliberately exists once. The bug it fixes was two hand-maintained
 * copies of this literal drifting apart: the fetch built the `saved` snapshot
 * and `handleSave` never rebuilt it, so Cancel reverted the form to the
 * pre-first-save values and the next save wrote those stale values back over
 * the server.
 */
function toFormSnapshot(d = {}) {
  return {
    full_name: d.full_name || '',
    specialization: d.specialization || '',
    qualifications: d.qualifications || '',
    experience_years: d.experience_years ?? '',
    license_number: d.license_number || '',
    phone: d.phone || '',
    bio: d.bio || '',
    city: d.practice_city || d.city || '',
    address: d.practice_address || d.address || '',
  };
}

/** The seven that live in `formData` — city and address are separate state. */
const FORM_FIELDS = [
  'full_name',
  'specialization',
  'qualifications',
  'experience_years',
  'license_number',
  'phone',
  'bio',
];

function toFormData(snap) {
  const form = {};
  for (const key of FORM_FIELDS) form[key] = snap[key];
  return form;
}

// ── Main ──────────────────────────────────────────────────────────────────────
/**
 * Doctor profile.
 *
 * Consultation fee was removed from this page. It is not rendered anywhere
 * patient-facing (the doctor cards and the booking modal both dropped it), so
 * the only place it appeared was this form — a number the doctor could change
 * that no patient would ever see. The column stays in the database and the
 * backend still accepts it, so omitting it from the payload is a no-op rather
 * than a wipe: `update_doctor_profile` only assigns fields that are not None.
 */
export default function DoctorProfileTab({ onOpenShiftHours }) {
  const { user, updateUserSession } = useContext(AuthContext);
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [formData, setFormData] = useState({
    full_name: '',
    specialization: '',
    qualifications: '',
    experience_years: '',
    license_number: '',
    phone: '',
    bio: '',
  });
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  // Last values confirmed by the server, so Cancel restores real state
  // rather than leaving a discarded edit in the form.
  const [saved, setSaved] = useState(null);

  // Fetch full doctor profile on mount
  useEffect(() => {
    let cancelled = false;
    api.get('/api/doctor/profile')
      .then((res) => {
        if (cancelled || !res.data) return;
        const d = res.data;
        const next = toFormSnapshot(d);
        setProfileData(d);
        setFormData(toFormData(next));
        setCity(next.city);
        setAddress(next.address);
        setSaved(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(err.response?.data?.detail || 'Failed to load doctor profile.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCancel = () => {
    if (saved) {
      setFormData(toFormData(saved));
      setCity(saved.city);
      setAddress(saved.address);
    }
    setErrorMessage('');
    setIsEditing(false);
  };

  const handleEditClick = () => {
    setSaveSuccess(false);
    setErrorMessage('');
    setIsEditing(true);
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setErrorMessage('');

    try {
      // consultation_fee is deliberately absent — see the note above.
      const payload = {
        full_name: formData.full_name.trim(),
        specialization: formData.specialization.trim(),
        qualifications: formData.qualifications.trim(),
        experience_years: formData.experience_years ? parseInt(formData.experience_years, 10) : 0,
        license_number: formData.license_number.trim(),
        phone: formData.phone.trim(),
        practice_city: city.trim(),
        practice_address: address.trim(),
        bio: formData.bio.trim(),
      };

      const res = await api.put('/api/doctor/profile', payload);
      setProfileData(res.data);

      // Cancel restores from `saved`, so it must track the last known-good
      // state — not just the initial fetch. Without this, cancelling a second
      // edit reverted the form to pre-first-save values, and the next save
      // wrote those stale values back over the server.
      setSaved(toFormSnapshot(res.data));

      if (updateUserSession) {
        updateUserSession({ ...user, ...res.data, name: res.data.full_name });
      }
      setSaveSuccess(true);
      setIsEditing(false);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setErrorMessage(
        Array.isArray(detail)
          ? detail.map((d) => d.msg).join('. ')
          : detail || 'Failed to save doctor profile changes.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  const doctorName = profileData?.full_name || user?.name || 'Doctor';
  const specialization = profileData?.specialization || 'Healthcare Provider';
  const email = profileData?.email || user?.email || '';
  const isVerified = profileData?.is_verified ?? false;

  // Shift is edited on the Shift Hours tab, not here — only the stored value
  // is shown, so it is rendered read-only and pointed at that tab.
  const shiftLabel = profileData?.shift_start && profileData?.shift_end
    ? `${formatTo12h(profileData.shift_start)} – ${formatTo12h(profileData.shift_end)}`
    : null;

  const sectionHead = (title, sub) => (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
      <div className="min-w-0">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-600">{sub}</p>
      </div>
      {isEditing ? (
        <button
          type="button"
          onClick={handleCancel}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none inline-flex items-center min-h-11">
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={handleEditClick}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-500/25 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-11">
          <PencilIcon className="h-4 w-4" />
          Edit Profile
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ── Notices ── */}
      {saveSuccess && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Profile and clinic details updated successfully.
          </span>
          <button
            type="button"
            onClick={() => setSaveSuccess(false)}
            className="shrink-0 text-xs font-bold text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {errorMessage}
          </span>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            className="shrink-0 text-xs font-bold text-red-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Card ──
          Identity header and body share one surface, split by a hairline, so
          the profile reads as a single panel instead of two stacked cards.
          Restrained white rather than the full-bleed blue gradient with a
          floating inner panel: matches the patient profile, and the gradient
          was the loudest thing on a page whose actual content is the grouped
          fields below. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* Identity header */}
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 pb-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-2xl font-bold uppercase text-white shadow-md shadow-blue-500/25">
            {doctorName.charAt(0)}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold leading-tight text-slate-900">{doctorName}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                {specialization}
              </span>
              {isVerified ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Verified Provider
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Verification Pending
                </span>
              )}
            </div>
            <p className="mt-1.5 truncate text-xs text-slate-500">{email}</p>
          </div>
        </div>

        {/* Body */}
        <div className="pt-5">
          {isEditing ? (
            <form onSubmit={handleSave} className="space-y-5">
              {sectionHead('Edit Profile', 'Update your credentials and clinic location.')}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label="Full Name">
                  <input
                    type="text"
                    name="full_name"
                    autoComplete="name"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. Dr. Sarah Jenkins"
                  />
                </FormField>

                <FormField label="Specialization">
                  <select
                    name="specialization"
                    autoComplete="off"
                    required
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Select Specialization</option>
                    {SPECIALIZATIONS.map((spec) => (
                      <option key={spec} value={spec}>
                        {spec}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Qualifications" hint="Degrees, medical certifications, diplomas">
                  <input
                    type="text"
                    name="qualifications"
                    autoComplete="off"
                    required
                    value={formData.qualifications}
                    onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. MBBS, MD (Cardiology), FACC"
                  />
                </FormField>

                <FormField label="Years of Experience">
                  <input
                    type="number"
                    name="experience_years"
                    autoComplete="off"
                    min="0"
                    max="70"
                    value={formData.experience_years}
                    onChange={(e) => setFormData({ ...formData, experience_years: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. 12"
                  />
                </FormField>

                <FormField label="Medical License Number" hint="Official state/council registration ID">
                  <input
                    type="text"
                    name="license_number"
                    autoComplete="off"
                    required
                    value={formData.license_number}
                    onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. MCI-2015-84920"
                  />
                </FormField>

                <FormField label="Contact Phone Number">
                  <input
                    type="tel"
                    name="phone"
                    autoComplete="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. +91 98765 43210"
                  />
                </FormField>

                {/* Shared with the patient signup and profile, so a doctor
                    cannot end up with a city string the geocoder cannot match. */}
                <CityAutocomplete
                  label="Practice City"
                  value={city}
                  onChange={setCity}
                />

                <div className="md:col-span-2">
                  <AddressAutocomplete
                    label="Clinic / Practice Street Address"
                    value={address}
                    onChange={setAddress}
                    hint="Patients navigate to this address. Map coordinates update automatically."
                  />
                </div>

                <div className="md:col-span-2">
                  <FormField
                    label="Doctor Bio / Practice Description"
                    hint="Brief summary shown to patients booking appointments."
                  >
                    <textarea
                      rows={3}
                      name="bio"
                      autoComplete="off"
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      className={`${inputCls} resize-none`}
                      placeholder="Describe your expertise, clinical focus, and patient care philosophy..."
                    />
                  </FormField>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 focus:outline-none inline-flex items-center min-h-11">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-500/25 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 min-h-11">
                  {saving && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  )}
                  {saving ? 'Saving Changes…' : 'Save Profile'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {sectionHead(
                'Professional & Practice Details',
                'Your credentials, contact, and clinic location.'
              )}

              <div className="mt-5 space-y-5">
                {/* Credentials. Name, specialization and email are omitted —
                    the header directly above already states all three. */}
                <InfoGroup title="Credentials" className="sm:col-span-2">
                  <InfoRow
                    label="Medical License Number"
                    value={profileData?.license_number}
                    icon={<Svg path="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />}
                  />
                  <InfoRow
                    label="Qualifications"
                    value={profileData?.qualifications}
                    icon={<Svg path="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />}
                  />
                  <InfoRow
                    label="Clinical Experience"
                    value={profileData?.experience_years ? `${profileData.experience_years} years` : null}
                    icon={<ActivityIcon className="h-4 w-4" />}
                  />
                  <InfoRow
                    label="Consultation Hours"
                    value={shiftLabel}
                    icon={<ClockIcon className="h-4 w-4" />}
                    action={onOpenShiftHours && (
                      <button
                        type="button"
                        onClick={onOpenShiftHours}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        Edit
                      </button>
                    )}
                  />
                </InfoGroup>

                {/* Email is deliberately omitted — the identity header
                    directly above already states it, and the sidebar repeats
                    it as chrome. */}
                <InfoGroup title="Contact">
                  <InfoRow
                    label="Phone"
                    value={profileData?.phone}
                    // Spaces stripped so `+91 98765 43210` dials as
                    // `+919876543210`; the displayed value keeps whatever
                    // formatting the doctor typed.
                    href={profileData?.phone ? `tel:${profileData.phone.replace(/\s+/g, '')}` : undefined}
                    icon={<Svg path="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />}
                  />
                </InfoGroup>

                <InfoGroup title="Clinic Location" className="sm:col-span-2">
                  <InfoRow
                    label="Practice City"
                    value={profileData?.practice_city || profileData?.city}
                    icon={<Svg path="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />}
                  />
                  <InfoRow
                    label="Clinic Street Address"
                    value={profileData?.practice_address || profileData?.address}
                    icon={<Svg path="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" extra={<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />} />}
                  />
                </InfoGroup>

                <InfoGroup title="About" className="sm:col-span-2">
                  <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 sm:col-span-2">
                    <RowIcon><DocumentIcon className="h-4 w-4" /></RowIcon>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                        Professional Bio
                      </p>
                      <p className="mt-0.5 break-words text-sm leading-6 text-slate-700">
                        {profileData?.bio || (
                          <span className="font-medium text-slate-500">No bio added yet.</span>
                        )}
                      </p>
                    </div>
                  </div>
                </InfoGroup>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
