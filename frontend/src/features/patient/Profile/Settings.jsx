import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../../shared/context/AuthContext';
import Modal from '../../../shared/components/ui/Modal';
import api from '../../../shared/utils/api';

// ── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ title, subtitle, icon, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
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

// ── Toggle Row ────────────────────────────────────────────────────────────────
function ToggleRow({ id, title, description, checked, onChange, busy, disabled }) {
  return (
    <div className="flex items-center justify-between gap-6 px-6 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold text-slate-800">
          {title}
        </label>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span className="sr-only">Toggle {title}</span>
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// ── Action Row ────────────────────────────────────────────────────────────────
function ActionRow({ title, description, children }) {
  return (
    <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

// Small secondary button used by the action rows
function GhostButton({ onClick, disabled, children, tone = 'primary' }) {
  const tones = {
    primary: 'border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700',
    danger: 'border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-4 py-2 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Settings() {
  const { user, logout } = useContext(AuthContext);

  const [appointmentEmails, setAppointmentEmails] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingPref, setSavingPref] = useState(false);
  const [error, setError] = useState('');

  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState('email'); // email | code
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // Load the stored preference. A failure here must not silently read as
  // "off" — the toggle would then be flipped by the user's first click.
  useEffect(() => {
    let cancelled = false;
    api.get('/api/patient/settings')
      .then((res) => {
        if (!cancelled) setAppointmentEmails(res.data?.appointment_emails !== false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.detail || 'Could not load your preferences.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async (next) => {
    const previous = appointmentEmails;
    setAppointmentEmails(next);      // optimistic
    setSavingPref(true);
    setError('');
    try {
      const res = await api.put('/api/patient/settings', { appointment_emails: next });
      setAppointmentEmails(res.data?.appointment_emails !== false);
    } catch (err) {
      setAppointmentEmails(previous); // roll back so the UI matches the server
      setError(err.response?.data?.detail || 'Could not save that change. Please try again.');
    } finally {
      setSavingPref(false);
    }
  };

  // Resend countdown
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const openReset = () => {
    setIsResetOpen(true);
    setResetStep('email');
    setResetCode('');
    setResetPassword('');
    setResetError('');
    setResendIn(0);
  };

  const closeReset = () => {
    setIsResetOpen(false);
    setResetStep('email');
    setResetCode('');
    setResetPassword('');
    setResetError('');
  };

  // The code is emailed to the account on file. Verification still requires
  // this session, so requesting a code for some other address gains nothing:
  // the code would be stored on that account and only they could redeem it.
  const requestCode = async () => {
    setResetBusy(true);
    setResetError('');
    try {
      await api.post('/api/auth/forgot-password', { email: user?.email, mode: 'code' });
      setResetStep('code');
      setResendIn(30);
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Could not send a code. Please try again.');
    } finally {
      setResetBusy(false);
    }
  };

  const resendCode = async () => {
    if (resendIn > 0) return;
    setResetBusy(true);
    setResetError('');
    try {
      await api.post('/api/auth/forgot-password', { email: user?.email, mode: 'code' });
      setResendIn(30);
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Could not resend the code.');
    } finally {
      setResetBusy(false);
    }
  };

  const confirmReset = async (e) => {
    e.preventDefault();
    setResetError('');
    if (!/^\d{6}$/.test(resetCode)) {
      setResetError('Enter the 6-digit code from your email.');
      return;
    }
    if (resetPassword.length < 8) {
      setResetError('New password must be at least 8 characters.');
      return;
    }
    setResetBusy(true);
    try {
      await api.post('/api/auth/verify-reset-code', {
        code: resetCode,
        new_password: resetPassword,
      });
      // The token in storage still carries the old password hash's session;
      // force a fresh sign-in so the user lands on the login page cleanly.
      logout();
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Could not update your password.');
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="space-y-5">

      {/* Notifications */}
      <SectionCard
        title="Notifications"
        subtitle="Choose which emails MedAssist sends about your appointments."
        icon={
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
        }
      >
        <ToggleRow
          id="appointment-emails"
          title="Appointment Emails"
          description="Get confirmation, cancellation and summary emails about your bookings."
          checked={appointmentEmails}
          onChange={handleToggle}
          busy={savingPref}
          disabled={loading}
        />
        {error && (
          <p className="flex items-center gap-1.5 px-6 py-3 text-xs font-semibold text-danger-600">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </p>
        )}
      </SectionCard>

      {/* Security */}
      <SectionCard
        title="Security"
        subtitle="Manage your password and account access."
        icon={
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
        }
      >
        <ActionRow
          title="Change Password"
          description="We'll email you a 6-digit code to confirm it's you, then you can set a new one."
        >
          <GhostButton onClick={openReset}>Change Password</GhostButton>
        </ActionRow>
        <ActionRow
          title="Sign Out"
          description="End your session on this device."
        >
          <GhostButton onClick={logout} tone="danger">Sign Out</GhostButton>
        </ActionRow>
      </SectionCard>

      <p className="px-1 text-xs leading-5 text-slate-600">
        Your preferences are stored on your MedAssist account and apply to every device you sign in on.
      </p>

      {/* ── Password change dialog ──
          Migrated onto the shared Modal primitive: this dialog previously had
          no role="dialog", no aria-modal, no Escape handler, no focus trap
          and no scroll lock. Backdrop close stays disabled while busy. */}
      <Modal
        isOpen={isResetOpen}
        onClose={closeReset}
        labelledBy="change-password-title"
        closeOnBackdrop={!resetBusy}
        onClosePrevented={() => resetBusy}
        overlayClassName="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/55 px-4 py-4 backdrop-blur-sm"
        panelClassName="max-w-sm rounded-2xl shadow-slate-900/25"
        closeButtonClassName="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        closeButtonLabel="Close change password dialog"
      >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <h3 id="change-password-title" className="text-sm font-bold text-slate-900">Change Password</h3>
            </div>

            <div className="px-5 py-4">
              {resetStep === 'email' ? (
                <>
                  <p className="text-xs leading-5 text-slate-600">
                    We'll email a 6-digit verification code to the address on your account.
                    The code expires in 10 minutes.
                  </p>
                  {resetError && (
                    <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-danger-700">
                      <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      {resetError}
                    </p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={closeReset}
                      disabled={resetBusy}
                      className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 min-h-11">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={requestCode}
                      disabled={resetBusy}
                      className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/30 transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 min-h-11">
                      {resetBusy ? 'Sending…' : 'Send Code'}
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={confirmReset} className="space-y-3.5">
                  <p className="text-xs leading-5 text-slate-600">
                    Enter the 6-digit code we emailed you, then choose a new password.
                  </p>

                  <div>
                    <label htmlFor="reset-code" className="mb-1.5 block text-sm font-bold text-slate-700">
                      Verification Code
                    </label>
                    <input
                      id="reset-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      aria-describedby="reset-code-hint"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-center text-lg font-bold tracking-[0.4em] text-slate-900 outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                    />
                    <div className="mt-1.5 flex items-center justify-between">
                      {/* aria-live because the countdown ticks every second and
                          would otherwise change silently under a screen reader. */}
                      <span id="reset-code-hint" aria-live="polite" className="text-sm text-slate-600">
                        Expires in 10 minutes
                      </span>
                      <button
                        type="button"
                        onClick={resendCode}
                        disabled={resetBusy || resendIn > 0}
                        className="min-h-11 rounded-lg px-2 text-sm font-bold text-blue-600 transition hover:text-blue-800 disabled:text-slate-500 disabled:hover:text-slate-500"
                      >
                        {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reset-password" className="mb-1.5 block text-sm font-bold text-slate-700">
                      New Password
                    </label>
                    <input
                      id="reset-password"
                      type="password"
                      autoComplete="new-password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                    />
                  </div>

                  {resetError && (
                    <p role="alert" className="flex items-center gap-1.5 text-sm font-semibold text-danger-700">
                      <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      {resetError}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeReset}
                      disabled={resetBusy}
                      className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 min-h-11">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resetBusy}
                      className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/30 transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 min-h-11">
                      {resetBusy ? 'Updating…' : 'Update Password'}
                    </button>
                  </div>
                </form>
              )}
            </div>
      </Modal>
    </div>
  );
}
