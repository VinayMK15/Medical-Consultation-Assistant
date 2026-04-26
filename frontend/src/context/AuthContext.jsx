import React, { createContext, useState, useEffect } from 'react';
import api from '../utils/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = async (email, password) => {
    try {
      const response = await api.post('/api/auth/login', { email, password }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const { access_token, user: userData } = response.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(access_token);
      setUser(userData);
      return response.data;
    } catch (error) {
      throw error;
    }
  };

  const signup = async (userData) => {
    const response = await api.post('/api/auth/signup', userData);
    return response.data;
  };

  const logout = () => {
    // Clear NLP chat session so next login starts fresh
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u?.email) sessionStorage.removeItem(`medassist_session_${u.email}`);
      } catch { /* ignore */ }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
