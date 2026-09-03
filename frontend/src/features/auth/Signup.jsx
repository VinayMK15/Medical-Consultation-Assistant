import React, { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../shared/context/AuthContext';

const routingBenefits = [
  'Symptom-based doctor routing',
  'Location-aware specialist matches',
  'Saved access to your routing dashboard',
];

export default function Signup() {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    age: '',
    gender: 'Male',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { signup } = useContext(AuthContext);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const age = Number(formData.age);
    if (formData.age && (age < 0 || age > 120)) {
      setError('Please enter a valid age.');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const signupData = { ...formData };
      delete signupData.confirm_password;
      await signup({ ...signupData, role: 'patient' });
      setSubmitted(true);
    } catch (err) {
      if (err.response && err.response.data) {
        if (err.response.data.detail) {
          const detail = err.response.data.detail;
          setError(Array.isArray(detail) ? detail[0].msg : detail);
        } else if (err.response.data.error) {
          setError(err.response.data.error);
        } else {
          setError('Signup failed. Please try again.');
        }
      } else {
        setError('Network Error: Cannot connect to the server. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5 text-slate-900">
        <div className="w-full max-w-md text-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-10">
            <div className="w-16 h-16 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-5">
              ✓
            </div>
            <h2 className="text-2xl font-bold text-slate-950 mb-2">Account created!</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              Welcome, <span className="font-semibold text-blue-600">{formData.full_name}</span>. Your account is
              ready. Sign in to start finding doctors near you.
            </p>

            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-left mb-6">
              <p className="text-teal-800 text-sm font-semibold mb-1">What's next?</p>
              <ul className="text-teal-700 text-xs space-y-1 list-disc list-inside">
                <li>Sign in with your email and password</li>
                <li>Describe your symptoms to the routing assistant</li>
                <li>Get matched with nearby relevant specialists</li>
              </ul>
            </div>

            <Link
              to="/login"
              className="inline-block w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="min-h-screen grid lg:grid-cols-[0.95fr_1.05fr]">
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
              Patient account setup
            </div>
            <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight text-slate-950">
              Create your routing profile.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
              Your profile helps MedAssist organize doctor discovery around your symptoms, city, and basic patient details.
            </p>

            <div className="mt-8 grid gap-3">
              {routingBenefits.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-500 ring-4 ring-teal-50"></span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-800">Provider registration?</p>
            <p className="mt-1 text-sm text-slate-500">
              Healthcare professionals use a separate verification workflow.
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
          <div className="w-full max-w-lg">
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
                Create your account.
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Set up a patient profile for symptom-based routing and doctor discovery.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
              <div className="mb-7">
                <p className="text-sm font-semibold text-blue-600">Patient signup</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Join MedAssist</h2>
                <p className="mt-2 text-sm text-slate-500">Create an account to save routing results and doctor matches.</p>
              </div>

              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="full_name">
                    Full name
                  </label>
                  <input
                    id="full_name"
                    name="full_name"
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="email">
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="you@example.com"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="password">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      placeholder="********"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="confirm_password">
                      Confirm password
                    </label>
                    <input
                      id="confirm_password"
                      name="confirm_password"
                      type="password"
                      required
                      value={formData.confirm_password}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      placeholder="********"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="age">
                      Age
                    </label>
                    <input
                      id="age"
                      name="age"
                      type="number"
                      required
                      min="0"
                      max="120"
                      value={formData.age}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      placeholder="25"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="gender">
                      Gender
                    </label>
                    <select
                      id="gender"
                      name="gender"
                      required
                      value={formData.gender}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Creating account...' : 'Create patient account'}
                </button>
              </form>

              <div className="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
                Already have an account?{' '}
                <Link to="/login" className="font-bold text-blue-600 transition hover:text-blue-700">
                  Sign in
                </Link>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-center lg:hidden">
              <p className="text-sm font-semibold text-indigo-800">Registering as a provider?</p>
              <Link to="/doctor/signup" className="mt-2 inline-block text-sm font-bold text-indigo-700">
                Open provider registration
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
