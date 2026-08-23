import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export default function ForgotPasswordModal({ isOpen, onClose }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/api/auth/forgot-password', { email });
      // For demo purposes, we redirect immediately if a token is returned
      if (res.data.reset_token) {
        onClose();
        navigate(`/reset-password?token=${res.data.reset_token}`);
      } else {
        setError(res.data.message || 'An error occurred.');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to request password reset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/10">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">
          🔒
        </div>
        <h3 className="text-xl font-bold tracking-tight text-slate-950">Password Reset</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Enter your email address to receive a secure password reset link.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5">
          <label className="mb-1 block text-xs font-bold text-slate-700">Email Address</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
            placeholder="name@example.com"
          />

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
