import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
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

  if (localUser?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}
