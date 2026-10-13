import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import UserMenu from './UserMenu';
import SkipLink from './SkipLink';
import BrandLogo from './BrandLogo';

/**
 * AppShell — shared dashboard layout: slim top bar + left sidebar.
 *
 * Props:
 *   brandLabel:  e.g. "MedAssist"
 *   subtitle:    small uppercase text under the brand (e.g. "PROVIDER PORTAL")
 *   statusBadge: arbitrary node for the top bar (e.g. an "All clear" pill)
 *   user:        { name, email? } — passed to UserMenu
 *   menuItems:   passed through to UserMenu
 *   onLogout:    passed through to UserMenu
 *   navItems:    array of nav entries. Two modes:
 *     - route mode:  { label, path, icon } — <Link>, active via useLocation
 *     - tab mode:    { label, key,  icon } — <button>, active via
 *                    `activeTab`, selection via `onSelectTab`
 *   activeTab / onSelectTab: only needed for tab mode
 *   actions:     optional node for the top bar (between statusBadge
 *                and UserMenu) — e.g. a page-specific Refresh button
 *   children:    main content
 */
export default function AppShell({
  brandLabel = 'MedAssist',
  subtitle,
  statusBadge,
  user,
  sidebarHero,
  menuItems = [],
  onLogout,
  navItems = [],
  activeTab,
  onSelectTab,
  actions,
  // Lock pins the viewport so the document itself never scrolls; each region
  // supplies its own scroll instead. Default off, so every other consumer of
  // this shell is untouched. Carrying `min-h-0` at every level of the chain is
  // what makes the lock work — omit one and the column refuses to shrink.
  lock = false,
  children,
}) {
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isActive = (item) => {
    if (item.path) return location.pathname === item.path;
    if (item.key !== undefined) return activeTab === item.key;
    return false;
  };

  const handleSelect = (item) => {
    if (item.path) {
      setIsDrawerOpen(false); // Link handles navigation
    } else if (item.key !== undefined) {
      onSelectTab?.(item.key);
      setIsDrawerOpen(false);
    }
  };

  const navList = (onNavigate) => (
    <div className="flex flex-col">
      {sidebarHero && (
        <div className="p-3 pb-2">
          {sidebarHero}
        </div>
      )}
      <div className="px-4 pt-2 pb-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Navigation</p>
      </div>
      <nav className="space-y-1 p-3 pt-0">
        {navItems.map((item) => {
        const active = isActive(item);
        const classes = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
          active
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-700'
        }`;
        const content = (
          <>
            <span className="shrink-0">{item.icon}</span>
            {item.label}
          </>
        );
        return item.path ? (
          <Link key={item.path} to={item.path} onClick={onNavigate} className={classes}>
            {content}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              handleSelect(item);
              onNavigate?.();
            }}
            className={classes}
          >
            {content}
          </button>
        );
      })}
      </nav>
    </div>
  );

  return (
    <div className={
      lock
        ? 'flex h-dvh flex-col overflow-hidden bg-slate-50 text-slate-900'
        : 'min-h-screen bg-slate-50 text-slate-900'
    }>
      {/* ── Top bar ── */}
      <header className={`top-0 z-50 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur ${lock ? '' : 'sticky'}`}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            {/* Hamburger (mobile only) */}
            <button
              type="button"
              onClick={() => setIsDrawerOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <BrandLogo size="lg" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-950">{brandLabel}</h1>
              {subtitle && (
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-600">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {statusBadge}
            {actions}
            <UserMenu user={user} items={menuItems} onLogout={onLogout} />
          </div>
        </div>
      </header>

      <div className={`flex ${lock ? 'min-h-0 flex-1' : ''}`}>
        {/* ── Sidebar (desktop) ── */}
        {/* Locked: `h-full min-h-0` replaces a hard-coded `calc(100vh - 68px)`.
            That 68px was a guess at the header height and was not what the
            header actually measures; here the height is structural instead. */}
        <aside className={
          lock
            ? 'hidden min-h-0 w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:block'
            : 'sticky top-[68px] hidden h-[calc(100vh-68px)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:block'
        }>
          {navList()}
        </aside>

        {/* ── Mobile drawer ── */}
        {isDrawerOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setIsDrawerOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-64 overflow-y-auto bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <span className="text-sm font-bold text-slate-900">{brandLabel}</span>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  aria-label="Close navigation menu"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {navList(() => setIsDrawerOpen(false))}
            </aside>
          </div>
        )}

        {/* ── Main content ── */}
        <SkipLink />
        <main id="main-content" className={`min-w-0 flex-1 ${lock ? 'min-h-0 overflow-y-auto' : ''}`} tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
