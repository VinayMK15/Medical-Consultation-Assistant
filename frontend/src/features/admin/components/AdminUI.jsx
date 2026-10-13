import React from 'react';
import Icon from './Icon';

/**
 * Shared admin UI kit.
 *
 * Every surface in the admin portal (list tabs, doctor detail, patient
 * detail) is built from these so cards, badges, tables and buttons keep the
 * same geometry. The visual language is taken from AdminLogin: white cards
 * on a soft slate field, generous `rounded-xl`/`rounded-2xl` corners, a
 * near-black `slate-900` for primary actions, and blue-600 as the single
 * brand accent.
 */

/* ── Badges ────────────────────────────────────────────────────────────────── */

// Semantic tones shared by approval badges, status pills and category chips.
const TONES = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border border-red-200',
  info:     'bg-blue-50 text-blue-700 border border-blue-200',
  violet:   'bg-violet-50 text-violet-700 border border-violet-200',
  teal:     'bg-teal-50 text-teal-700 border border-teal-200',
  slate:    'bg-slate-100 text-slate-600 border border-slate-200',
  indigo:   'bg-indigo-50 text-indigo-700 border border-indigo-200',
};

export function Badge({ children, tone = 'pending', icon, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone] || TONES.slate} ${className}`}>
      {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

/* ── Avatar ────────────────────────────────────────────────────────────────── */

const AVATAR_SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

export function Avatar({ name, colorClass = 'bg-indigo-100 text-indigo-700', size = 'md' }) {
  const initials =
    name?.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full font-bold ${AVATAR_SIZES[size]} ${colorClass}`}>
      {initials}
    </div>
  );
}

/* ── Cards ─────────────────────────────────────────────────────────────────── */

/**
 * The standard bordered panel. `title` + `subtitle` form the header strip the
 * list views already use; omit both for a plain body container.
 */
export function DetailCard({ title, subtitle, icon, actions, children, className = '', bodyClassName = 'p-5' }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon name={icon} className="h-[18px] w-[18px]" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="truncate text-sm font-bold text-slate-900">{title}</h3>}
              {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Compact metric tile for the top of a detail page. */
export function StatCard({ label, value, accent = 'text-slate-900', icon, iconTone = 'bg-slate-100 text-slate-600', loading = false, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-16 animate-pulse rounded bg-slate-100" />
      ) : (
        <>
          <p className={`mt-2 text-3xl font-bold tabular-nums ${accent}`}>{value ?? 0}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </>
      )}
    </div>
  );
}

/* ── Label / value rows ────────────────────────────────────────────────────── */

/** Small uppercase group heading, mirroring the modal form labels. */
export function SectionLabel({ children }) {
  return (
    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
      {children}
    </p>
  );
}

/**
 * One label/value pair. Values fall back to an em dash so a sparse record
 * never leaves a dangling blank row in the panel.
 */
export function InfoField({ label, value, icon, mono = false, href }) {
  const shown = value === null || value === undefined || value === '' ? '—' : String(value);
  const body = (
    <>
      <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
        {icon && <Icon name={icon} className="h-4 w-4 text-slate-500" />}
        {label}
      </span>
      {href ? (
        <span className="flex min-w-0 items-center justify-end gap-1 text-right text-sm font-semibold text-blue-600 hover:underline">
          {shown}
          <Icon name="externalLink" className="h-3.5 w-3.5 shrink-0" />
        </span>
      ) : (
        <span className={`min-w-0 truncate text-right text-sm font-semibold ${shown === '—' ? 'text-slate-500' : 'text-slate-800'} ${mono ? 'font-mono text-xs tracking-tight' : ''}`}>
          {shown}
        </span>
      )}
    </>
  );
  const cls = 'flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0';
  return href && shown !== '—' ? (
    <a href={href} target="_blank" rel="noreferrer" className={`${cls} transition-colors hover:bg-slate-50`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ── Feedback states ───────────────────────────────────────────────────────── */

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    // role="alert" so the failure is announced. Every admin error renders
    // through this component, and without it they were all silent to AT.
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span><span className="font-bold">Error: </span>{message}</span>
    </div>
  );
}

export function Notice({ tone = 'info', title, children }) {
  const map = {
    info:    'border-blue-200 bg-blue-50 text-blue-800',
    amber:   'border-amber-200 bg-amber-50 text-amber-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-xs leading-5 ${map[tone]}`}>
      {title && <p className="font-bold">{title}</p>}
      {children}
    </div>
  );
}

export function EmptyState({ icon = 'clipboard', title, message, action, className = '' }) {
  return (
    <div className={`px-6 py-14 text-center ${className}`}>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-bold text-slate-700">{title}</p>
      {message && <p className="mt-1 text-xs text-slate-500">{message}</p>}
      {/* Lets a "clear filters" / "try again" escape hatch sit directly under
          the message instead of forcing the caller to rebuild the block. */}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/* ── Loading skeletons ─────────────────────────────────────────────────────── */

export function TableSkeleton({ cols = 5, rowsCount = 3, hasAvatar = false }) {
  return (
    <>
      {Array.from({ length: rowsCount }).map((_, r) => (
        <tr key={r} className="animate-pulse">
          <td className="px-6 py-4">
            {hasAvatar ? (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-200" />
                <div className="h-4 w-28 rounded bg-slate-200" />
              </div>
            ) : (
              <div className="h-4 w-24 rounded bg-slate-200" />
            )}
          </td>
          {Array.from({ length: Math.max(0, cols - 1) }).map((__, c) => (
            <td key={c} className="px-6 py-4">
              <div className="h-4 w-full max-w-28 rounded bg-slate-200" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ListSkeleton({ rowsCount = 3 }) {
  return (
    <ul className="divide-y divide-slate-100">
      {Array.from({ length: rowsCount }).map((_, i) => (
        <li key={i} className="flex animate-pulse flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-9 w-9 rounded-full bg-slate-200" />
            <div className="space-y-1.5">
              <div className="h-4 w-28 rounded bg-slate-200" />
              <div className="h-3 w-40 rounded bg-slate-200" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            <div className="h-4 w-16 rounded bg-slate-200" />
            <div className="h-4 w-12 rounded bg-slate-200" />
            <div className="h-4 w-12 rounded bg-slate-200" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CardSkeleton({ rowsCount = 3 }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rowsCount }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center justify-between gap-4">
          <div className="h-3.5 w-28 rounded bg-slate-200" />
          <div className="h-3.5 w-36 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}

/* ── Buttons ───────────────────────────────────────────────────────────────── */

// Primary follows AdminLogin's near-black submit button; `brand` is the blue
// accent already used for active navigation.
export const BUTTON_STYLES = {
  dark:    'bg-slate-900 text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800',
  brand:   'bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700',
  violet:  'bg-violet-600 text-white shadow-sm shadow-violet-500/20 hover:bg-violet-700',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
  ghost:   'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  danger:  'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
};

// A designed focus ring rather than relying on the UA default, matching
// the shared ui/Button. min-h-11 keeps every admin button at the 44px
// touch-target floor; `sm` was previously px-3 py-1.5 (~28px).
const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

export function Button({ variant = 'ghost', size = 'md', icon, iconRight, children, className = '', ...rest }) {
  const sizing = size === 'sm' ? 'px-3 py-2' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-4 py-2.5';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <button
      type="button"
      className={`${BUTTON_BASE} ${sizing} ${BUTTON_STYLES[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} className={iconSize} />}
      {children}
      {iconRight && <Icon name={iconRight} className={iconSize} />}
    </button>
  );
}

/* ── Filter tabs ───────────────────────────────────────────────────────────── */

/**
 * Segmented control used to switch the appointment table between All /
 * Upcoming / Pending / Completed / Cancelled.
 */
export function FilterTabs({ value, onChange, options, ariaLabel, className = '' }) {
  return (
    // role="group" + label: a row of toggle buttons reads as one control to a
    // screen reader, which is what it is — the label is what makes it say
    // "age range" rather than four unlabelled buttons.
    <div role="group" aria-label={ariaLabel} className={`flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1 ${className}`}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-slate-500'}`}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}