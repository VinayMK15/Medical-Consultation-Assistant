import React, { useState } from 'react';

// ── Reusable sub-components ──────────────────────────────────────────────────

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5">
        <h3 className="text-base font-bold tracking-tight text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function ToggleRow({ id, title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-6 px-6 py-4">
      <div>
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold text-slate-800">
          {title}
        </label>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      {/* Custom toggle */}
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          checked ? 'bg-blue-600' : 'bg-slate-200'
        }`}
      >
        <span className="sr-only">Toggle {title}</span>
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Settings() {
  // ── Notification state ──
  const [emailReminders, setEmailReminders] = useState(true);
  const [smsAlerts,      setSmsAlerts]      = useState(false);

  // ── Handlers ──
  const handlePasswordReset = () => {
    alert('Password reset instructions have been sent to your email.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal-600">Preferences</p>
        <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">Account Settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Manage your notification preferences and account security below.
        </p>
      </div>

      {/* ── Section 1: Notifications ── */}
      <SectionCard
        title="Notifications"
        subtitle="Choose how MedAssist keeps you informed about your health appointments."
      >
        <ToggleRow
          id="email-reminders"
          title="Email Reminders"
          description="Receive appointment confirmation and reminder emails 24 hours in advance."
          checked={emailReminders}
          onChange={setEmailReminders}
        />
        <ToggleRow
          id="sms-alerts"
          title="SMS Alerts"
          description="Receive text messages 2 hours before your appointment."
          checked={smsAlerts}
          onChange={setSmsAlerts}
        />
      </SectionCard>

      {/* ── Section 2: Security ── */}
      <SectionCard
        title="Security"
        subtitle="Manage your account security and authentication settings."
      >
        <div className="px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Change Password</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                A password reset link will be sent to your registered email address.
              </p>
            </div>
            <button
              onClick={handlePasswordReset}
              className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Request Reset
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Active Sessions</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                You are currently signed in on this device. Sign out of all sessions to revoke access everywhere.
              </p>
            </div>
            <button
              onClick={() => alert('All other sessions have been signed out.')}
              className="shrink-0 rounded-xl border border-red-100 bg-red-50 px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Sign Out All
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Footer note ── */}
      <p className="px-1 text-xs text-slate-400">
        Settings are saved locally and will be fully persisted once backend preference storage is enabled.
      </p>
    </div>
  );
}
