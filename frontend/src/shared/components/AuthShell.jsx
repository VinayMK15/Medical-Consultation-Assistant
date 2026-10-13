import React from 'react';
import AuthTopNav from './AuthTopNav';
import SkipLink from './SkipLink';

export default function AuthShell({
  // Cross-link to the other portal's auth page, e.g. the patient login
  // shown on the patient forms. Omit both to render the nav with no
  // trailing link — the doctor pages do this, since a "Patient login"
  // button on a provider-only page invited the wrong audience.
  altTo,
  altLabel,
  image = false,
  showNav = true,
  overlay = 'left',   // 'left' = fade for hero text (Login), 'soft' = even wash (Signup)
  hero = null,
  // Lock pins the viewport so the document itself never scrolls; the content
  // supplies its own scroll region instead.
  lock = false,
  children,
}) {
  return (
    <div className={
      lock
        ? 'relative isolate flex h-dvh flex-col overflow-hidden bg-linear-to-br from-primary-50 via-white to-slate-100'
        : 'relative isolate flex min-h-screen flex-col bg-linear-to-br from-primary-50 via-white to-slate-100'
    }>
      {/* The hero art lives on the root, not inside <main>, so it runs the
          full height of the page. Scoped to <main> it stopped where the
          content ended and left the remaining space showing the bare
          white gradient as a strip.

          `-z-10` keeps it behind everything: an absolutely positioned box
          would otherwise paint over the static content. The root's own
          gradient is its background, which still sits under these layers, so
          a missing image file degrades exactly as before. */}
      {image && (
        <>
          {/* Large screens only; a missing file just leaves the gradient */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 hidden bg-cover bg-center lg:block"
            style={{ backgroundImage: "url('/auth-hero.webp')" }}
          />
          <div
            aria-hidden="true"
            className={`absolute inset-0 -z-10 hidden lg:block ${
              overlay === 'left'
                ? 'bg-linear-to-r from-white/95 via-white/60 to-transparent'
                : 'bg-white/40'
            }`}
          />
        </>
      )}
      {showNav && <AuthTopNav altTo={altTo} altLabel={altLabel} />}
      <SkipLink />
      <main
        id="main-content"
        className={
          lock
            ? 'relative flex min-h-0 flex-1 items-center overflow-hidden px-4 py-4 sm:px-6 lg:px-12'
            : 'relative flex flex-1 items-center px-4 py-4 sm:px-6 sm:py-6 lg:px-12 lg:py-6'
        }
        tabIndex={-1}
      >
        <div
          className={`relative z-10 mx-auto flex w-full items-center gap-12 ${
            hero ? 'max-w-7xl justify-between' : 'justify-center'
          } ${lock ? 'min-h-0 max-h-full self-stretch' : ''}`}
        >
          {hero && <div className="hidden max-w-xl lg:block">{hero}</div>}
          {children}
        </div>
      </main>
    </div>
  );
}
