import React from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from './BrandLogo';

export default function AuthTopNav({ altTo, altLabel }) {
  return (
    <header className="relative z-20 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-10">
      <Link to="/login" className="flex items-center gap-3">
        <BrandLogo size="md" />
        <span className="text-lg font-bold tracking-tight text-slate-900">MedAssist</span>
      </Link>
      {altTo && altLabel && (
        <Link
          to={altTo}
          className="rounded-[var(--radius-control)] border border-primary-600 px-4 py-1.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50"
        >
          {altLabel}
        </Link>
      )}
    </header>
  );
}
