import React from 'react';

export default function ForgotPasswordModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/10">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">
          🔒
        </div>
        <h3 className="text-xl font-bold tracking-tight text-slate-950">Password Reset</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Automated password resets are not currently enabled. Please contact your platform administrator to issue a new temporary password.
        </p>
        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
}
