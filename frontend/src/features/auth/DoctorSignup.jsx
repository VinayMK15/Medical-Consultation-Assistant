import React, { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../shared/context/AuthContext';
import { SPECIALIZATIONS } from '../../shared/constants/specializations';


const providerSteps = [
  'Submit provider profile',
  'Wait for admin verification',
  'Access routed patient requests after approval',
];

export default function DoctorSignup() {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    specialization: '',
    gender: 'Male',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { signup } = useContext(AuthContext);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // role is always 'doctor' -- hardcoded and not exposed to the user
      const signupData = { ...formData };
      delete signupData.confirm_password;
      await signup({ ...signupData, role: 'doctor' });
      setSubmitted(true);
    } catch (err) {
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        setError(Array.isArray(detail) ? detail[0].msg : detail);
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Pending Approval Screen ---
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5 text-slate-900">
        <div className="w-full max-w-md text-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-10">
            <div className="w-16 h-16 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center text-lg font-bold mx-auto mb-5">
              OK
            </div>
            <h2 className="text-2xl font-bold text-slate-950 mb-2">Application submitted</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              Thank you, <span className="font-semibold text-indigo-600">{formData.full_name}</span>. Your provider account
              has been created and is <span className="font-semibold">pending admin verification</span>.
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-6">
              <p className="text-amber-800 text-sm font-semibold mb-1">What happens next?</p>
              <ul className="text-amber-700 text-xs space-y-1 list-disc list-inside">
                <li>An admin will review your credentials</li>
                <li>Your dashboard access activates after verification</li>
                <li>After approval you can sign in via the provider portal</li>
              </ul>
            </div>

            <Link
              to="/doctor/login"
              className="inline-block w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              Go to Provider Portal Login
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
              Provider verification workflow
            </div>
            <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight text-slate-950">
              Join the routing network.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
              Provider accounts are reviewed before they can access patient routing requests and dashboard tools.
            </p>

            <div className="mt-8 grid gap-3">
              {providerSteps.map((step) => (
                <div key={step} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <span className="h-7 w-7 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold border border-indigo-100">
                    {providerSteps.indexOf(step) + 1}
                  </span>
                  {step}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-800">Patient account?</p>
            <p className="mt-1 text-sm text-slate-500">
              Patients can create a routing profile from the standard signup page.
            </p>
            <Link
              to="/signup"
              className="mt-4 inline-flex rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
            >
              Create patient account
            </Link>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-lg">
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
                Provider registration.
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Submit your profile for admin verification before dashboard access.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
              <div className="mb-7">
                <p className="text-sm font-semibold text-indigo-600">Provider signup</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Create provider profile</h2>
                <p className="mt-2 text-sm text-slate-500">Your account will be reviewed by an admin before activation.</p>
              </div>

              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  <span className="font-bold">Warning:</span> {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="ds-name">
                    Full name
                  </label>
                  <input
                    id="ds-name"
                    name="full_name"
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    placeholder="Dr. Jane Smith"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="ds-email">
                    Professional email
                  </label>
                  <input
                    id="ds-email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    placeholder="doctor@hospital.com"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="ds-password">
                      Password
                    </label>
                    <input
                      id="ds-password"
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                      placeholder="Min. 8 characters"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="ds-confirm-password">
                      Confirm password
                    </label>
                    <input
                      id="ds-confirm-password"
                      name="confirm_password"
                      type="password"
                      required
                      minLength={8}
                      value={formData.confirm_password}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                      placeholder="Repeat password"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="ds-specialization">
                      Specialization
                    </label>
                    <select
                      id="ds-specialization"
                      name="specialization"
                      required
                      value={formData.specialization}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    >
                      <option value="" disabled>Select...</option>
                      {SPECIALIZATIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700" htmlFor="ds-gender">
                      Gender
                    </label>
                    <select
                      id="ds-gender"
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-medium leading-5 text-indigo-700">
                  Note: Provider accounts remain pending until an admin verifies them.
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Submitting application...' : 'Submit provider application'}
                </button>
              </form>

              <div className="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
                Already registered?{' '}
                <Link to="/doctor/login" className="font-bold text-indigo-600 transition hover:text-indigo-700">
                  Sign in to provider portal
                </Link>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-center lg:hidden">
              <p className="text-sm font-semibold text-blue-800">Are you a patient?</p>
              <Link to="/signup" className="mt-2 inline-block text-sm font-bold text-blue-700">
                Create patient account
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
