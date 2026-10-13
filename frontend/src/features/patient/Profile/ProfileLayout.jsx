import React, { useState, useRef, useEffect, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AuthContext } from '../../../shared/context/AuthContext';

import PersonalInfo from './PersonalInfo';
import AppointmentHistory from './AppointmentHistory';
import Settings from './Settings';
import SkipLink from '../../../shared/components/SkipLink';
import BrandLogo from '../../../shared/components/BrandLogo';
import useDocumentTitle from '../../../hooks/useDocumentTitle';

const NAV_ITEMS = [
  {
    id: 'profile',
    label: 'Personal Info',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4.5 w-4.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'Appointments',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4.5 w-4.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4.5 w-4.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
];

export default function ProfileLayout() {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  // Active tab lives in the URL so deep links work. The patient dashboard's
  // "View all" links here with ?tab=history; before this it always landed on
  // Personal Info, which is not what that link promises.
  //
  // Derived rather than mirrored into state: a state copy needed a syncing
  // effect, which caused a second render on every navigation and could drift
  // out of step with the URL on browser back/forward.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = NAV_ITEMS.some((i) => i.id === requestedTab) ? requestedTab : 'profile';

  const setActiveTab = (id) => {
    setSearchParams(id === 'profile' ? {} : { tab: id }, { replace: true });
  };
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useDocumentTitle('Profile');
  const patientName = user?.full_name || user?.name || 'Patient';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':  return <PersonalInfo />;
      case 'history':  return <AppointmentHistory />;
      case 'settings': return <Settings />;
      default:         return <PersonalInfo />;
    }
  };

  const pageTitles = {
    profile: 'Personal Information',
    history: 'Appointment History',
    settings: 'Account Settings',
  };

  return (
    // Shell lock. The document itself never scrolls here; <main> is the only
    // scroll region. `min-h-0` is carried at every level of the flex chain
    // (root -> body wrapper -> body row -> main): a flex item defaults to
    // min-height:auto and will refuse to shrink below its content, so dropping
    // it at any one level silently breaks the lock and lets the page scroll
    // again.
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 font-sans text-slate-900">
      <Helmet>
        <title>My Profile</title>
        <meta name="description" content="View and update your personal information, appointments, and settings on MedAssist." />
      </Helmet>

      {/* ── Top Bar (mirrors Dashboard) ── */}
      <header className="sticky top-0 z-[1000] shrink-0 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur lg:px-6">
        <div className="flex items-center justify-between">

          {/* Left: Logo + breadcrumb back */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <BrandLogo size="lg" />
              <h1 className="text-xl font-bold tracking-tight text-slate-950 leading-tight">MedAssist</h1>
            </div>

            {/* Divider */}
            <div className="hidden h-5 w-px bg-slate-200 sm:block" />

            {/* Back to dashboard */}
            <button
              onClick={() => navigate('/')}
              className="hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-blue-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Dashboard
            </button>
          </div>

          {/* Center: current page title */}
          <p className="hidden md:block text-sm font-semibold text-slate-600">{pageTitles[activeTab]}</p>

          {/* Right: Avatar menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setProfileMenuOpen((p) => !p)}
              className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white p-1 pr-3 shadow-sm transition hover:border-blue-300 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-bold uppercase text-white shadow-sm">
                {patientName.charAt(0)}
              </span>
              <span className="hidden sm:inline-block text-xs font-semibold text-slate-700 max-w-[120px] truncate">
                {patientName}
              </span>
              <svg
                className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${profileMenuOpen ? 'rotate-180 text-blue-600' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-2xl shadow-slate-900/15 backdrop-blur-md z-[1100]">
                <div className="border-b border-slate-100 px-3 py-2.5 mb-1 bg-slate-50/70 rounded-xl">
                  <p className="text-xs font-bold text-slate-900 truncate">{patientName}</p>
                  {/* truncate here is deliberate — it keeps the top bar compact — so the full
                    address is still reachable on hover. */}
                  <p className="text-xs text-slate-500 truncate" title={user?.email}>{user?.email}</p>
                </div>
                <button
                  onClick={() => { setProfileMenuOpen(false); navigate('/'); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                    </svg>
                  </span>
                  Dashboard
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => { setProfileMenuOpen(false); logout(); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600">
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v.659m11.963 0.982l1.04 1.04c.244.244.327.577.22.91a7.003 7.003 0 01-.752 2.016A7.07 7.07 0 016 12.21v.75a2.25 2.25 0 01-2.25 2.25H3" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6.364-3.636a9 9 0 00-1.857-.586m-8.014 0A9 9 0 009 3.75m9 8.614v.75a15 15 0 01-2.062 4.887m0 0A9 9 0 013.75 12m0 0a9 9 0 019-9" />
                    </svg>
                  </span>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 min-h-0 lg:px-6">
        <div className="flex min-h-0 flex-1 gap-7">

          {/* ── Left Sidebar ── */}
          <aside className="hidden md:flex w-56 shrink-0 flex-col gap-4">
            {/* Identity card. Deliberately identical on every tab — an
                earlier pass made this compact on Personal Info to avoid
                restating the header, but a sidebar that visibly reshuffles
                when you switch tabs reads as a bug, not as restraint. */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-xl font-bold uppercase text-white shadow-md shadow-blue-500/20">
                  {patientName.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 leading-tight">{patientName}</p>
                  {/* Wraps rather than ellipsises: the address is the account identifier, and
                    `truncate` made the sidebar read as broken
                    ("emptyspotify12@gmail.c…"). */}
                  <p className="text-xs text-slate-500 mt-0.5 break-all" title={user?.email}>{user?.email}</p>
                </div>
              </div>
            </div>

            {/* Nav links */}
            <nav className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <p className="px-4 pt-3 pb-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">Navigation</p>
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`relative flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {/* Active left border accent */}
                    {isActive && (
                      <span className="absolute left-0 top-0 h-full w-[3px] rounded-r-full bg-blue-600" />
                    )}
                    <span className={isActive ? 'text-blue-600' : 'text-slate-500'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                );
              })}
              <div className="mt-2 border-t border-slate-100">
                <button
                  onClick={() => navigate('/')}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-blue-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4.5 w-4.5 text-slate-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                  </svg>
                  Back to Dashboard
                </button>
              </div>
            </nav>
          </aside>

          {/* ── Mobile Tab Bar ──
              Below `sm` the top-bar Dashboard link is hidden and the
              sidebar isn't rendered at all, so this row was the only
              navigation on a phone — with no way back to the Dashboard.
              A dedicated leading button closes that gap. */}
          <div className="md:hidden w-full mb-4">
            <nav className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                onClick={() => navigate('/')}
                aria-label="Back to Dashboard"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4.5 w-4.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
              </button>
              <div className="h-5 w-px shrink-0 bg-slate-200" />
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition ${
                      isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className={isActive ? 'text-white' : 'text-slate-500'}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <SkipLink />
          {/* ── Main Content ── */}
          <main id="main-content" className="flex-1 min-w-0 min-h-0 overflow-y-auto" tabIndex={-1}>
            {/* Page header */}
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">{pageTitles[activeTab]}</h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  {activeTab === 'profile' && 'View and edit your personal details.'}
                  {activeTab === 'history' && 'Track your past and upcoming appointments.'}
                  {activeTab === 'settings' && 'Manage notifications and account security.'}
                </p>
              </div>
            </div>
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  );
}
