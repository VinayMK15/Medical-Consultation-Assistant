import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function DoctorRoute({ children }) {
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

  return children;
}
