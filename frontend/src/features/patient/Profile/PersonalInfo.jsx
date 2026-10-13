import React, { useContext, useState, useEffect } from 'react';
import { AuthContext } from '../../../shared/context/AuthContext';
import api from '../../../shared/utils/api';
import { CityAutocomplete, AddressAutocomplete } from '../../../shared/components/LocationFields';

// ── Info Row ──────────────────────────────────────────────────────────────────
function InfoRow({ label, value, icon }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200/70">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <p className="mt-0.5 text-sm font-semibold break-words text-slate-800">{value || 'Not provided'}</p>
      </div>
    </div>
  );
}

/**
 * A labelled group of InfoRows. The page used to be one unbroken vertical
 * list of six rows with hairline dividers, which read as a wall of text and
 * forced scrolling. Grouping by Identity / Contact / Location gives each
 * field somewhere to sit and lets the grid do the spacing work.
 */
function InfoGroup({ title, children, className = '' }) {
  return (
    <div className={className}>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">{title}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

// ── Form Field ────────────────────────────────────────────────────────────────
/**
 * Wraps a labelled control and wires the label to it.
 *
 * The <label> previously had no `htmlFor` and the inputs had no `id`, so none
 * of these four fields had an accessible name — clicking the label did nothing
 * and a screen reader announced an unlabelled text box.
 */
function FormField({ label, children }) {
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
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10';

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PersonalInfo() {
  const { user, updateUserSession } = useContext(AuthContext);
  const [isEditing, setIsEditing]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]   = useState('');

  const [formData, setFormData] = useState({
    full_name: user?.full_name || user?.name || '',
    age: user?.age || '',
    gender: user?.gender || '',
  });
  const [city, setCity]       = useState(user?.city    || '');
  const [address, setAddress] = useState(user?.address || '');
  const [phone, setPhone]     = useState(user?.phone  || '');
  // The last values confirmed by the server. Cancelling an edit restores
  // from here so a discarded edit doesn't linger in the form.
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    api.get('/api/patient/profile').then((res) => {
      if (res.data) {
        const next = {
          city:      res.data.city  || '',
          address:   res.data.address || '',
          phone:     res.data.phone || '',
          formData: {
            full_name: res.data.full_name || '',
            age:       res.data.age       || '',
            gender:    res.data.gender    || '',
          },
        };
        setCity(next.city);
        setAddress(next.address);
        setPhone(next.phone);
        setFormData(next.formData);
        setSaved(next);
      }
    }).catch(() => {});
  }, []);

  const handleCancel = () => {
    if (saved) {
      setCity(saved.city);
      setAddress(saved.address);
      setPhone(saved.phone);
      setFormData(saved.formData);
    }
    setSaveError('');
    setIsEditing(false);
  };

  const handleEditClick = () => {
    // Seed from the current form state, which was hydrated from
    // /api/patient/profile. Seeding from `user` instead would silently
    // revert the form to the auth-context copy, which can be stale — the
    // profile may have been updated in another tab, or the token payload
    // simply predates a change.
    setSaveSuccess(false);
    setSaveError('');
    setIsEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setSaveError('');
    try {
      const payload = {
        full_name: formData.full_name,
        age:       formData.age ? parseInt(formData.age, 10) : null,
        gender:    formData.gender  || null,
        phone:     phone.trim()     || null,
        city:      city             || null,
        address:   address          || null,
      };
      const res = await api.put('/api/patient/profile', payload);
      updateUserSession(res.data);
      setSaveSuccess(true);
      setIsEditing(false);
    } catch (err) {
      // Inline, matching the booking modal's pattern. A blocking alert()
      // here discarded whatever the user had typed.
      setSaveError(err.response?.data?.detail || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  const fullName = user.full_name || user.name || 'Not provided';
  const email    = user.email     || 'Not provided';
  const role     = user.role      || 'patient';

  return (
    <div className="space-y-4">
      {/* ── Identity header ──
          A restrained white card rather than the full-bleed blue gradient.
          The banner was the loudest element on the page and competed with
          the page title and the app nav for attention, while carrying only
          three facts — all of which the grouped fields below also show. */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-2xl font-bold uppercase text-white shadow-md shadow-blue-500/25">
          {fullName.charAt(0)}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold leading-tight text-slate-900">{fullName}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-600">
              {role}
            </span>
          </div>
        </div>

        {!isEditing && role === 'patient' && (
          <button
            onClick={handleEditClick}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-500/25 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-11">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
            Edit Profile
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {isEditing ? (
          <div className="py-5 space-y-4">
            <FormField label="Full Name">
              <input
                type="text"
                name="full_name"
                autoComplete="name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className={inputCls}
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Age">
                <input
                  type="number"
                  name="age"
                  min="0"
                  max="120"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Gender">
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </FormField>
            </div>

            <FormField label="Phone">
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className={inputCls}
                aria-describedby="phone-hint"
              />
              <p id="phone-hint" className="mt-1.5 text-sm text-slate-500">
                Used to reach you about appointment changes.
              </p>
            </FormField>

            {/* City and address use the same components as Signup. The old
                <select> hardcoded its own 7-city list, so a patient who
                signed up in any other city could not keep their value. */}
            <CityAutocomplete
              label="Home City"
              value={city}
              onChange={setCity}
              disabled={saving}
            />

            <AddressAutocomplete
              label="Home Address"
              value={address}
              onChange={setAddress}
              disabled={saving}
              hint="Used to find doctors near your home."
            />

            {saveError && (
              <p role="alert" className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                {saveError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 inline-flex items-center min-h-11">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50 inline-flex items-center min-h-11">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-2">
            {/* Grouped so each field has a home, and the grid does the
                spacing. This was one unbroken list of six rows split by
                hairlines, which read as a wall of text and required
                scrolling to see six short values. Full name and email are
                omitted here because the header directly above already
                states them. */}
            <div className="space-y-5">
              <InfoGroup title="Identity" className="sm:col-span-2">
              <InfoRow
                  label="Age"
                  value={user.age ? `${user.age} years` : null}
                  icon={
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                }
              />
              <InfoRow
                  label="Gender"
                  value={user.gender}
                  icon={
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
                  </svg>
                }
              />
              </InfoGroup>

              <InfoGroup title="Contact">
                <InfoRow
                  label="Email Address"
                  value={email}
                  icon={
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                    </svg>
                  }
                />
                <InfoRow
                    label="Phone"
                    value={saved?.phone || user?.phone}
                    icon={
                      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    </svg>
                  }
                />
              </InfoGroup>

              <InfoGroup title="Location" className="sm:col-span-2">
              <InfoRow
                  label="Home City"
                  value={user.city}
                  icon={
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
                  </svg>
                }
              />
              <InfoRow
                  label="Home Address"
                  value={user.address}
                  icon={
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                }
              />
              </InfoGroup>
            </div>

            {saveSuccess && (
              <p role="status" className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Profile saved successfully.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
