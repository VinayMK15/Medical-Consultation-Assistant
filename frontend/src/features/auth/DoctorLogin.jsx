import React, { useState, useContext } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../shared/context/AuthContext';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import AuthShell from '../../shared/components/AuthShell';
import Button from '../../shared/components/ui/Button';
import { Input, PasswordInput } from '../../shared/components/ui/Input';
import { LockIcon } from '../../shared/components/ui/icons';
import useDocumentTitle from '../../hooks/useDocumentTitle';

const highlights = [
  'AI-assisted patient triage',
  'Manage schedule & availability',
];

function DoctorLoginHero() {
  return (
    <div>
      <h1 className="text-4xl font-bold leading-tight text-slate-900 xl:text-5xl">
        Manage your patients, all in one place.
      </h1>
      <p className="mt-4 text-base text-slate-700">
        Sign in to the provider portal to review routed patient requests,
        manage your schedule, and keep your practice running smoothly.
      </p>
      <ul className="mt-6 space-y-2.5">
        {highlights.map((h) => (
          <li key={h} className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DoctorLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  useDocumentTitle('Doctor Login');
  const { login, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get('expired') === 'true';

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = 'Email is required.';
    if (!password) next.password = 'Password is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const data = await login(email, password, '/api/auth/doctor/login', rememberMe);
      const role = data?.user?.role;

      if (role === 'doctor') {
        navigate('/doctor/dashboard');
      } else if (role === 'admin') {
        logout();
        setError('This account uses the restricted admin portal.');
      } else {
        // A non-doctor account reached this portal. The page deliberately has
        // no link to the patient login, so the message must stand alone —
        // it used to point at a "patient login" page the header no longer
        // offered.
        setError('This portal is for verified healthcare providers only.');
      }
    } catch (err) {
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        setError(Array.isArray(detail) ? detail[0].msg : detail);
      } else {
        setError('Failed to sign in. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  // The backend distinguishes three account states. Only a genuine
  // credential failure is an error; "pending verification" and "deactivated"
  // are account states and read wrong in the same red box as a bad password.
  // The old copy also printed "Account under review — Your account is
  // pending admin verification.", saying the same thing twice.
  const isPendingReview = /pending admin verification/i.test(error);
  const isDeactivated = /deactivated/i.test(error);
  const isNotice = isPendingReview || isDeactivated;

  return (
    <AuthShell
      image
      hero={<DoctorLoginHero />}
    >
      <div className="w-full max-w-md shrink-0 rounded-2xl border border-white/70 bg-white/95 p-8 shadow-xl backdrop-blur">
        <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
        <p className="mt-1 text-sm text-slate-600">Sign in to your provider portal.</p>

        {/* role/status so each of these three banners is announced. */}
        {isExpired && (
          <div role="status" className="mt-4 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
            Your session expired. Please sign in again.
          </div>
        )}

        {error && isNotice && (
          <div role="status" className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2.5">
            <p className="flex items-start gap-2 text-sm font-semibold text-warning-700">
              <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              {isPendingReview ? 'Account under review' : 'Account deactivated'}
            </p>
            <p className="mt-1 pl-6 text-sm leading-5 text-warning-700">
              {isPendingReview
                ? 'Your provider account has been created but an admin has not verified it yet. You will be able to sign in once it is approved.'
                : 'This provider account has been disabled. Contact MedAssist support if you think this is a mistake.'}
            </p>
          </div>
        )}

        {error && !isNotice && (
          <div role="alert" className="mt-4 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="doctor@hospital.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            error={errors.email}
          />
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="doctor-password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="cursor-pointer text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                Forgot password?
              </button>
            </div>
            <PasswordInput
              id="doctor-password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              error={errors.password}
            />
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-primary-600"
            />
            Remember me
          </label>
          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-700">
          New to MedAssist?{' '}
          <Link to="/doctor/signup" className="font-semibold text-primary-600 hover:text-primary-700">
            Register as a provider
          </Link>
        </p>

        <div className="mt-6 space-y-1 border-t border-slate-100 pt-4 text-center text-sm text-slate-600">
          <p className="flex items-center justify-center gap-1.5">
            <LockIcon aria-hidden="true" className="h-3.5 w-3.5" />
            Your information is encrypted and never shared without consent
          </p>
          <p>
            For emergencies, contact local emergency services immediately.{' '}
            <Link to="/privacy" className="font-medium text-primary-600 hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>

      {showForgotModal && (
        <ForgotPasswordModal isOpen={showForgotModal} onClose={() => setShowForgotModal(false)} />
      )}
    </AuthShell>
  );
}
