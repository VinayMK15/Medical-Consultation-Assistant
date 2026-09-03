import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Shared
import { AuthProvider } from './shared/context/AuthContext';
import ProtectedRoute from './shared/components/ProtectedRoute';
import DoctorRoute from './shared/components/DoctorRoute';
import AdminRoute from './shared/components/AdminRoute';
import NotFound from './shared/components/NotFound';

// Auth
import Login from './features/auth/Login';
import Signup from './features/auth/Signup';
import DoctorLogin from './features/auth/DoctorLogin';
import DoctorSignup from './features/auth/DoctorSignup';
import AdminLogin from './features/auth/AdminLogin';
import ResetPassword from './features/auth/ResetPassword';

// Patient
import Dashboard from './features/patient/Dashboard';
import ProfileLayout from './features/patient/Profile/ProfileLayout';

// Doctor
import DoctorDashboard from './features/doctor/DoctorDashboard';

// Admin
import AdminDashboard from './features/admin/AdminDashboard';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/doctor/login" element={<DoctorLogin />} />
          <Route path="/doctor/signup" element={<DoctorSignup />} />
          <Route path="/doctor/dashboard" element={<DoctorRoute><DoctorDashboard /></DoctorRoute>} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfileLayout /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
