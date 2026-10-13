import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * UserMenu — generic avatar dropdown (extracted from the patient
 * dashboard's account-menu pattern). Usable for any role.
 *
 * Props:
 *   user:     { name, email? }
 *   items:    array of { label, icon?, to? , onClick? } — renders <Link>
 *             when `to` is given, otherwise a <button onClick>
 *   onLogout: called for the final Logout item
 */
export default function UserMenu({ user, items = [], onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const name = user?.name || 'User';

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const close = () => setIsOpen(false);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="User account menu"
        aria-expanded={isOpen}
        className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white p-1 pr-3 shadow-sm transition hover:border-blue-300 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-bold uppercase text-white shadow-sm">
          {name.charAt(0)}
        </span>
        <span className="text-xs font-semibold text-slate-700 hidden sm:inline-block max-w-[120px] truncate">
          {name}
        </span>
        <svg
          className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600' : ''
            }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-2xl shadow-slate-900/15 backdrop-blur-md z-[1100] animate-in fade-in slide-in-from-top-2 duration-150">
          {/* User Info Header */}
          <div className="border-b border-slate-100 px-3 py-2.5 mb-1 bg-slate-50/70 rounded-xl">
            <p className="text-xs font-bold text-slate-900 truncate">{name}</p>
            {user?.email && (
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            )}
          </div>

          {items.map((item) =>
            item.to ? (
              <Link
                key={item.label}
                to={item.to}
                onClick={close}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
              >
                {item.icon && (
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  close();
                  item.onClick?.();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
              >
                {item.icon && (
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            )
          )}

          {/* Logout. Rendered directly rather than as an `item`, so a menu
              with no `items` still produces a valid single-entry dropdown.
              The divider is conditional: with no items it would otherwise sit
              directly under the header, separating nothing. */}
          {items.length > 0 && <div className="my-1 border-t border-slate-100" />}

          <button
            type="button"
            onClick={() => {
              close();
              onLogout?.();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v.659m11.963 0.982l1.04 1.04c.244.244.327.577.22.91a7.003 7.003 0 01-.752 2.016A7.07 7.07 0 016 12.21v.75a2.25 2.25 0 01-2.25 2.25H3" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6.364-3.636a9 9 0 00-1.857-.586m-8.014 0A9 9 0 009 3.75" />
              </svg>
            </span>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
