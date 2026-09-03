import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../../shared/context/AuthContext';

import PersonalInfo from './PersonalInfo';
import AppointmentHistory from './AppointmentHistory';
import Settings from './Settings';

const navItems = [
  { id: 'profile', label: 'Personal Info', icon: '👤' },
  { id: 'history', label: 'History', icon: '📅' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function ProfileLayout() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('profile');

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':  return <PersonalInfo />;
      case 'history':  return <AppointmentHistory />;
      case 'settings': return <Settings />;
      default:         return <PersonalInfo />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* ── Header ── */}
      <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur lg:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white shadow-sm shadow-blue-500/20">
              M
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-950">MedAssist</p>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-600">Patient Profile</p>
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-blue-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
            Back to Dashboard
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="mx-auto max-w-6xl px-5 py-8 lg:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome, {user?.full_name || user?.name || 'Patient'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your personal information, appointments, and preferences.
          </p>
        </div>

        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          {/* Sidebar */}
          <aside className="w-full shrink-0 md:w-56">
            <nav className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    activeTab === item.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <section className="flex-1">{renderContent()}</section>
        </div>
      </main>
    </div>
  );
}
