import React, { createContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useSessionTimeout } from '../hooks/useSessionTimeout';

export const AuthContext = createContext();

// ---------------------------------------------------------------------------
// Persistent-vs-session storage routing ("Remember me")
// ---------------------------------------------------------------------------

/** Storage holding the current session (local if remembered, else session). */
function getSessionStore() {
  try {
    if (sessionStorage.getItem('token')) return sessionStorage;
  } catch { /* ignore */ }
  return localStorage;
}

/** Read a session value from whichever store holds it. */
function getSessionItem(key) {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Clear session values from both stores. */
function clearSessionItems() {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
  } catch { /* ignore */ }
}

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
  const [token, setToken] = useState(() => getSessionItem('token'));
  const [user, setUser] = useState(() => {
    try {
      const stored = getSessionItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // ── Token expiry check on mount / page refresh ───────────────────────────
  useEffect(() => {
    const storedToken = getSessionItem('token');
    if (storedToken && isTokenExpired(storedToken)) {
      // Token is stale — clear everything and redirect to the right login
      let role = null;
      try {
        const u = JSON.parse(getSessionItem('user') || '{}');
        role = u?.role;
        if (u?.email) sessionStorage.removeItem(`medassist_session_${u.email}`);
      } catch { /* ignore */ }

      clearSessionItems();
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
    clearSessionItems();
    setToken(null);
    setUser(null);

    window.location.replace(loginPathForRole(role) + '?timeout=true');
  }, [user]);

  // Only run the inactivity watcher when a user is logged in
  useSessionTimeout(handleInactivityTimeout, !!token);

  // ── Auth actions ─────────────────────────────────────────────────────────

  const login = async (email, password, endpoint = '/api/auth/patient/login', rememberMe = true) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await api.post(endpoint, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, user: userData } = response.data;
    const store = rememberMe ? localStorage : sessionStorage;
    clearSessionItems();
    store.setItem('token', access_token);
    store.setItem('user', JSON.stringify(userData));
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
    clearSessionItems();
    setToken(null);
    setUser(null);
  };

  const updateUserSession = (updates) => {
    setUser((prev) => {
      const updated = { ...prev, ...updates };
      getSessionStore().setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, updateUserSession }}>
      {children}
    </AuthContext.Provider>
  );
};
