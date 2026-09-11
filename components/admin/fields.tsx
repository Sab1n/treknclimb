'use client';

import type { ReactNode } from 'react';

/**
 * Form controls for the admin editors.
 *
 * Separate from `components/forms/Field.tsx`, which serves the public forms.
 * That one takes a render-prop child so it can wire `aria-invalid` and
 * `aria-describedby` onto an input it does not own; these own their input, so
 * they can wire the same attributes directly and each call site is one line
 * instead of five.
 *
 * The rules it enforces are the same ones, because they are site-wide:
 *
 * - **Required fields say the word "Required"**, never an asterisk. An
 *   asterisk is an unlabelled convention, it collides with footnote markers,
 *   and a screen reader announces it as "star" — `Trip title star`.
 * - Errors render beside the field that caused them, in `role="alert"` text
 *   wired to the input by `aria-describedby`.
 * - No browser validation bubbles. Every control here is unvalidated by the
 *   browser and validated by the shared Zod schema instead, so the messages
 *   are ours and they are consistent.
 */

const inputBase =
  'w-full rounded border bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-ink';

function borderFor(error?: string): string {
  return error ? 'border-error' : 'border-hairline';
}

function Wrapper({
  label,
  id,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {required && (
          <span className="ml-2 font-normal text-muted">Required</span>
        )}
      </label>

      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}

      <div className="mt-1.5">{children}</div>

      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  id,
  value,
  onChange,
  error,
  hint,
  required,
  placeholder,
  mono,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <Wrapper label={label} id={id} error={error} hint={hint} required={required}>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputBase} ${borderFor(error)} ${mono ? 'font-mono' : ''}`}
      />
    </Wrapper>
  );
}

/**
 * A number field that is still a text input under the hood.
 *
 * `type="number"` is deliberately avoided. It lets a scroll wheel over a
 * focused field change a price without anyone touching the keyboard, it
 * accepts `1e5` and `--` in most browsers, and what it reports for an invalid
 * value is `''` — indistinguishable from empty, so "not set" and "typed
 * nonsense" collapse into the same state before validation can tell them
 * apart. `inputMode="decimal"` still brings up the numeric keypad on a phone.
 */
export function NumberField({
  label,
  id,
  value,
  onChange,
  error,
  hint,
  required,
  suffix,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  suffix?: string;
}) {
  return (
    <Wrapper label={label} id={id} error={error} hint={hint} required={required}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${inputBase} ${borderFor(error)} font-mono tabular`}
        />
        {suffix && (
          <span className="shrink-0 text-sm text-muted">{suffix}</span>
        )}
      </div>
    </Wrapper>
  );
}

export function TextAreaField({
  label,
  id,
  value,
  onChange,
  error,
  hint,
  required,
  rows = 4,
  maxLength,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <Wrapper label={label} id={id} error={error} hint={hint} required={required}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputBase} ${borderFor(error)}`}
      />

      {/*
        A live count, not a hard `maxLength` on the element. Truncating silently
        at a character limit loses the end of a sentence someone is mid-way
        through typing; a count that goes red lets them decide what to cut.
      */}
      {maxLength && (
        <p
          className={`mt-1 text-right text-xs tabular ${
            value.length > maxLength ? 'text-error' : 'text-muted'
          }`}
        >
          {value.length} / {maxLength}
        </p>
      )}
    </Wrapper>
  );
}

export function SelectField({
  label,
  id,
  value,
  onChange,
  options,
  error,
  hint,
  required,
  placeholder,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  /** Shown as the empty option. Omit to forbid an empty choice. */
  placeholder?: string;
}) {
  return (
    <Wrapper label={label} id={id} error={error} hint={hint} required={required}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputBase} ${borderFor(error)}`}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

/**
 * A checkbox with its explanation attached.
 *
 * The description is wired with `aria-describedby` rather than left as nearby
 * text, because these checkboxes change behaviour rather than just storing a
 * flag — `hasElevationProfile` decides whether itinerary altitudes are
 * required — and a label reading "Has elevation profile" on its own does not
 * say that.
 */
export function CheckboxField({
  label,
  id,
  checked,
  onChange,
  description,
  error,
}: {
  label: string;
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: ReactNode;
  error?: string;
}) {
  const describedBy = [
    description ? `${id}-description` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="rounded border border-hairline bg-white p-4">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={describedBy || undefined}
          className="mt-0.5 size-4 shrink-0 accent-ink"
        />
        <div>
          <label htmlFor={id} className="text-sm font-semibold">
            {label}
          </label>
          {description && (
            <p id={`${id}-description`} className="mt-1 text-xs text-muted">
              {description}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A multi-select rendered as checkboxes.
 *
 * Not a `select multiple`. That control requires ctrl-click to add a second
 * option, silently replaces the whole selection on a plain click, and is close
 * to unusable on a touchscreen — for twelve months that all need to be visible
 * at once, a checkbox grid is both clearer and smaller.
 *
 * Order comes from `options`, not from the order they were ticked: bestMonths
 * is a season, and a stored `['March', 'January']` reads as a mistake.
 */
export function CheckboxGroupField({
  label,
  id,
  values,
  options,
  onChange,
  hint,
  error,
}: {
  label: string;
  id: string;
  values: string[];
  options: readonly string[];
  onChange: (values: string[]) => void;
  hint?: ReactNode;
  error?: string;
}) {
  function toggle(option: string) {
    const next = values.includes(option)
      ? values.filter((value) => value !== option)
      : [...values, option];

    onChange(options.filter((candidate) => next.includes(candidate)));
  }

  return (
    <fieldset>
      {/* A fieldset's label is its legend — a `label` element here would have
          nothing single to point at. */}
      <legend className="text-sm font-semibold">{label}</legend>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() => toggle(option)}
              className="size-4 accent-ink"
            />
            {option}
          </label>
        ))}
      </div>

      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** A two-column row that collapses to one on narrow screens. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2">{children}</div>;
}
