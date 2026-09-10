'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import Script from 'next/script';

import {
  bookingFormSchema,
  type BookingFormValues,
} from '../../lib/validators/booking';
import { Field, inputClass } from './Field';
import CountrySelect from './CountrySelect';
import { CONSENT_STATEMENT } from '../../lib/consent';

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
 *
 * ## Validation is inline, always
 *
 * Every failure renders next to the field that caused it, in `role="alert"`
 * text wired to the input with `aria-describedby` (see `Field`). **No
 * `alert()`, and no browser validation bubbles** — the `noValidate` attribute
 * on the form suppresses those deliberately, because they cannot be styled,
 * they show one message at a time, and they disappear on the next click. The
 * schema is the only source of validation messages, and it is the same schema
 * the server runs.
 *
 * `shouldFocusError` moves focus to the first field that failed, so a keyboard
 * or screen-reader user is taken to the problem rather than left at the submit
 * button wondering why nothing happened.
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
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    // The default, set explicitly because it is load-bearing: an unticked
    // consent box has to move focus to itself, not just colour a message red.
    shouldFocusError: true,
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      nationality: '',
      tripSlug: '',
      preferredDate: '',
      travellers: 2,
      message: '',
      preferredChannel: 'email',
      // Unticked. A pre-ticked consent box is not consent.
      consent: false,
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
        // onto the inputs rather than showing one generic message. The last
        // one set with `shouldFocus` moves focus there, same as a client-side
        // failure would.
        if (result.fieldErrors) {
          const entries = Object.entries(
            result.fieldErrors as Record<string, string>
          );

          entries.forEach(([field, message], index) => {
            setError(
              field as keyof BookingFormValues,
              { type: 'server', message },
              { shouldFocus: index === 0 }
            );
          });
        }

        setSubmitError(result.error ?? 'Something went wrong. Please try again.');
        return;
      }

      // A null reference means the submission was silently discarded as spam.
      // Send it to the same confirmation either way — a bot learns nothing,
      // and a false positive at least sees a sane page. It is not lost: the
      // endpoint records every rejection to RejectedSubmissions.
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

  const consentErrorId = 'consent-error';

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      // Suppresses the browser's own validation bubbles. Every message on this
      // form comes from the shared Zod schema and renders inline.
      noValidate
      className="flex flex-col gap-5"
    >
      {/*
        Honeypot. Hidden from people with an off-screen wrapper rather than
        display:none — some bots skip anything invisible — and hidden from
        assistive tech with aria-hidden and tabIndex -1.
      */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden"
      >
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
        {(field) => (
          <input
            {...field}
            type="text"
            autoComplete="name"
            {...register('name')}
            className={inputClass(!!errors.name)}
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" error={errors.email?.message} htmlFor="email" required>
          {(field) => (
            <input
              {...field}
              type="email"
              autoComplete="email"
              {...register('email')}
              className={inputClass(!!errors.email)}
            />
          )}
        </Field>

        <Field
          label="Phone or WhatsApp"
          hint="Optional"
          error={errors.phone?.message}
          htmlFor="phone"
        >
          {(field) => (
            <input
              {...field}
              type="tel"
              autoComplete="tel"
              {...register('phone')}
              className={inputClass(!!errors.phone)}
            />
          )}
        </Field>
      </div>

      {/*
        Nationality is required because the quote depends on it: Nepal's
        trekking permit fees and visa rules differ by nationality, so we cannot
        price a trip accurately without knowing it. A deliberate amendment to
        SRS §11 — see CLAUDE.md.

        `Controller` rather than `register` because CountrySelect is not a
        native input: it has no name attribute for React Hook Form to hook
        into, so RHF hands it a value and an onChange instead.
      */}
      <Field
        label="Nationality"
        hint="It changes your permit fee and visa"
        error={errors.nationality?.message}
        htmlFor="nationality"
        required
      >
        {(field) => (
          <Controller
            name="nationality"
            control={control}
            render={({ field: rhf }) => (
              <CountrySelect
                control={field}
                value={rhf.value ?? ''}
                onChange={rhf.onChange}
                onBlur={rhf.onBlur}
                hasError={!!errors.nationality}
              />
            )}
          />
        )}
      </Field>

      <Field
        label="Which trip?"
        hint="Leave blank if you are still deciding"
        error={errors.tripSlug?.message}
        htmlFor="tripSlug"
      >
        {(field) => (
          <select
            {...field}
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
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Preferred start date"
          hint="Approximate is fine"
          error={errors.preferredDate?.message}
          htmlFor="preferredDate"
        >
          {(field) => (
            <input
              {...field}
              type="date"
              {...register('preferredDate')}
              className={inputClass(!!errors.preferredDate)}
            />
          )}
        </Field>

        <Field
          label="Number of travellers"
          error={errors.travellers?.message}
          htmlFor="travellers"
          required
        >
          {(field) => (
            <input
              {...field}
              type="number"
              min={1}
              max={50}
              {...register('travellers')}
              className={inputClass(!!errors.travellers)}
            />
          )}
        </Field>
      </div>

      <Field
        label="Anything we should know?"
        hint="Optional"
        error={errors.message?.message}
        htmlFor="message"
      >
        {(field) => (
          <textarea
            {...field}
            rows={5}
            // Placeholder, never a label substitute: it disappears the moment
            // someone types, and several screen readers do not announce it at
            // all. The label above carries the meaning; this only carries
            // examples.
            placeholder="Accessibility needs, a custom itinerary, dietary requirements, or anything else we should know."
            {...register('message')}
            className={inputClass(!!errors.message)}
          />
        )}
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

      {/*
        Consent. Unticked by default, required to submit, and checked again on
        the server — consent that only the client enforces is a UI convention,
        not consent.

        The Privacy Policy link sits outside the <label> on purpose. A link
        nested inside a label competes with it: clicking the link can toggle the
        checkbox instead of navigating, and the behaviour differs between
        browsers. Keeping it adjacent means the label text still toggles the box
        and the link still just navigates.
      */}
      <div>
        <div className="flex items-start gap-3">
          <input
            id="consent"
            type="checkbox"
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? consentErrorId : undefined}
            {...register('consent')}
            className="mt-0.5 h-4 w-4 shrink-0"
          />

          <p className="text-sm">
            <label htmlFor="consent">{CONSENT_STATEMENT}</label>{' '}
            <Link
              href="/privacy-policy"
              className="font-semibold underline underline-offset-4"
            >
              Privacy Policy
            </Link>
            <span className="ml-2 text-muted">Required</span>
          </p>
        </div>

        {errors.consent && (
          <p
            id={consentErrorId}
            role="alert"
            className="mt-1.5 text-sm text-error"
          >
            {errors.consent.message}
          </p>
        )}
      </div>

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

        {/* Risk reversal, directly under the button. Nothing else sits here —
            no newsletter box, no second call to action. */}
        <p className="mt-3 text-sm text-muted">
          No payment now. Deposit only after you approve the plan.
        </p>
      </div>
    </form>
  );
}
