import React, { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

/**
 * Shared form controls.
 *
 * Every export resolves its own id with `useId()` when the caller doesn't
 * supply one. Previously the id came only from `id || props.name`, so a field
 * rendered without either got `htmlFor={undefined}` — an orphaned label with no
 * accessible name on the control, and nothing to hang `aria-describedby` off.
 *
 * `useId()` values are stable for the component's lifetime, so the error and
 * helper text can be wired to the input properly:
 *   aria-invalid     — tells AT the field is in an error state
 *   aria-describedby — points at the error/helper node so it is read with it
 */

function useFieldIds({ id, name, error, helperText }) {
  const autoId = useId();
  const fieldId = id || name || autoId;
  const messageId = `${fieldId}-message`;
  return { fieldId, messageId, hasMessage: Boolean(error || helperText) };
}

function Label({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-slate-700"
    >
      {children}
    </label>
  );
}

// Errors are assertive so a screen reader interrupts to report the failure;
// helper text is polite because it is advisory and not urgent.
function Message({ id, error, helperText }) {
  if (error) {
    return (
      <p id={id} className="mt-1.5 text-sm text-danger-600">
        {error}
      </p>
    );
  }
  if (helperText) {
    return (
      <p id={id} className="mt-1.5 text-sm text-slate-500">
        {helperText}
      </p>
    );
  }
  return null;
}

// `ref` is forwarded so a parent can supply an initial-focus target for a
// dialog (ForgotPasswordModal focuses its email field on open).
export const Input = React.forwardRef(function Input(
  { label, error, helperText, id, className = "", ...props },
  ref
) {
  const { fieldId, messageId, hasMessage } = useFieldIds({
    id,
    name: props.name,
    error,
    helperText,
  });
  return (
    <div className="w-full">
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        className={[
          "h-10 w-full rounded-[var(--radius-control,0.5rem)] border bg-white px-3 text-sm text-slate-900",
          "placeholder:text-slate-500 focus:outline-none focus:ring-2",
          error
            ? "border-danger-400 focus:ring-danger-400"
            : "border-slate-300 focus:border-primary-500 focus:ring-primary-500",
          className,
        ].join(" ")}
        {...props}
      />
      <Message id={messageId} error={error} helperText={helperText} />
    </div>
  );
});

export function Select({ label, error, helperText, id, className = "", children, ...props }) {
  const { fieldId, messageId, hasMessage } = useFieldIds({
    id,
    name: props.name,
    error,
    helperText,
  });
  return (
    <div className="w-full">
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        className={[
          "h-10 w-full rounded-[var(--radius-control,0.5rem)] border bg-white px-3 text-sm text-slate-900",
          "focus:outline-none focus:ring-2",
          error
            ? "border-danger-400 focus:ring-danger-400"
            : "border-slate-300 focus:border-primary-500 focus:ring-primary-500",
          className,
        ].join(" ")}
        {...props}
      >
        {children}
      </select>
      <Message id={messageId} error={error} helperText={helperText} />
    </div>
  );
}

export function Textarea({ label, error, helperText, id, className = "", ...props }) {
  const { fieldId, messageId, hasMessage } = useFieldIds({
    id,
    name: props.name,
    error,
    helperText,
  });
  return (
    <div className="w-full">
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        className={[
          "w-full rounded-[var(--radius-control,0.5rem)] border bg-white p-3 text-sm text-slate-900",
          "placeholder:text-slate-500 focus:outline-none focus:ring-2",
          error
            ? "border-danger-400 focus:ring-danger-400"
            : "border-slate-300 focus:border-primary-500 focus:ring-primary-500",
          className,
        ].join(" ")}
        {...props}
      />
      <Message id={messageId} error={error} helperText={helperText} />
    </div>
  );
}

export const PasswordInput = React.forwardRef(function PasswordInput(
  { label, error, helperText, id, className = "", ...props },
  ref
) {
  const [visible, setVisible] = useState(false);
  const { fieldId, messageId, hasMessage } = useFieldIds({
    id,
    name: props.name,
    error,
    helperText,
  });
  const toggleId = `${fieldId}-toggle`;

  return (
    <div className="w-full">
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          className={[
            "h-10 w-full rounded-[var(--radius-control,0.5rem)] border bg-white px-3 pr-10 text-sm text-slate-900",
            "placeholder:text-slate-500 focus:outline-none focus:ring-2",
            error
              ? "border-danger-400 focus:ring-danger-400"
              : "border-slate-300 focus:border-primary-500 focus:ring-primary-500",
            className,
          ].join(" ")}
          {...props}
        />
        {/* Reachability: this button used to carry tabIndex={-1}, which removed
            it from the tab order entirely — a keyboard user could never reach
            the show/hide control. It is now focusable, and aria-pressed
            communicates the current state instead of relying on the icon. */}
        <button
          type="button"
          id={toggleId}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={fieldId}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-[var(--radius-control,0.5rem)] pr-3 text-slate-500 transition hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
        >
          {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      </div>
      <Message id={messageId} error={error} helperText={helperText} />
    </div>
  );
});
