import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Shared
import { AuthProvider } from './shared/context/AuthContext';
import ProtectedRoute from './shared/components/ProtectedRoute';
import DoctorRoute from './shared/components/DoctorRoute';
import AdminRoute from './shared/components/AdminRoute';
import ErrorBoundary from './shared/components/ErrorBoundary';

// ── Lazy-loaded pages ────────────────────────────────────────────────────────
// Route-based code splitting: each page loads only when its route is visited.
// Leaflet (~40KB gzipped) is inside the Dashboard chunk, so it does not block
// initial login/signup renders.

const Login = lazy(() => import('./features/auth/Login'));
const Signup = lazy(() => import('./features/auth/Signup'));
const DoctorLogin = lazy(() => import('./features/auth/DoctorLogin'));
const DoctorSignup = lazy(() => import('./features/auth/DoctorSignup'));
const AdminLogin = lazy(() => import('./features/auth/AdminLogin'));
const ResetPassword = lazy(() => import('./features/auth/ResetPassword'));

// Public
const Contact = lazy(() => import('./features/contact/Contact'));
const Privacy = lazy(() => import('./features/legal/Privacy'));
const Terms = lazy(() => import('./features/legal/Terms'));

// Patient
const Dashboard = lazy(() => import('./features/patient/Dashboard'));
const ProfileLayout = lazy(() => import('./features/patient/Profile/ProfileLayout'));

// Doctor
const DoctorDashboard = lazy(() => import('./features/doctor/DoctorDashboard'));

// Admin
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard'));
const DoctorDetail = lazy(() => import('./features/admin/DoctorDetail'));
const PatientDetail = lazy(() => import('./features/admin/PatientDetail'));

// 404
const NotFound = lazy(() => import('./shared/components/NotFound'));

// ── Loading fallback ────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        <p className="text-sm font-medium text-slate-500">Loading…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/doctor/login" element={<DoctorLogin />} />
            <Route path="/doctor/signup" element={<DoctorSignup />} />
            {/* Must stay outside AdminRoute: the guard redirects anonymous
                visitors to /admin/login, so nesting it there self-redirects. */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />

            {/* Protected patient routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/profile" element={<ProfileLayout />} />
            </Route>

            {/* Protected doctor routes */}
            <Route element={<DoctorRoute />}>
              <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
            </Route>

            {/* Protected admin routes */}
            <Route element={<AdminRoute />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/doctors/:id" element={<DoctorDetail />} />
              <Route path="/admin/patients/:id" element={<PatientDetail />} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
