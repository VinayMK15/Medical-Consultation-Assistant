import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DoctorRoute from './components/DoctorRoute';
import AdminRoute from './components/AdminRoute';
import Dashboard from './pages/Dashboard';
import ProfileLayout from './pages/Profile/ProfileLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import DoctorDashboard from './pages/DoctorDashboard';
import DoctorLogin from './pages/DoctorLogin';
import DoctorSignup from './pages/DoctorSignup';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import NotFound from './pages/NotFound';
import ResetPassword from './pages/ResetPassword';

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
