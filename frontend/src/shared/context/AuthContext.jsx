import React, { createContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useSessionTimeout } from '../hooks/useSessionTimeout';

export const AuthContext = createContext();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode a JWT payload without verifying signature (client-side only). */
function decodeJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/** Returns true if the JWT token is expired. */
function isTokenExpired(token) {
  const payload = decodeJwt(token);
  if (!payload?.exp) return true;
  // exp is in seconds; Date.now() is in milliseconds
  return Date.now() >= payload.exp * 1000;
}

/** Returns the login path for a given role. */
function loginPathForRole(role) {
  if (role === 'doctor') return '/doctor/login';
  if (role === 'admin')  return '/admin/login';
  return '/login';
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // ── Token expiry check on mount / page refresh ───────────────────────────
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken && isTokenExpired(storedToken)) {
      // Token is stale — clear everything and redirect to the right login
      let role = null;
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        role = u?.role;
        if (u?.email) sessionStorage.removeItem(`medassist_session_${u.email}`);
      } catch { /* ignore */ }

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);

      window.location.replace(loginPathForRole(role) + '?expired=true');
    }
  }, []);

  // ── Inactivity timeout: logout after 30 min of idle ─────────────────────
  const handleInactivityTimeout = useCallback(() => {
    const role = user?.role;
    const email = user?.email;

    if (email) sessionStorage.removeItem(`medassist_session_${email}`);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);

    window.location.replace(loginPathForRole(role) + '?timeout=true');
  }, [user]);

  // Only run the inactivity watcher when a user is logged in
  useSessionTimeout(handleInactivityTimeout, !!token);

  // ── Auth actions ─────────────────────────────────────────────────────────

  const login = async (email, password, endpoint = '/api/auth/patient/login') => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await api.post(endpoint, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
    return response.data;
  };

  const signup = async (userData, endpoint = '/api/auth/patient/signup') => {
    const response = await api.post(endpoint, userData);
    return response.data;
  };

  const logout = () => {
    if (user?.email) sessionStorage.removeItem(`medassist_session_${user.email}`);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const updateUserSession = (updates) => {
    setUser((prev) => {
      const updated = { ...prev, ...updates };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, updateUserSession }}>
      {children}
    </AuthContext.Provider>
  );
};
