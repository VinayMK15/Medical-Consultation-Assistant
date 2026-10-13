import React, { useState, useContext, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AuthContext } from '../../shared/context/AuthContext';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import AuthShell from '../../shared/components/AuthShell';
import Button from '../../shared/components/ui/Button';
import { Input, PasswordInput } from '../../shared/components/ui/Input';
import { LockIcon } from '../../shared/components/ui/icons';
import useDocumentTitle from '../../hooks/useDocumentTitle';

const highlights = [
  'Symptom-based routing',
  'Nearby specialist matching',
];

function LoginHero() {
  return (
    <div>
      <h1 className="text-4xl font-bold leading-tight text-slate-900 xl:text-5xl">
        Describe symptoms, find the right specialist nearby.
      </h1>
      <p className="mt-4 text-base text-slate-700">
        MedAssist routes you to relevant doctors based on your symptoms and
        location. It helps with direction, not diagnosis or medical consultation.
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

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  useDocumentTitle('Login');
  const { login, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get('expired') === 'true';
  const [expiredNotice, setExpiredNotice] = useState(isExpired);

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = 'Email is required.';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Password is required.';
    setErrors(next);
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setExpiredNotice(false);

    const next = validate();
    if (Object.keys(next).length > 0) {
      if (next.email) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      const data = await login(email, password, undefined, rememberMe);
      const role = data?.user?.role;
      if (role === 'doctor') {
        navigate('/doctor/dashboard');
      } else if (role === 'admin') {
        logout();
        navigate('/admin/login?err=admin-portal');
      } else {
        navigate('/');
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      setFormError(
        detail
          ? Array.isArray(detail) ? detail[0].msg : detail
          : 'Failed to sign in. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <meta name="description" content="Access your MedAssist patient account to manage appointments and find specialists near you." />
      </Helmet>
      <AuthShell lock altTo="/doctor/login" altLabel="Doctor login" image hero={<LoginHero />}>
        <div className="flex max-h-full min-h-0 w-full max-w-md shrink-0 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-xl backdrop-blur">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
        <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-600">Sign in to find the right specialist near you.</p>

          {/* Both banners need a role so the message is announced. The session-expired
              notice renders on load rather than in response to a user action, so
              it is a polite status; the submit failure is an alert. */}
          {expiredNotice && (
            <div role="status" className="mt-4 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
              Your session expired. Please sign in again.
            </div>
          )}
          {formError && (
            <div role="alert" className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {formError}
            </div>
          )}

          <form noValidate onSubmit={handleSubmit} aria-busy={loading} className="mt-5 space-y-3">
            <Input
              ref={emailRef}
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              error={errors.email}
            />
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                {/* A <span> sat here before, so the password field had no
                    programmatically associated label. PasswordInput now
                    generates its own id, so labelling it here would duplicate
                    the visible text — hence aria-label instead. */}
                <label htmlFor="login-password" className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="min-h-11 rounded text-sm font-medium text-primary-600 hover:text-primary-700 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                >
                  Forgot password?
                </button>
              </div>
              <PasswordInput
                ref={passwordRef}
                id="login-password"
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
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 accent-primary-600"
              />
              Remember me
            </label>
            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-700">
            New to MedAssist?{' '}
            <Link to="/signup" className="font-semibold text-primary-600 hover:text-primary-700">
              Create account
            </Link>
          </p>

          {/* text-sm rather than text-xs: this is a privacy and emergency notice, and
              it was previously the smallest text in the card while body copy
              sat at 14px. */}
          <div className="mt-4 space-y-0.5 border-t border-slate-100 pt-3 text-center text-sm text-slate-600">
            <p className="flex items-center justify-center gap-1.5">
              <LockIcon aria-hidden="true" className="h-3.5 w-3.5" />
              Encrypted and never shared without consent
            </p>
            <p>
              Emergency? Contact local services.{' '}
              <Link to="/privacy" className="font-medium text-primary-600 hover:underline">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>

        {showForgotModal && (
          <ForgotPasswordModal isOpen={showForgotModal} onClose={() => setShowForgotModal(false)} />
        )}
      </AuthShell>
    </>
  );
}
