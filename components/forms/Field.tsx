import type { ReactNode } from 'react';

/**
 * The field wrapper every form on the site uses.
 *
 * Extracted out of BookingForm so the rules below hold everywhere rather than
 * being re-decided per form. There is one form today; there will be a contact
 * form, an admin editor and a newsletter box, and each of those is a chance to
 * mark a required field differently.
 *
 * ## Required fields say "Required"
 *
 * Not an asterisk. An asterisk is a convention people have to already know —
 * it is unlabelled, it is sometimes used for footnotes on the same page, and a
 * screen reader announces it as "star", so `Your name star` is what a blind
 * visitor hears. The word costs a few pixels and is unambiguous in both
 * channels.
 *
 * ## Errors are wired, not just displayed
 *
 * `children` is a function rather than a node so this component can hand the
 * input the attributes that connect it to its own error message:
 * `aria-invalid` and `aria-describedby`. Passing plain children would mean
 * every call site remembering to repeat those, and one that forgets renders an
 * error a screen reader never announces. This way it is structural.
 */

/** The attributes `Field` hands to the input it wraps. Spread them onto it. */
export interface FieldControl {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  /** Extra guidance, e.g. "Optional" or "Approximate is fine". */
  hint?: string;
  error?: string;
  htmlFor: string;
  required?: boolean;
  children: (control: FieldControl) => ReactNode;
}) {
  const errorId = `${htmlFor}-error`;

  const control: FieldControl = {
    id: htmlFor,
    // `undefined` rather than `false`: React omits the attribute entirely, and
    // aria-invalid="false" on every untouched field is noise in the a11y tree.
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
  };

  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
        {required && (
          <span className="ml-2 font-normal text-muted">Required</span>
        )}
        {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
      </label>

      <div className="mt-1.5">{children(control)}</div>

      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** Shared input styling, so every control in a form matches. */
export function inputClass(hasError: boolean): string {
  return `w-full rounded border bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-ink ${
    hasError ? 'border-error' : 'border-hairline'
  }`;
}
