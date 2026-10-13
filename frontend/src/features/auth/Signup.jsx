import React, { useState, useContext, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AuthContext } from '../../shared/context/AuthContext';
import AuthShell from '../../shared/components/AuthShell';
import Button from '../../shared/components/ui/Button';
import { Input, Select, Textarea, PasswordInput } from '../../shared/components/ui/Input';
import { CityAutocomplete, AddressAutocomplete } from '../../shared/components/LocationFields';

// Strength meter + optional-field wrapper are shared with provider signup.
import PasswordStrengthMeter, { OptionalField } from '../../shared/components/PasswordStrengthMeter';
import useDocumentTitle from '../../hooks/useDocumentTitle';


function SignupHero() {
  return (
    <div className="max-w-md xl:max-w-lg space-y-6 pr-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl xl:text-5xl xl:leading-[1.15]">
          Find the right care, <span className="text-primary-600">right nearby.</span>
        </h1>
        <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600">
          MedAssist matches your symptoms with top-rated medical specialists in your city in seconds.
        </p>
      </div>

      <div className="space-y-4 pt-2">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-base font-bold text-primary-700">
            🩺
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Intelligent Specialist Routing</h3>
            <p className="text-sm text-slate-600">Guided symptom assessment directed to the right department.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-base font-bold text-emerald-700">
            📍
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Verified Nearby Clinics</h3>
            <p className="text-sm text-slate-600">Real-time matching based on your location and neighborhood.</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-base font-bold text-violet-700">
            🔒
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Confidential & Patient-First</h3>
            <p className="text-sm text-slate-600">Your health queries and details are strictly private.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Success screen ─────────────────────────────────────────────────────────
function SuccessScreen({ fullName }) {
  const navigate = useNavigate();
  return (
    <AuthShell altTo="/doctor/signup" altLabel="Doctor signup" image overlay="soft">
      <div className="w-full max-w-md text-center">
        <div className="rounded-2xl border border-white/70 bg-white/95 p-8 shadow-xl backdrop-blur sm:p-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-success-50 text-3xl font-bold text-success-600">
            ✓
          </div>
          <h2 className="text-2xl font-bold text-slate-950">Account created!</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Welcome, <span className="font-semibold text-primary-600">{fullName}</span>. Your account
            is ready. Sign in to start finding doctors near you.
          </p>

          <div className="mt-6 rounded-xl border border-primary-100 bg-primary-50 p-4 text-left">
            <p className="text-sm font-semibold text-primary-800">What's next?</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-primary-700">
              <li>Sign in with your email and password</li>
              <li>Describe your symptoms to the routing assistant</li>
              <li>Get matched with nearby relevant specialists</li>
            </ul>
          </div>

          <Button
            type="button"
            variant="primary"
            size="lg"
            className="mt-6 w-full"
            onClick={() => navigate('/login')}
          >
            Go to Sign in
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Signup() {
  useDocumentTitle('Sign Up');
  const [values, setValues] = useState({
    full_name: '',
    email: '',
    phone: '',
    age: '',
    gender: '',
    password: '',
    confirm: '',
    home_city: '',
    home_address: '',
  });

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { signup } = useContext(AuthContext);

  // Focus management: a failed submit must not leave focus parked on the
  // Create account button.
  const fullNameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const phoneRef = useRef(null);

  // DOM order, so focus lands on the first thing the user must actually fix.
  // Mirrors the visual order: name, email, password, confirm, then phone.
  const FIELD_ORDER = ['full_name', 'email', 'password', 'confirm', 'phone'];
  const FIELD_REFS = {
    full_name: fullNameRef,
    email: emailRef,
    password: passwordRef,
    confirm: confirmRef,
    phone: phoneRef,
  };

  // Generic field setter — compatible with native onChange.
  // CityAutocomplete/AddressAutocomplete own their own query state and call
  // `onChange(value)` with a plain string rather than a DOM event, so this has
  // to accept both shapes. Reading `e.target.value` unconditionally crashed the
  // whole page on the first keystroke in either field.
  const setField = (name) => (arg) => {
    const nextValue = typeof arg === 'string' ? arg : arg?.target?.value ?? '';
    setValues((v) => ({ ...v, [name]: nextValue }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = () => {
    const next = {};

    if (!values.full_name.trim()) next.full_name = 'Full name is required.';

    if (!values.email.trim()) {
      next.email = 'Email address is required.';
    } else if (!/\S+@\S+\.\S+/.test(values.email)) {
      next.email = 'Please enter a valid email address.';
    }

    if (!values.phone.trim()) {
      next.phone = 'Phone number is required.';
    } else if (!/^[+\d][\d\s-]{6,15}$/.test(values.phone.trim())) {
      next.phone = 'Please enter a valid phone number.';
    }

    if (!values.password) {
      next.password = 'Password is required.';
    } else if (values.password.length < 8) {
      next.password = 'Password must be at least 8 characters.';
    }

    if (values.password !== values.confirm) {
      next.confirm = 'Passwords do not match.';
    }

    if (values.age) {
      const ageNum = Number(values.age);
      if (isNaN(ageNum) || ageNum < 0 || ageNum > 120)
        next.age = 'Age must be between 0 and 120.';
    }

    setErrors(next);
    return next;
  };

  // ── Submit ──────────────────────────────────────────────────────────────
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
      // PatientCreate (backend/schemas.py) accepts only these fields:
      // email, password, full_name + optional age, gender, phone,
      // home_city, home_address. role is assigned server-side.
      const payload = {
        email: values.email.trim(),
        password: values.password,
        full_name: values.full_name.trim(),
        age: values.age ? Number(values.age) : null,
        gender: values.gender || null,
        phone: values.phone.trim() || null,
        home_city: values.home_city || null,
        home_address: values.home_address || null,
      };
      await signup(payload); // defaults to /api/auth/patient/signup
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

  if (submitted) return <SuccessScreen fullName={values.full_name} />;

  return (
    <>
      <Helmet>
        <meta name="description" content="Join MedAssist to describe symptoms, find the right specialist, and book appointments nearby." />
      </Helmet>
      <AuthShell altTo="/doctor/signup" altLabel="Doctor signup" image overlay="soft" hero={<SignupHero />}>
        <div className="w-full max-w-3xl xl:max-w-4xl shrink-0 overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-xl backdrop-blur">

        {/* Card header */}
        <div className="border-b border-slate-100/80 px-5 pt-4 pb-3 sm:px-6">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Tell us a little about you so we can find doctors near you.
          </p>
        </div>

        {/* Server-error banner */}
        {formError && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded-lg bg-danger-50 px-3 py-2 text-xs sm:text-sm text-danger-700 sm:mx-6"
          >
            {formError}
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} aria-busy={loading}>
          <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">

            {/* ── LEFT: Account & Security details ─────────────────────────── */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Personal details
              </h2>

              <Input
                ref={fullNameRef}
                label="Full name"
                name="full_name"
                autoComplete="name"
                placeholder="e.g. Rahul Sharma"
                value={values.full_name}
                onChange={setField('full_name')}
                error={errors.full_name}
              />

              <Input
                ref={emailRef}
                label="Email address"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={values.email}
                onChange={setField('email')}
                error={errors.email}
              />

              <OptionalField label="Age and gender">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select
                    label="Gender"
                    name="gender"
                    value={values.gender}
                    onChange={setField('gender')}
                  >
                    <option value="">Prefer not to say</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </Select>

                  <Input
                    label="Age"
                    name="age"
                    type="number"
                    autoComplete="off"
                    min="0"
                    max="120"
                    placeholder="e.g. 28"
                    value={values.age}
                    onChange={setField('age')}
                    error={errors.age}
                  />
                </div>
              </OptionalField>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PasswordInput
                  ref={passwordRef}
                  label="Password"
                  name="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={values.password}
                  onChange={setField('password')}
                  error={errors.password}
                />
                <PasswordInput
                  ref={confirmRef}
                  label="Confirm password"
                  name="confirm"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={values.confirm}
                  onChange={setField('confirm')}
                  error={errors.confirm}
                />
              </div>

              <PasswordStrengthMeter password={values.password} />
            </div>

            {/* ── RIGHT: Location & Contact details ─────────────────────────── */}
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Location & Contact
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  ref={phoneRef}
                  label="Phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="e.g. 9876543210"
                  value={values.phone}
                  onChange={setField('phone')}
                  error={errors.phone}
                />

                <CityAutocomplete
                  label="City"
                  value={values.home_city}
                  onChange={setField('home_city')}
                  error={errors.home_city}
                />
              </div>

              <AddressAutocomplete
                label="Address"
                value={values.home_address}
                onChange={setField('home_address')}
                error={errors.home_address}
                hint="Include the area name so we can match doctors nearby."
              />

              <div className="rounded-lg border border-primary-100 bg-primary-50/90 px-3 py-2 text-xs text-primary-800">
                <p className="font-semibold flex items-center gap-1.5">
                  📍 Proximity Matching
                </p>
                <p className="mt-0.5 text-primary-700">Doctors will be prioritized near your address.</p>
              </div>
            </div>
          </div>

          {/* ── BOTTOM ACTION BAR: Centered button and login link below ─── */}
          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 text-center">
            <div className="flex flex-col items-center justify-center">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full shadow-xs sm:w-auto sm:min-w-[220px]"
              >
                Create account
              </Button>
              <p className="mt-2 text-xs text-slate-600 sm:text-sm">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">
                  Sign in
                </Link>
              </p>
              <p className="mt-3 text-xs text-slate-500">
                By creating an account you agree to our{' '}
                <Link to="/terms" className="font-medium text-slate-600 underline hover:text-slate-800">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="font-medium text-slate-600 underline hover:text-slate-800">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </form>
      </div>
      </AuthShell>
    </>
  );
}
