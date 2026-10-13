import React, { useState, useContext, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../../shared/context/AuthContext';
import api from '../../../shared/utils/api';
import { LockIcon, ShieldCheckIcon } from '../../../shared/components/ui/icons';
import { PasswordInput } from '../../../shared/components/ui/Input';
import PasswordStrengthMeter from '../../../shared/components/PasswordStrengthMeter';
import ConfirmDialog from '../../../shared/components/ConfirmDialog';

// ── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ title, subtitle, icon, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3.5 border-b border-slate-100 px-6 py-4">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs leading-5 text-slate-600">{subtitle}</p>}
        </div>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

// ── Inline notice ─────────────────────────────────────────────────────────────
function Notice({ tone, children }) {
  const tones = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-red-200 bg-red-50 text-red-700',
  };
  const icons = {
    success: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    error: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
  };
  return (
    <div
      // `status` is a polite live region: it waits for a pause in speech.
      // "Current password is incorrect" must interrupt, so errors are
      // assertive. Both tones previously shared role="status", which meant a
      // failed password change could go unannounced entirely.
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mx-6 my-4 flex items-start gap-2 rounded-xl border p-3 text-xs font-semibold ${tones[tone]}`}
    >
      <svg className="mt-px h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d={icons[tone]} />
      </svg>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
/**
 * Doctor settings.
 *
 * This previously offered four notification toggles — new-booking email,
 * cancellation email, a "daily morning briefing", and urgent SMS. None of
 * them were wired to anything: they were bare `useState` that reset on every
 * page load and were never sent to the API. The backend has no booking or
 * cancellation mail (the only mail transport, `services/email_service.py`,
 * is used solely by the password-reset flow), no SMS provider, and no
 * scheduler for a morning digest. Toggles for those promised a doctor an
 * alerting system that does not exist, so they were removed rather than
 * persisted as dead preferences.
 *
 * What remains is backed by a real endpoint: `POST /api/doctor/change-password`.
 */
export default function DoctorSettingsTab() {
  const { user, logout } = useContext(AuthContext);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);
  // A failed change is almost always a mistyped current password, so the
  // cursor belongs there rather than on the submit button.
  const currentPwRef = useRef(null);

  const closeForm = () => {
    setShowPasswordForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.post('/api/doctor/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess(res.data.message || 'Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordError(err.response?.data?.detail || 'Failed to change password.');
      currentPwRef.current?.focus();
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    // The tab wrapper is a bounded flex column, so this root is the flex child
    // that scrolls. `min-h-0` at every level is what lets the column shrink.
    // `overscroll-contain` stops a trackpad hitting the end and then tugging
    // the page behind it.
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain">
      {/* ── Page heading ──
          Was a near-black gradient banner. Restrained white card, matching
          the profile pages and the patient settings page. */}
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
          Account
        </p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Clinic &amp; Account Settings</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Update your login credentials and manage your active session.
        </p>
      </div>

      {/* ── Account Security ── */}
      <SectionCard
        title="Account Security"
        subtitle="Manage your credentials and authentication settings."
        icon={<LockIcon className="h-5 w-5" />}
      >
        {passwordSuccess && <Notice tone="success">{passwordSuccess}</Notice>}
        {passwordError && <Notice tone="error">{passwordError}</Notice>}

        <div className="px-6 py-5">
          {!showPasswordForm ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">Password</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Secure your account by regularly updating your password.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm(true);
                  setPasswordError('');
                  setPasswordSuccess('');
                }}
                className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                Change Password
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="max-w-md space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Update Password
                </h4>
                <button
                  type="button"
                  onClick={closeForm}
                  className="text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
              <div>
                <label htmlFor="cur-pw" className="mb-1 block text-xs font-bold text-slate-700">
                  Current Password
                </label>
                <PasswordInput
                  ref={currentPwRef}
                  id="cur-pw"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label htmlFor="new-pw" className="mb-1 block text-xs font-bold text-slate-700">
                  New Password
                </label>
                <PasswordInput
                  id="new-pw"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                />
                {/* Advisory only, and it renders nothing until a character is
                    typed — so it costs no space on an empty form. This is the
                    one place a doctor picks a password deliberately rather than
                    being forced to create one. */}
                <PasswordStrengthMeter password={newPassword} />
              </div>
              <div>
                <label htmlFor="confirm-pw" className="mb-1 block text-xs font-bold text-slate-700">
                  Confirm New Password
                </label>
                <PasswordInput
                  id="confirm-pw"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </div>
              <button
                type="submit"
                disabled={changingPassword}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 inline-flex items-center min-h-11">
                {changingPassword ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </SectionCard>

      {/* ── Session ── */}
      <SectionCard
        title="Session &amp; Account Identity"
        subtitle="Details about your current doctor account login."
        icon={<ShieldCheckIcon className="h-5 w-5" />}
      >
        <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">Signed in as</p>
            <p className="mt-0.5 truncate text-xs text-slate-600">
              Licensed Healthcare Provider (Doctor Portal)
            </p>
          </div>
          <span className="shrink-0 self-start rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 sm:self-auto">
            {user?.email}
          </span>
        </div>

        <div className="flex flex-col gap-3 bg-red-50/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-900">Sign Out</p>
            <p className="mt-0.5 text-xs text-slate-600">
              End your active provider session on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsSignOutOpen(true)}
            className="shrink-0 self-start rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-600 transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 sm:self-auto inline-flex items-center min-h-11">
            Sign Out
          </button>
        </div>
      </SectionCard>

      {/* ── Forgotten password ── */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4">
        <p className="text-xs leading-5 text-slate-600">
          <span className="font-semibold text-slate-700">Can't sign in?</span>{' '}
          Use <span className="font-semibold text-slate-700">Forgot password?</span> on the doctor
          login page — we'll email you a reset code. For a full reset of a
          locked-out account, contact the clinic administrator.
        </p>
      </div>

      {/* ── Support & Legal ──
          The site-wide dark footer was removed from every page, so its Contact,
          Emergency and Legal content lives here instead — the one place a
          signed-in user goes looking for it. The footer's "Sign in" and
          "Create account" links were dropped rather than carried over: this tab
          is only reachable while already authenticated, so both would bounce
          the doctor to a login screen they just came from. */}
      <SectionCard
        title="Support &amp; Legal"
        subtitle="Contact details, emergency numbers and policy documents."
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        }
      >
        <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">Support</p>
            <p className="mt-0.5 text-xs text-slate-600">
              Symptom-based specialist routing to help you find the right care, right nearby.
            </p>
          </div>
          <a
            href="mailto:support@medassist.com"
            className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            support@medassist.com
          </a>
        </div>

        <div className="flex flex-col gap-3 bg-red-50/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-900">Medical Emergency</p>
            <p className="mt-0.5 text-xs text-slate-600">
              For medical emergencies, call 112 immediately. Do not wait for an
              appointment on this platform.
            </p>
          </div>
          <a
            href="tel:112"
            className="shrink-0 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-600 transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20"
          >
            Call 112
          </a>
        </div>

        <div className="px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Quick Links</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link
              to="/contact"
              className="rounded font-semibold text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              Contact us
            </Link>
            <Link
              to="/privacy"
              className="rounded font-semibold text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              Privacy Policy
            </Link>
            <Link
              to="/terms"
              className="rounded font-semibold text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </SectionCard>

      {/* text-slate-500 on white is ~4.8:1 (AA) at this size. */}
      <p className="text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} MedAssist. Academic project — not a medical device.
      </p>

      {/* Sign Out was the only destructive action in the product that skipped
          ConfirmDialog — cancel-appointment, vitals-clear and the demo loaders
          all prompt. It now names what is lost rather than signing out on one
          click, and Escape dismisses without ending the session. */}
      <ConfirmDialog
        isOpen={isSignOutOpen}
        onClose={() => setIsSignOutOpen(false)}
        onConfirm={() => {
          setIsSignOutOpen(false);
          logout();
        }}
        title="Sign out of the doctor portal?"
        body="You will need to sign in again on this device. Unsent consultation changes are lost."
        confirmLabel="Sign out"
        tone="danger"
      />
    </div>
  );
}
