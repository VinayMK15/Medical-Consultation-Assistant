import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../shared/context/AuthContext';
import Icon from './components/Icon';
import SkipLink from '../../shared/components/SkipLink';
import BrandLogo from '../../shared/components/BrandLogo';

/**
 * Shared chrome for every admin screen.
 *
 * The dark sidebar and top bar previously lived inside AdminDashboard, so any
 * second page would have had to duplicate ~120 lines of navigation and could
 * drift. Both the list tabs and the new detail pages render inside this
 * frame, which keeps the active nav item highlighted and the mobile drawer
 * behaviour identical everywhere.
 */

const NAV_ITEMS = [
  { id: 'queue',    label: 'Verification Queue', icon: 'search',       hint: 'Approve new doctors' },
  { id: 'doctors',  label: 'Active Doctors',      icon: 'stethoscope', hint: 'Browse verified doctors' },
  { id: 'patients', label: 'Patient Directory',   icon: 'users',       hint: 'Browse registered patients' },
];

export default function AdminLayout({ activeTab = 'queue', title, subtitle, onBack, backLabel = 'Back', actions, children }) {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const goToTab = (id) => {
    setSidebarOpen(false);
    navigate(id === 'queue' ? '/admin/dashboard' : `/admin/dashboard?tab=${id}`);
  };

  // Escape closes the mobile drawer, matching the overlay-click and
  // navigate-away paths so keyboard users get the same way out.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-100 font-sans">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-slate-900/50 backdrop-blur-sm lg:hidden"onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ──
          `inert` on the closed mobile drawer: without it the off-screen nav
          buttons stay in the tab order, so a keyboard user tabs into an
          invisible menu. `inert` also removes them from the a11y tree. */}
      <aside
        // `inert` removed: on desktop the sidebar is always in the normal
        // flow (`lg:static`), so it starts closed with `inert=true` and
        // never opens (no hamburger). `aria-hidden` alone handles the a11y
        // tree hiding; `inert` goes further and blocks mouse/keyboard events.
        aria-hidden={!sidebarOpen ? true : undefined}
        className={`
        fixed inset-y-0 left-0 z-30 flex w-72 flex-col bg-slate-900 text-white transition-transform duration-300
        lg:static lg:translate-x-0 lg:!translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-slate-700/60 px-6 py-4">
          <BrandLogo size="lg" />
          <div>
            <p className="text-base font-bold tracking-tight">MedAssist</p>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-400">Admin Control</p>
          </div>
        </div>

        {/* Admin info */}
        <div className="mx-4 mt-5 rounded-xl border border-slate-700/50 bg-slate-800/80 px-4 py-3">
          <p className="truncate text-xs font-semibold text-slate-200">{user?.name || user?.email || 'Administrator'}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-blue-400">Super Admin</p>
        </div>

        {/* Nav */}
        <nav aria-label="Admin navigation" className="mt-6 flex-1 space-y-1 overflow-y-auto px-3">
          <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Navigation</p>
          {NAV_ITEMS.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => goToTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {/* slate-500 on the slate-900 sidebar is only ~3.7:1; slate-400 is ~6.6:1 */}
                  {!isActive && <span className="block truncate text-xs font-medium text-slate-400">{item.hint}</span>}
                </span>
                {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" />}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="border-t border-slate-700/60 p-4">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-400 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <Icon name="logout" className="h-5 w-5" /> Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Top bar */}
        <header className="border-b border-slate-200 bg-white px-5 py-4 shadow-sm lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
                className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 lg:hidden"
              >
                <Icon name="menu" className="h-5 w-5" />
              </button>

              {onBack && (
                <button
                  onClick={onBack}
                  className="group hidden shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 pl-2.5 pr-3.5 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 sm:inline-flex min-h-11">
                  <Icon name="chevronLeft" className="h-4 w-4 text-slate-400 transition group-hover:text-slate-700" />
                  {backLabel}
                </button>
              )}

              <div className="min-w-0">
                <h1 className="truncate text-base font-bold tracking-tight text-slate-900">{title}</h1>
                {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {actions}
              <span className="hidden items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 sm:inline-flex">
                <Icon name="shield" className="h-3.5 w-3.5" /> Admin Access
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {(user?.name || user?.email || 'A')[0].toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <SkipLink />
        {/* Scrollable content */}
        <main id="main-content" className="flex-1 overflow-y-auto px-5 py-6 lg:px-8"tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}