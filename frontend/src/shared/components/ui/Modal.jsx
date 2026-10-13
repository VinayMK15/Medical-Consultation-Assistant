import React, { useCallback, useEffect, useRef } from 'react';

/**
 * Modal — the dialog primitive.
 *
 * Extracted from PatientReportModal, which was the only modal in the app that
 * implemented the dialog contract correctly. The other six were plain divs, so
 * Escape did nothing, Tab walked out into the page behind, and the background
 * kept scrolling.
 *
 * What this provides:
 *   role="dialog" + aria-modal="true"   — exposes it as a dialog to AT
 *   aria-labelledby / aria-label        — gives it a name from visible content
 *   Escape to close                     — via a document listener, so it works
 *                                        no matter where focus currently is
 *   Focus trap                          — Tab cycles within the panel
 *   Initial focus                       — to the panel, or a preferred child
 *   Focus restoration                   — returns focus to the trigger on close
 *   Background scroll lock              — and restores the previous value
 *   Backdrop click to close             — guarded so inner clicks don't close
 *
 * A real focus trap needs the "guard" trick: when focus would leave the panel,
 * the boundary elements pull it back. `onKeyDown` alone cannot do this, because
 * the browser moves focus after the event unless it is prevented.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  labelledBy,
  children,
  onClosePrevented,
  initialFocusRef,
  // Focus the Cancel button instead of the panel. Used by ConfirmDialog, where
  // the safe choice should be the one already under the user's cursor — for a
  // dialog that replaces a prescription, defaulting to "Replace" would be the
  // wrong default.
  cancelRef,
  closeOnBackdrop = true,
  panelClassName = '',
  overlayClassName = 'fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm sm:p-6',
  showCloseButton = true,
  closeButtonRef,
  closeButtonClassName =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
  closeButtonLabel = 'Close dialog',
}) {
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);

  // Remember what had focus before the dialog opened, so it can be restored.
  // Captured in an effect (not during render) to avoid a ref write mid-render.
  useEffect(() => {
    if (isOpen) returnFocusRef.current = document.activeElement;
  }, [isOpen]);

  // Move focus into the dialog once it's on screen.
  useEffect(() => {
    if (!isOpen) return;
    const target = initialFocusRef?.current || cancelRef?.current || panelRef.current;
    // rAF lets the panel exist before we move focus into it.
    const raf = requestAnimationFrame(() => target?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isOpen, initialFocusRef, cancelRef]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      // Guard the loop: if focus is outside the panel entirely, or on the
      // first/last element and Tab would escape, wrap it around.
      if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  // Lock background scroll while open, restoring whatever was there before.
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Return focus to the trigger on unmount.
  useEffect(() => {
    if (isOpen) return undefined;
    const el = returnFocusRef.current;
    return () => {
      // Only restore if the element is still in the document and focusable.
      if (el && document.contains(el) && typeof el.focus === 'function') {
        el.focus();
      }
    };
  }, [isOpen]);

  const handleBackdrop = useCallback(
    (e) => {
      if (!closeOnBackdrop) return;
      // Guarded so a click inside the panel doesn't bubble out and close it.
      if (e.target !== e.currentTarget) return;
      if (onClosePrevented?.(e)) return;
      onClose?.();
    },
    [closeOnBackdrop, onClose, onClosePrevented]
  );

  if (!isOpen) return null;

  const accessibleName = labelledBy ? { 'aria-labelledby': labelledBy } : title ? { 'aria-label': title } : {};

  return (
    <div className={overlayClassName} onClick={handleBackdrop}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        {...accessibleName}
        className={`relative flex max-h-[95vh] w-full flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-900/10 outline-none ${panelClassName}`}
      >
        {showCloseButton && (
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={closeButtonLabel}
            className={`absolute right-3 top-3 z-10 ${closeButtonClassName}`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}