import React, { useRef, useState } from 'react';
import Modal from '../../../shared/components/ui/Modal';
import { Input } from '../../../shared/components/ui/Input';
import api from '../../../shared/utils/api';

/**
 * Migrated onto the shared `Modal` primitive.
 *
 * Previously this was a bare div pair: no role="dialog", no aria-modal, no
 * Escape handler, no backdrop dismissal, no focus management, and a label with
 * no `htmlFor`. PatientReportModal already implemented all of that correctly,
 * so this was a regression against a pattern the codebase already had.
 */
export default function ForgotPasswordModal({ isOpen, onClose }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const emailRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await api.post('/api/auth/forgot-password', { email });
      setSuccess(
        res.data.message || 'If an account exists, a password reset link has been sent.'
      );
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Failed to request password reset. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Escape must not discard a half-typed address.
  const handleClose = () => {
    if (loading) return;
    setEmail('');
    setError('');
    setSuccess('');
    onClose?.();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Password Reset"
      closeOnBackdrop={!loading}
      initialFocusRef={emailRef}
      overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 px-5 backdrop-blur-sm"
      panelClassName="max-w-sm rounded-2xl border border-slate-200 p-6"
      closeButtonClassName="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      closeButtonLabel="Close password reset"
    >
      <div aria-hidden="true" className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">
        🔒
      </div>
      <h3 className="text-xl font-bold tracking-tight text-slate-950">Password Reset</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Enter your email address to receive a secure password reset link.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700"
        >
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5">
        <Input
          ref={emailRef}
          label="Email Address"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Link'}
          </button>
        </div>
      </form>
    </Modal>
  );
}