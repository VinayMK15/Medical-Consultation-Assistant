import React, { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';

function InfoField({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default function PersonalInfo() {
  const { user } = useContext(AuthContext);

  if (!user) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  const fullName  = user.full_name || user.name || 'Not provided';
  const email     = user.email     || 'Not provided';
  const role      = user.role      || 'Patient';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal-600">Profile</p>
          <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">Personal Information</h2>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
          {role}
        </span>
      </div>

      {/* Avatar + name banner */}
      <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-bold uppercase text-white shadow-md shadow-blue-500/20">
          {fullName.charAt(0)}
        </div>
        <div>
          <p className="text-base font-bold text-slate-900">{fullName}</p>
          <p className="text-sm text-slate-500">{email}</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500"></span>
          Active
        </span>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2">
        <InfoField label="Full Name"      value={fullName} />
        <InfoField label="Email Address"  value={email} />
        <InfoField label="Age"            value={user.age    ? `${user.age} years` : 'Not provided'} />
        <InfoField label="Gender"         value={user.gender || 'Not provided'} />
        <InfoField label="Role"           value={role} />
        <InfoField
          label="Account Status"
          value="Verified & Active"
        />
      </div>

      {/* Footer note */}
      <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50 px-6 py-3">
        <p className="text-xs text-slate-400">
          To update your information, please contact support.
        </p>
      </div>
    </div>
  );
}
