import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

/** Returns the correct login URL based on the stored user's role. */
function getLoginUrlForRole() {
  try {
    const stored = localStorage.getItem('user');
    if (stored) {
      const u = JSON.parse(stored);
      if (u?.role === 'doctor') return '/doctor/login?expired=true';
      if (u?.role === 'admin')  return '/admin/login?expired=true';
    }
  } catch { /* ignore */ }
  return '/login?expired=true';
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const loginUrl = getLoginUrlForRole();

      // Clear local auth storage
      try {
        const stored = localStorage.getItem('user');
        if (stored) {
          const u = JSON.parse(stored);
          if (u?.email) sessionStorage.removeItem(`medassist_session_${u.email}`);
        }
      } catch { /* ignore */ }
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // Redirect to the correct portal login, unless already on a login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = loginUrl;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
