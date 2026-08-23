import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function AdminRoute({ children }) {
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
    return <Navigate to="/admin/login" replace />;
  }

  if (localUser?.role !== 'admin') {
    if (localUser?.role === 'doctor') {
      return <Navigate to="/doctor/dashboard" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
}
