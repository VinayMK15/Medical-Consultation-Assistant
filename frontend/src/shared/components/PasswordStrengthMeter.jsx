import React, { useState, useEffect } from 'react';

/**
 * Password strength meter, shared by patient and provider signup.
 *
 * Advisory only — it never blocks submission; the backend's length rule is
 * the authority. Renders nothing until a character is typed, so it doesn't
 * sit as a dead bar above an empty field.
 */
export default function PasswordStrengthMeter({ password }) {
  const [strength, setStrength] = useState(0);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!password) {
      setStrength(0);
      setLabel('');
      return;
    }
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    setStrength(Math.min(score, 4));
    setLabel(['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score]);
  }, [password]);

  if (!password) return null;

  const colors = [
    'bg-danger-500',
    'bg-warning-500',
    'bg-warning-500',
    'bg-primary-500',
    'bg-success-500',
  ];

  return (
    <div className="space-y-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colors[strength]}`}
          style={{ width: `${(strength / 4) * 100}%` }}
        />
      </div>
      <p className="text-xs font-medium text-slate-600">{label}</p>
    </div>
  );
}

/**
 * Collapsed wrapper for genuinely optional fields.
 *
 * Long signups ask for things most people skip; showing them inline makes
 * the form look longer and busier than it needs to be. Age and gender are
 * optional on both signup flows and are the worst offenders.
 */
export function OptionalField({ label, children }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer select-none items-center gap-2 py-1 text-xs font-medium text-slate-600 transition-colors group-open:text-slate-800">
        <span>{label} (optional)</span>
        <svg
          className="h-3.5 w-3.5 text-slate-500 transition-transform group-open:rotate-180"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="mt-2 space-y-3 animate-in slide-in-from-top-2 duration-200">
        {children}
      </div>
    </details>
  );
}
