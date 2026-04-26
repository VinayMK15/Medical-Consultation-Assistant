import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const adminHighlights = [
  'Restricted platform controls',
  'Provider verification workflow',
  'Admin-only operational access',
];

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(email, password);

      if (data?.user?.role !== 'admin') {
        logout();
        setError('This portal is restricted to platform administrators.');
        return;
      }

      navigate('/admin/dashboard');
    } catch (err) {
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        setError(Array.isArray(detail) ? detail[0].msg : detail);
      } else {
        setError('Failed to sign in. Please check your admin credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="min-h-screen grid lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden lg:flex flex-col justify-between border-r border-slate-200 bg-white px-12 py-10">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              AD
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">MedAssist Admin</p>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-indigo-600">Restricted access</p>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
              Platform control center
            </div>
            <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight text-slate-950">
              Administrator sign in.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
              This private portal is for authorized platform administrators who review provider access and manage operational controls.
            </p>

            <div className="mt-8 grid gap-3">
              {adminHighlights.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-50"></span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">Private route</p>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              Admin access is not linked from patient or provider pages. Use this URL only if you are authorized.
            </p>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                  AD
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight">MedAssist Admin</p>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-indigo-600">Restricted access</p>
                </div>
              </div>
              <h1 className="mt-7 text-3xl font-bold leading-tight tracking-tight text-slate-950">
                Administrator sign in.
              </h1>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
              <div className="mb-7">
                <p className="text-sm font-semibold text-indigo-600">Admin portal</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Restricted platform access</h2>
                <p className="mt-2 text-sm text-slate-500">Sign in with an administrator account.</p>
              </div>

              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  <span className="font-bold">Warning:</span> {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="admin-email">
                    Admin email
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    placeholder="admin@medassist.com"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="admin-password">
                    Password
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    placeholder="********"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Signing in...' : 'Sign in as admin'}
                </button>
              </form>

              <div className="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
                Not an admin?{' '}
                <Link to="/login" className="font-bold text-indigo-600 transition hover:text-indigo-700">
                  Return to patient login
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
