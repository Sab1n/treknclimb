'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Script from 'next/script';

import {
  bookingFormSchema,
  type BookingFormValues,
} from '../../lib/validators/booking';

const RENDERED_AT_ID = 'tnc-rendered-at';

export interface TripOption {
  slug: string;
  title: string;
}

/**
 * The booking inquiry form — a single page of fields, per SRS §11.
 *
 * Client Component because it needs validation state, but the whole form is
 * still server-rendered into the static HTML: its initial state depends on
 * nothing external. The trip preselection from `?trip=` is applied in an effect
 * after mount rather than during render, for the same reason as the /trips
 * filters — reading the query string during render would bail this subtree out
 * of static generation and leave a fallback in the HTML instead of the form.
 */
export default function BookingForm({
  trips,
  turnstileSiteKey,
  whatsappNumber,
}: {
  trips: TripOption[];
  /** Absent until the Cloudflare account exists; the widget is then skipped. */
  turnstileSiteKey?: string;
  whatsappNumber?: string;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * When the form was rendered, for the server-side time trap.
   *
   * Stamped into a hidden input by an effect rather than held in state or a
   * ref. Date.now() is impure, so calling it during render is both a React
   * rule violation and a real hydration hazard — the server pass and the
   * browser would disagree. Writing it to the DOM after mount keeps every
   * read and write outside render, and the value lives where form values
   * belong.
   *
   * If the effect somehow has not run, the field is empty and the elapsed
   * time reads as enormous, which passes the trap. Failing open is the right
   * direction for the one endpoint that must not lose real inquiries.
   */
  useEffect(() => {
    const field = document.getElementById(RENDERED_AT_ID);
    if (field instanceof HTMLInputElement) field.value = String(Date.now());
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      tripSlug: '',
      preferredDate: '',
      travellers: 2,
      message: '',
      preferredChannel: 'email',
    },
  });

  // Preselect the trip from ?trip=slug, after mount.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('trip');

    if (slug && trips.some((trip) => trip.slug === slug)) {
      setValue('tripSlug', slug);
    }
  }, [trips, setValue]);

  async function onSubmit(
    values: BookingFormValues,
    event?: React.BaseSyntheticEvent
  ) {
    setSubmitError(null);

    // Turnstile injects this hidden input into the surrounding form once the
    // widget solves. Read off the submit event rather than a ref, so nothing
    // touches the DOM during render. Absent when Turnstile is not configured,
    // which the server handles by skipping verification.
    const form = event?.target as HTMLFormElement | undefined;
    const token = form?.querySelector<HTMLInputElement>(
      'input[name="cf-turnstile-response"]'
    )?.value;

    const renderedAt = Number(
      form?.querySelector<HTMLInputElement>(`#${RENDERED_AT_ID}`)?.value || 0
    );

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...values,
          renderedAt,
          turnstileToken: token,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // The server validates independently, so map its field errors back
        // onto the inputs rather than showing one generic message.
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(
            result.fieldErrors as Record<string, string>
          )) {
            setError(field as keyof BookingFormValues, {
              type: 'server',
              message,
            });
          }
        }

        setSubmitError(result.error ?? 'Something went wrong. Please try again.');
        return;
      }

      // A null reference means the submission was silently discarded as spam.
      // Send it to the same confirmation either way — a bot learns nothing,
      // and a false positive at least sees a sane page.
      window.location.assign(
        result.reference
          ? `/contact/confirmation?ref=${encodeURIComponent(result.reference)}`
          : '/contact/confirmation'
      );
    } catch {
      setSubmitError(
        'We could not reach the server. Please check your connection and try again, or message us on WhatsApp.'
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-5"
    >
      {/*
        Honeypot. Hidden from people with an off-screen wrapper rather than
        display:none — some bots skip anything invisible — and hidden from
        assistive tech with aria-hidden and tabIndex -1.
      */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor="company">Company</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <input type="hidden" id={RENDERED_AT_ID} name="renderedAt" />

      <Field label="Your name" error={errors.name?.message} htmlFor="name" required>
        <input
          id="name"
          type="text"
          autoComplete="name"
          {...register('name')}
          className={inputClass(!!errors.name)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" error={errors.email?.message} htmlFor="email" required>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            className={inputClass(!!errors.email)}
          />
        </Field>

        <Field
          label="Phone or WhatsApp"
          hint="Optional, but faster"
          error={errors.phone?.message}
          htmlFor="phone"
        >
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            {...register('phone')}
            className={inputClass(!!errors.phone)}
          />
        </Field>
      </div>

      <Field
        label="Which trip?"
        hint="Leave blank if you are still deciding"
        error={errors.tripSlug?.message}
        htmlFor="tripSlug"
      >
        <select
          id="tripSlug"
          {...register('tripSlug')}
          className={inputClass(!!errors.tripSlug)}
        >
          <option value="">Not sure yet — help me choose</option>
          {trips.map((trip) => (
            <option key={trip.slug} value={trip.slug}>
              {trip.title}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Preferred start date"
          hint="Approximate is fine"
          error={errors.preferredDate?.message}
          htmlFor="preferredDate"
        >
          <input
            id="preferredDate"
            type="date"
            {...register('preferredDate')}
            className={inputClass(!!errors.preferredDate)}
          />
        </Field>

        <Field
          label="Number of travellers"
          error={errors.travellers?.message}
          htmlFor="travellers"
          required
        >
          <input
            id="travellers"
            type="number"
            min={1}
            max={50}
            {...register('travellers')}
            className={inputClass(!!errors.travellers)}
          />
        </Field>
      </div>

      <Field
        label="Anything we should know?"
        hint="Fitness, previous trekking, questions — optional"
        error={errors.message?.message}
        htmlFor="message"
      >
        <textarea
          id="message"
          rows={5}
          {...register('message')}
          className={inputClass(!!errors.message)}
        />
      </Field>

      <fieldset>
        <legend className="text-sm font-semibold">How should we reply?</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {(
            [
              ['email', 'Email'],
              ['whatsapp', 'WhatsApp'],
              ['either', 'Either'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value={value}
                {...register('preferredChannel')}
                className="h-4 w-4"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {turnstileSiteKey && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            strategy="lazyOnload"
          />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </>
      )}

      {submitError && (
        <p
          role="alert"
          className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
        >
          {submitError}
          {whatsappNumber && (
            <>
              {' '}
              <a
                href={`https://wa.me/${whatsappNumber}`}
                className="font-semibold underline underline-offset-4"
              >
                Message us on WhatsApp instead
              </a>
              .
            </>
          )}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full bg-marigold px-6 py-3.5 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
        >
          {isSubmitting ? 'Sending…' : 'Get my free itinerary'}
        </button>

        {/* Risk reversal, directly under the button. */}
        <p className="mt-3 text-sm text-muted">
          No payment now. Deposit only after you approve the plan.
        </p>
      </div>
    </form>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full rounded border bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-ink ${
    hasError ? 'border-error' : 'border-hairline'
  }`;
}

function Field({
  label,
  hint,
  error,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
        {required && <span className="text-error"> *</span>}
        {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
      </label>

      <div className="mt-1.5">{children}</div>

      {error && (
        <p role="alert" className="mt-1.5 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
