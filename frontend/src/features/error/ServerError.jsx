import React from 'react';
import { Link } from 'react-router-dom';

export default function ServerError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 text-slate-900">
      <div className="w-full max-w-md text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-10">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50">
            <span className="text-4xl font-bold text-red-600">500</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Internal server error
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Something went wrong on our end. We're working to fix this. Please try again later.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/"
              className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              Go to Dashboard
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              Reload page
            </button>
          </div>
        </div>

        <p className="mt-5 text-xs text-slate-500">
          For emergencies, contact local emergency services immediately.
        </p>
      </div>
    </div>
  );
}
