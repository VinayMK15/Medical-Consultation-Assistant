import React, { useState, useContext, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../shared/context/AuthContext';
import AuthShell from '../../shared/components/AuthShell';
import Button from '../../shared/components/ui/Button';
import Card from '../../shared/components/ui/Card';
import { Input, Select, PasswordInput } from '../../shared/components/ui/Input';
import { LockIcon, UploadIcon } from '../../shared/components/ui/icons';
import { CityAutocomplete, AddressAutocomplete } from '../../shared/components/LocationFields';
import PasswordStrengthMeter, { OptionalField } from '../../shared/components/PasswordStrengthMeter';
import { SPECIALIZATIONS } from '../../shared/constants/specializations';
import useDocumentTitle from '../../hooks/useDocumentTitle';

// ── Pending-approval success screen ────────────────────────────────────
function PendingApprovalScreen({ fullName }) {
  const navigate = useNavigate();
  return (
    <AuthShell>
      <div className="w-full max-w-md text-center">
        <Card className="border-white/70 bg-white/95 p-8 shadow-xl backdrop-blur sm:p-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-success-50 text-success-600">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-950">Application submitted</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Thank you, <span className="font-semibold text-primary-600">{fullName}</span>. Your provider
            account has been created and is{' '}
            <span className="inline-block rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700">
              pending admin verification
            </span>
            .
          </p>

          <div className="mt-6 rounded-xl border border-primary-100 bg-primary-50 p-4 text-left">
            <p className="text-sm font-semibold text-primary-800">What happens next?</p>
            {/* Numbered steps rather than bullets — the reader is waiting on
                a sequence, and the order is the point. */}
            <ol className="mt-2 space-y-2">
              {[
                'An admin reviews your credentials and licence details',
                'Your dashboard access activates once you are approved',
                'You can then sign in through the provider portal',
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-2.5 text-xs leading-5 text-primary-700">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <Button
            type="button"
            variant="primary"
            size="lg"
            className="mt-6 w-full"
            onClick={() => navigate('/doctor/login')}
          >
            Go to Provider Portal Login
          </Button>
        </Card>
      </div>
    </AuthShell>
  );
}

// ── Left hero (quotes) ───────────────────────────────────────────────────
const doctorQuotes = [
  {
    text: 'The good physician treats the disease; the great physician treats the patient who has the disease.',
    author: 'Sir William Osler',
  },
  {
    text: 'Wherever the art of medicine is loved, there is also a love of humanity.',
    author: 'Hippocrates',
  },
];

function DoctorSignupHero() {
  return (
    <div className="max-w-sm space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl xl:text-5xl xl:leading-[1.15]">
          Care beyond <span className="text-primary-600">boundaries.</span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
          Join a verified network of doctors reaching the right patients at the right time.
        </p>
      </div>

      {/* Moved here from the card header, where it sat above the form and
          duplicated what this column already says — while costing ~49px of
          card height the form needed more. <h2>, not <h1>: the hero above
          owns the single page-level h1. Primary-tinted so it reads as a call
          to action rather than one more testimonial card. */}
      <div className="rounded-2xl border border-primary-100 bg-white/75 p-4 shadow-sm backdrop-blur">
        <h2 className="text-base font-bold text-primary-800">Join as a provider</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Submit your profile for admin verification before dashboard access.
        </p>
      </div>

      <div className="space-y-4">
        {doctorQuotes.map((q) => (
          <figure key={q.author} className="rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur">
            <blockquote className="border-l-2 border-primary-500 pl-3 text-sm italic leading-relaxed text-slate-700">
              “{q.text}”
            </blockquote>
            <figcaption className="mt-2 pl-3 text-xs font-semibold text-slate-600">
              — {q.author}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export default function DoctorSignup() {
  useDocumentTitle('Doctor Sign Up');
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    age: '',
    gender: '',
    password: '',
    confirm_password: '',
    qualifications: '',
    license_number: '',
    specialization: '',
    practice_city: '',
    practice_address: '',
  });

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Document upload is UI-only for now (no backend endpoint yet) —
  // intentionally kept out of formData/the signup payload. The field is
  // labelled as optional so nothing implies it is being submitted.
  const [fileName, setFileName] = useState('');

  const { signup } = useContext(AuthContext);

  // Focus management: a failed submit used to leave focus parked on the
  // Create account button.
  const fullNameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  // The professional fields are deliberately excluded: reaching them would
  // mean tabbing across the left column first. Mirrors patient signup.
  const FIELD_ORDER = ['full_name', 'email', 'phone', 'password', 'confirm_password'];
  const FIELD_REFS = {
    full_name: fullNameRef,
    email: emailRef,
    phone: phoneRef,
    password: passwordRef,
    confirm_password: confirmRef,
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  // ── Validation ──────────────────────────────────────────────────────
  const validate = () => {
    const next = {};

    if (!formData.full_name.trim()) next.full_name = 'Full name is required.';

    if (!formData.email.trim()) {
      next.email = 'Email address is required.';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      next.email = 'Please enter a valid email address.';
    }

    if (!formData.password) {
      next.password = 'Password is required.';
    } else if (formData.password.length < 8) {
      next.password = 'Password must be at least 8 characters.';
    }

    if (!formData.confirm_password) {
      next.confirm_password = 'Please confirm your password.';
    } else if (formData.password !== formData.confirm_password) {
      next.confirm_password = 'Passwords do not match.';
    }

    if (!formData.phone.trim()) {
      next.phone = 'Phone number is required.';
    } else if (!/^[+\d][\d\s-]{6,15}$/.test(formData.phone.trim())) {
      next.phone = 'Please enter a valid phone number.';
    }

    if (formData.age) {
      const ageNum = Number(formData.age);
      if (isNaN(ageNum) || ageNum < 0 || ageNum > 120)
        next.age = 'Age must be between 0 and 120.';
    }

    if (!formData.qualifications.trim()) next.qualifications = 'Qualification is required.';
    if (!formData.license_number.trim()) next.license_number = 'Medical license number is required.';
    if (!formData.specialization) next.specialization = 'Specialization is required.';

    if (!formData.practice_city) next.practice_city = 'Practice city is required.';
    if (!formData.practice_address.trim()) next.practice_address = 'Practice address is required.';

    setErrors(next);
    return next;
  };

  // ── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const next = validate();
    const firstBad = FIELD_ORDER.find((f) => next[f]);
    if (firstBad) {
      FIELD_REFS[firstBad].current?.focus();
      return;
    }

    setLoading(true);
    try {
      // role is always 'doctor' -- hardcoded and not exposed to the user
      const signupData = { ...formData };
      delete signupData.confirm_password;
      const payload = {
        ...signupData,
        email: signupData.email.trim(),
        full_name: signupData.full_name.trim(),
        phone: signupData.phone.trim(),
        age: signupData.age ? Number(signupData.age) : null,
        gender: signupData.gender || null,
        qualifications: signupData.qualifications.trim(),
        license_number: signupData.license_number.trim(),
        practice_address: signupData.practice_address.trim(),
        role: 'doctor',
      };
      await signup(payload, '/api/auth/doctor/signup');
      setSubmitted(true);
    } catch (err) {
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        setFormError(Array.isArray(detail) ? detail[0].msg : detail);
      } else {
        setFormError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Pending Approval Screen ---
  if (submitted) {
    return <PendingApprovalScreen fullName={formData.full_name} />;
  }

  return (
    <AuthShell
      image
      overlay="soft"
      hero={<DoctorSignupHero />}
    >
      <div className="my-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-xl backdrop-blur">

        {/* Below `lg` the hero column is not rendered at all, so the title has
            to live here or the page opens with no heading. `lg:hidden` means it
            is never on screen at the same time as the hero copy — no
            duplication at any width, and no cost to the desktop card. */}
        <div className="border-b border-slate-100/80 px-5 py-2.5 sm:px-6 lg:hidden">
          <h1 className="text-xl font-bold text-slate-900">Join as a provider</h1>
          <p className="text-xs text-slate-600">
            Submit your profile for admin verification before dashboard access.
          </p>
        </div>

        {/* Server-error banner */}
        {formError && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700 sm:mx-6"
          >
            {formError}
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} aria-busy={loading}>
          <div className="grid gap-3 p-3 md:grid-cols-2">

            {/* ── LEFT: Personal details ─────────────────────────────── */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
                Personal details
              </h2>

              <Input
                ref={fullNameRef}
                label="Full name"
                name="full_name"
                autoComplete="name"
                placeholder="Dr. Jane Smith"
                value={formData.full_name}
                onChange={handleChange}
                error={errors.full_name}
              />

              <Input
                ref={emailRef}
                label="Email address"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="doctor@hospital.com"
                value={formData.email}
                onChange={handleChange}
                error={errors.email}
              />

              <Input
                ref={phoneRef}
                label="Phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="e.g. 9876543210"
                value={formData.phone}
                onChange={handleChange}
                error={errors.phone}
              />

              {/* Age and gender are optional and most applicants skip them.
                  Collapsed so the required fields read as the main path. */}
              <OptionalField label="Age & gender">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Age"
                    name="age"
                    type="number"
                    autoComplete="off"
                    min="0"
                    max="120"
                    placeholder="e.g. 42"
                    value={formData.age}
                    onChange={handleChange}
                    error={errors.age}
                  />
                  <Select
                    label="Gender"
                    name="gender"
                    autoComplete="off"
                    value={formData.gender}
                    onChange={handleChange}
                  >
                    <option value="">Prefer not to say</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </Select>
                </div>
              </OptionalField>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PasswordInput
                  ref={passwordRef}
                  label="Password"
                  name="password"
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  value={formData.password}
                  onChange={handleChange}
                  error={errors.password}
                />
                <PasswordInput
                  ref={confirmRef}
                  label="Confirm password"
                  name="confirm_password"
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={formData.confirm_password}
                  onChange={handleChange}
                  error={errors.confirm_password}
                />
              </div>
              <PasswordStrengthMeter password={formData.password} />
            </div>

            {/* ── RIGHT: Professional details (tinted panel) ─────────── */}
            <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
                Professional details
              </h2>

              <Input
                label="Qualification"
                name="qualifications"
                autoComplete="off"
                placeholder="MBBS, MD"
                value={formData.qualifications}
                onChange={handleChange}
                error={errors.qualifications}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="License number"
                  name="license_number"
                  autoComplete="off"
                  placeholder="e.g. KMC-48291"
                  value={formData.license_number}
                  onChange={handleChange}
                  error={errors.license_number}
                />

                <Select
                  label="Specialization"
                  name="specialization"
                  autoComplete="off"
                  value={formData.specialization}
                  onChange={handleChange}
                  error={errors.specialization}
                >
                  <option value="" disabled>Select...</option>
                  {SPECIALIZATIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>

              {/* City and address use the same components as patient signup
                  and profile edit, so practice location behaves identically
                  everywhere it is entered. */}
              <CityAutocomplete
                label="Practice city"
                value={formData.practice_city}
                onChange={(v) => {
                  setFormData((prev) => ({ ...prev, practice_city: v }));
                  if (errors.practice_city) setErrors((prev) => ({ ...prev, practice_city: undefined }));
                }}
                error={errors.practice_city}
              />

              <AddressAutocomplete
                label="Practice address"
                value={formData.practice_address}
                onChange={(v) => {
                  setFormData((prev) => ({ ...prev, practice_address: v }));
                  if (errors.practice_address) setErrors((prev) => ({ ...prev, practice_address: undefined }));
                }}
                error={errors.practice_address}
                hint="Include the area name so nearby patients can find you."
              />
            </div>

            {/* ── Document upload, spanning both columns ────────────────
                This was the last field inside the right-hand panel, which
                left the two columns badly unbalanced: the personal-details
                column ended around the password meter while the professional
                column ran on another ~180px. Widening the upload to the full
                row uses the empty space below both columns and gives the
                drop zone the width a file target actually wants. */}
            <div className="md:col-span-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
                Verification
              </h2>

              {/* One horizontal target. The field label and the drop-zone were
                  two separate elements with the zone stacked vertically; side by
                  side they cost 54px instead of 137px. A single <label> also
                  means the file input has one accessible name rather than two
                  competing labels for the same control. */}
              <label
                htmlFor="doctor-doc-upload"
                className="mt-2 flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border-2 border-dashed border-slate-300 bg-slate-50/60 px-3 py-2.5 transition-colors hover:border-primary-400 hover:bg-primary-50/40"
              >
                <UploadIcon className="h-6 w-6 shrink-0 text-slate-500" />

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-700">
                    Medical license / degree certificate
                  </span>
                  {fileName ? (
                    <span className="block truncate text-sm font-semibold text-primary-600">
                      {fileName}
                    </span>
                  ) : (
                    <span className="block text-xs text-slate-500">
                      Click to upload or drag and drop &middot; PDF, JPG or PNG, up to 10MB
                    </span>
                  )}
                </span>

                <input
                  id="doctor-doc-upload"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="sr-only"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
                />
              </label>

              {/* Load-bearing, not decoration: the file is accepted but never
                  uploaded — `certificate` never enters the payload — so this
                  disclosure must survive the compaction above. */}
              <p className="mt-1.5 text-xs text-slate-500">
                Optional — not sent with this form. Our team will reach out separately if verification documents are needed.
              </p>
            </div>
          </div>

          {/* ── Footer spanning both columns ─────────────────────────── */}
          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-2">
            <div className="flex flex-col items-center justify-center gap-1.5 sm:flex-row sm:gap-4">
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={loading}
                className="w-full px-8 py-2 font-medium shadow-xs sm:w-auto sm:min-w-[200px]"
              >
                Create account
              </Button>
              <p className="text-xs text-slate-600">
                Already registered?{' '}
                <Link to="/doctor/login" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">
                  Login
                </Link>
              </p>
            </div>
            <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <LockIcon className="h-3 w-3" />
              Your information is encrypted and never shared without consent · For emergencies, contact local emergency services.
            </p>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
