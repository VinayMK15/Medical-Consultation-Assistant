import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../shared/utils/api';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import SkipLink from '../../shared/components/SkipLink';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  useDocumentTitle('Reset Password');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!token) {
      setError('Invalid or missing reset token.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // 8 to match the signup forms. At 6, this page accepted a password that the
// user's own Signup form would then have rejected.
if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/auth/reset-password', {
        token,
        new_password: password
      });
      setSuccess(res.data.message);
      setTimeout(() => navigate(res.data.login_path || '/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <SkipLink />
      {/* id="main-content" was missing, so the SkipLink had no target to jump
          to, and the page had no <main> landmark at all. */}
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-inner">
          <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        {/* Promoted to h1: the page had no top-level heading at all. */}
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Set New Password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Please enter your new password below.
        </p>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            {success} Redirecting to login…
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* htmlFor/id were missing on both labels, so neither field had an
              accessible name. autoComplete lets a password manager offer the
              new credential rather than re-filling the old one. */}
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
              New Password
            </label>
            <input
              id="new-password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-describedby="new-password-hint"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="••••••••"
            />
            <p id="new-password-hint" className="mt-1.5 text-xs text-slate-500">
              At least 8 characters.
            </p>
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || success}
            aria-busy={loading}
            className="mt-6 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-70"
          >
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>

        {/* Escape hatch: a mistyped token previously left no way out of the page. */}
        <p className="mt-5 text-center text-sm text-slate-600">
          <Link
            to="/login"
            className="font-semibold text-primary-600 hover:text-primary-700 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
      </main>
    </div>
  );
}
