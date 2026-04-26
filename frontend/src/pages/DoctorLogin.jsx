import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ForgotPasswordModal from '../components/ForgotPasswordModal';

const providerHighlights = [
  'Review routed patient requests',
  'Access provider dashboard tools',
  'Admin-verified provider access',
];

export default function DoctorLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const { login, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      const role = data?.user?.role;

      if (role === 'doctor') {
        navigate('/doctor/dashboard');
      } else if (role === 'admin') {
        logout();
        setError('This account uses the restricted admin portal.');
      } else {
        // Patient trying to use the provider portal
        setError('This portal is for healthcare providers only. Please use the patient login.');
      }
    } catch (err) {
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        setError(Array.isArray(detail) ? detail[0].msg : detail);
      } else {
        setError('Failed to sign in. Please check your credentials.');
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
            <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-sm shadow-indigo-500/20">
              M
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">MedAssist</p>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-indigo-600">Provider routing portal</p>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
              Verified provider access
            </div>
            <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight text-slate-950">
              Sign in to the provider workspace.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
              Access routed patient requests, view queue details, and manage provider-side workflow after verification.
            </p>

            <div className="mt-8 grid gap-3">
              {providerHighlights.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-50"></span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-800">Need provider access?</p>
            <p className="mt-1 text-sm text-slate-500">
              Submit a provider profile for admin review before using this portal.
            </p>
            <Link
              to="/doctor/signup"
              className="mt-4 inline-flex rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100"
            >
              Register as provider
            </Link>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-sm shadow-indigo-500/20">
                  M
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight">MedAssist</p>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-indigo-600">Provider routing portal</p>
                </div>
              </div>
              <h1 className="mt-7 text-3xl font-bold leading-tight tracking-tight text-slate-950">
                Provider sign in.
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Access the dashboard for routed patient requests and provider workflow.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
              <div className="mb-7">
                <p className="text-sm font-semibold text-indigo-600">Provider portal</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Welcome back</h2>
                <p className="mt-2 text-sm text-slate-500">Sign in with your verified provider account.</p>
              </div>

              {error && (
                error.includes('pending admin verification') ? (
                  <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                    <span className="font-bold block mb-1">Account under review</span>
                    {error}
                  </div>
                ) : (
                  <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    <span className="font-bold">Warning:</span> {error}
                  </div>
                )
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="doctor-email">
                    Provider email
                  </label>
                  <input
                    id="doctor-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    placeholder="doctor@hospital.com"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-sm font-semibold text-slate-700" htmlFor="doctor-password">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-xs font-semibold text-indigo-600 transition hover:text-indigo-700 bg-transparent border-none p-0 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="doctor-password"
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
                  className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Signing in...' : 'Sign in to provider portal'}
                </button>
              </form>

              <div className="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
                Not a provider?{' '}
                <Link to="/login" className="font-bold text-indigo-600 transition hover:text-indigo-700">
                  Patient login
                </Link>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-center lg:hidden">
              <p className="text-sm font-semibold text-indigo-800">New provider?</p>
              <Link to="/doctor/signup" className="mt-2 inline-block text-sm font-bold text-indigo-700">
                Register your practice
              </Link>
            </div>
          </div>
        </section>
      </main>

      <ForgotPasswordModal isOpen={showForgotModal} onClose={() => setShowForgotModal(false)} />
    </div>
  );
}
