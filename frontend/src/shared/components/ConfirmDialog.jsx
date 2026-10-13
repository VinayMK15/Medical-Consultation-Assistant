import React, { useRef } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';

/**
 * ConfirmDialog — asks before an action that destroys work.
 *
 * Used by the demo-data loaders and the vitals clear. Previously both ran
 * immediately: "Load Sample Rx Case" replaced a half-written prescription with
 * no prompt and no undo, and "Clear" wiped every vitals field on one click.
 *
 * Deliberately a real `role="dialog"` with a focus trap (via the shared Modal)
 * rather than a `window.confirm`: the native dialog cannot be styled, cannot
 * name what will be lost, and blocks the JS thread.
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Replace',
  cancelLabel = 'Cancel',
  tone = 'warning', // 'warning' | 'danger'
}) {
  const isDanger = tone === 'danger';
  const cancelRef = useRef(null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="confirm-dialog-title"
      cancelRef={cancelRef}
      overlayClassName="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      panelClassName="max-w-md rounded-2xl"
      closeButtonClassName="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      closeButtonLabel="Cancel"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isDanger ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-base font-bold text-slate-950">
              {title}
            </h2>
            {body && <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} type="button" variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={isDanger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}