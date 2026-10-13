import React, { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// Layout route: renders the nested route via <Outlet />. A `children` prop is
// never passed here, so returning it renders a blank page.
export default function DoctorRoute() {
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

  if (!localToken) {
    return <Navigate to="/doctor/login" replace />;
  }

  if (localUser?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (localUser?.role !== 'doctor') {
    // Send non-doctors to their own login, not back into ProtectedRoute
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
