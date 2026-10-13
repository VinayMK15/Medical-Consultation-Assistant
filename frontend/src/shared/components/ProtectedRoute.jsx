import React, { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// Used as a layout route (`<Route element={<ProtectedRoute />}>`), so the
// nested route renders through <Outlet />, not a `children` prop. Returning
// `children` here yields undefined and the page renders blank.
export default function ProtectedRoute() {
  const { token, user } = useContext(AuthContext);

  // Fallback to localStorage to prevent race conditions during login navigation
  const localToken = token || localStorage.getItem('token');
  let localUser = user;
  if (!localUser) {
    try {
      const stored = localStorage.getItem('user');
      if (stored) localUser = JSON.parse(stored);
    } catch { /* ignore */ }
  }

  // Not logged in at all → go to patient login
  if (!localToken) {
    return <Navigate to="/login" replace />;
  }

  // Wrong role: doctors/admins who land on the patient portal
  // Send them to their own dashboard — they're already logged in
  if (localUser?.role === 'doctor') {
    return <Navigate to="/doctor/dashboard" replace />;
  }

  if (['admin', 'superadmin'].includes(localUser?.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Outlet />;
}
