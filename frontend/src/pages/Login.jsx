import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ForgotPasswordModal from '../components/ForgotPasswordModal';

const trustPoints = [
  'Symptom-based routing',
  'Nearby specialist matching',
  'Patient and provider portals',
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);

  const { login, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await login(email, password);
      const role = data?.user?.role;
      if (role === 'doctor') {
        navigate('/doctor/dashboard');
      } else if (role === 'admin') {
        logout();
        setError('This account uses the restricted admin portal.');
      } else {
        navigate('/');
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          setError(detail[0].msg);
        } else if (typeof detail === 'string') {
          setError(detail);
        } else {
          setError(JSON.stringify(detail));
        }
      } else {
        setError('Failed to login. Please check your credentials.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="min-h-screen grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden lg:flex flex-col justify-between border-r border-slate-200 bg-white px-12 py-10">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-sm shadow-blue-500/20">
              M
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">MedAssist</p>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-teal-600">Patient routing gateway</p>
            </div>
          </div>

          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500"></span>
              Medical routing assistant
            </div>
            <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight text-slate-950">
              Describe symptoms, find the right specialist nearby.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
              MedAssist routes patients toward relevant doctors based on symptoms and location. It helps with direction, not diagnosis or medical consultation.
            </p>

            <div className="mt-8 grid gap-3">
              {trustPoints.map((point) => (
                <div key={point} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-500 ring-4 ring-teal-50"></span>
                  {point}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mode</p>
              <p className="mt-1 text-sm font-bold text-slate-800">Patient</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Focus</p>
              <p className="mt-1 text-sm font-bold text-slate-800">Triage</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
              <p className="mt-1 text-sm font-bold text-teal-700">Ready</p>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-sm shadow-blue-500/20">
                  M
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight">MedAssist</p>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-600">Patient routing gateway</p>
                </div>
              </div>
              <h1 className="mt-7 text-3xl font-bold leading-tight tracking-tight text-slate-950">
                Find the right doctor faster.
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Sign in to continue symptom-based routing and doctor discovery.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
              <div className="mb-7">
                <p className="text-sm font-semibold text-blue-600">Patient portal</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Welcome back</h2>
                <p className="mt-2 text-sm text-slate-500">Access your dashboard, routing history, and doctor matches.</p>
              </div>

              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="email">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-sm font-semibold text-slate-700" htmlFor="password">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-xs font-semibold text-blue-600 transition hover:text-blue-700 bg-transparent border-none p-0 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="********"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  Sign in
                </button>
              </form>

              <div className="mt-7 border-t border-slate-100 pt-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/signup"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    Create account
                  </Link>
                  <Link
                    to="/doctor/login"
                    className="flex-1 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-center text-sm font-bold text-indigo-700 transition hover:border-indigo-200 hover:bg-indigo-100"
                  >
                    Provider portal
                  </Link>
                </div>
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-slate-400">
              For emergencies, contact local emergency services immediately.
            </p>
          </div>
        </section>
      </main>

      <ForgotPasswordModal isOpen={showForgotModal} onClose={() => setShowForgotModal(false)} />
    </div>
  );
}
