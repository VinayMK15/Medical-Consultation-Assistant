import React from 'react';
import { Link } from 'react-router-dom';
import AuthTopNav from '../../shared/components/AuthTopNav';
import SkipLink from '../../shared/components/SkipLink';
import useDocumentTitle from '../../hooks/useDocumentTitle';

/**
 * Shared shell for the static legal pages (/privacy, /terms).
 *
 * These are plain content pages, not forms, so they get the same top nav as
 * the auth pages plus a single readable column. `lastUpdated` is a prop
 * rather than a constant so each page can carry its own date.
 */
export default function LegalLayout({ title, intro, sections, lastUpdated }) {
  useDocumentTitle(title);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <AuthTopNav />
      <SkipLink />

      <main id="main-content" tabIndex={-1} className="flex-1 px-5 py-10 sm:px-6 lg:py-14">
        <article className="mx-auto max-w-3xl">
          <header className="border-b border-slate-200 pb-6">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
            {lastUpdated && (
              <p className="mt-2 text-sm text-slate-500">Last updated: {lastUpdated}</p>
            )}
            {intro && (
              <p className="mt-4 text-base leading-relaxed text-slate-600">{intro}</p>
            )}
          </header>

          <div className="mt-8 space-y-8">
            {sections.map((s) => (
              <section key={s.heading}>
                <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{s.heading}</h2>
                {s.paragraphs?.map((p, i) => (
                  <p key={i} className="mt-3 text-base leading-relaxed text-slate-600">
                    {p}
                  </p>
                ))}
                {s.items && (
                  <ul className="mt-3 list-inside list-disc space-y-1.5 text-base leading-relaxed text-slate-600">
                    {s.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">Academic project notice</p>
            <p className="mt-1.5 text-sm leading-relaxed text-amber-800">
              MedAssist is an academic demonstration project. It is not a medical device,
              does not provide diagnosis, and must not be used to make real clinical
              decisions. For any real medical concern, consult a licensed clinician.
            </p>
          </div>

          <p className="mt-8 text-sm text-slate-500">
            Questions about this page?{' '}
            <Link to="/contact" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">
              Contact us
            </Link>
            .
          </p>
        </article>
      </main>
    </div>
  );
}