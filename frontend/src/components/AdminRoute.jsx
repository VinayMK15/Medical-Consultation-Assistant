import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function AdminRoute({ children }) {
  const { token, user } = useContext(AuthContext);

  if (!token) {
    return <Navigate to="/admin/login" replace />;
  }

  if (user?.role !== 'admin') {
    if (user?.role === 'doctor') {
      return <Navigate to="/doctor/dashboard" replace />;
    }

    return <Navigate to="/" replace />;
  }

  return children;
}
