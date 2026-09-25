'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';

import {
  bookingFormSchema,
  type BookingFormValues,
} from '../../lib/validators/booking';
import { Field, inputClass } from './Field';
import CountrySelect from './CountrySelect';
import {
  blackoutOn,
  generateDepartures,
  isIsoDate,
  nepalToday,
  parseDepartureId,
} from '../../lib/departures';
import { CONSENT_STATEMENT } from '../../lib/consent';
import type { BookingRailDTO } from '../../types/dto';
import TripChoice from './TripChoice';
import Turnstile, { type TurnstileHandle } from './Turnstile';
import BlackoutWarning from '../content/BlackoutWarning';

const RENDERED_AT_ID = 'tnc-rendered-at';

/**
 * A trip the form can name, with what its departure picker needs — the same
 * `BookingRailDTO` the trip page's rail reads, so both generate the same
 * departures from the same seasons.
 */
export interface TripOption {
  slug: string;
  title: string;
  rail: BookingRailDTO;
}

/** The clock and the URL notify nobody; see TripBookingRail. */
function subscribeToNothing(): () => void {
  return () => {};
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
 * ## The trip comes first
 *
 * The trip, group-or-private, and the departure sit at the top. A visitor who
 * pressed "Continue with 13 October" on the trip page sees that departure —
 * dates, length, price per person — before anything is asked of them, with a
 * way to change it or switch to a private trip (`TripChoice`). Group or
 * private is a required radio whenever a trip is named: recorded as the
 * visitor's choice, never guessed from whether a date was filled in.
 *
 * ## Turnstile waits, and never asks for a reload
 *
 * The widget is `components/forms/Turnstile.tsx`, rendered explicitly — the
 * implicit script scans the page once on load, so arriving here by
 * client-side navigation left no widget at all and every submission failed.
 * Submitting waits for the token rather than sending without one, a spent
 * token is reset after a failed attempt, and a failure says so in place
 * instead of telling the visitor to reload a form they have just filled in.
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
  today: serverToday,
  turnstileSiteKey,
  whatsappNumber,
}: {
  trips: TripOption[];
  /** Pokhara's date when the page was generated; replaced by the browser's after hydration. */
  today: string;
  /** Absent until the Cloudflare account exists; the widget is then skipped. */
  turnstileSiteKey?: string;
  whatsappNumber?: string;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const turnstileRef = useRef<TurnstileHandle>(null);

  /*
   * Read through `useSyncExternalStore` for the same reason as the rail: the
   * server's value during hydration, the browser's afterwards, no effect and
   * no second render. The query string is read this way too — only so that
   * `TripChoice` can say, during render, that the departure a visitor
   * arrived with has gone.
   */
  const today = useSyncExternalStore(subscribeToNothing, () => nepalToday(), () => serverToday);
  const search = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.search,
    () => ''
  );
  const arrival = new URLSearchParams(search);

  const blackoutNoteId = useId();

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
      tripType: '',
      departureId: '',
      preferredDate: '',
      travellers: 2,
      message: '',
      preferredChannel: 'email',
      // Unticked. A pre-ticked consent box is not consent.
      consent: false,
    },
  });

  /*
   * Preselect from the query string, after mount. The trip page's rail links
   * here with a **choice**:
   *
   *   ?trip=<slug>&departure=<season>:<date>   a group departure
   *   ?trip=<slug>&type=private[&date=…]       a private trip
   *   ?trip=<slug>                             nothing chosen yet
   *
   * Everything is checked before it is used, because the query string is
   * anyone's to edit. A departure is taken only if the trip still generates
   * it and it is still available; otherwise group is still selected — that was
   * the visitor's choice — the calendar opens, and `TripChoice` says the date
   * has gone. A bare `?date=` is only ever a preferred date: it does not say
   * group or private, and the form does not guess.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('trip');
    const departure = params.get('departure');
    const date = params.get('date');
    const trip = trips.find((candidate) => candidate.slug === slug);

    if (date && isIsoDate(date)) setValue('preferredDate', date);

    if (!trip) return;

    setValue('tripSlug', trip.slug);

    const departures = generateDepartures(trip.rail.seasons, trip.rail.durationDays, nepalToday());

    if (departures.length === 0) {
      // Group is not an option at all, so there is nothing to choose.
      setValue('tripType', 'private');
    } else if (departure && parseDepartureId(departure)) {
      setValue('tripType', 'group');

      const found = departures.find((candidate) => candidate.id === departure);

      if (found?.status === 'available') setValue('departureId', found.id);
    } else if (params.get('type') === 'private') {
      setValue('tripType', 'private');
    }
  }, [trips, setValue]);

  const [tripSlug, tripType, departureId, preferredDate] = useWatch({
    control,
    name: ['tripSlug', 'tripType', 'departureId', 'preferredDate'],
  });

  const trip = trips.find((candidate) => candidate.slug === tripSlug) ?? null;

  const blackout =
    trip && tripType === 'private' && preferredDate && isIsoDate(preferredDate)
      ? blackoutOn(preferredDate, trip.rail.blackoutPeriods)
      : null;

  /** A new trip is a new question: its departures and its prices differ. */
  function resetChoiceFor(slug: string) {
    const next = trips.find((candidate) => candidate.slug === slug);
    const hasGroup =
      !!next && generateDepartures(next.rail.seasons, next.rail.durationDays, today).length > 0;

    setValue('departureId', '');
    setValue('tripType', next && !hasGroup ? 'private' : '');
    setPickerOpen(false);
  }

  const preferredDateField = (
    <div>
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
            min={today}
            {...register('preferredDate')}
            className={inputClass(!!errors.preferredDate)}
          />
        )}
      </Field>

      {blackout && preferredDate && (
        <BlackoutWarning id={blackoutNoteId} date={preferredDate} blackout={blackout} tone="light" />
      )}
    </div>
  );

  async function onSubmit(
    values: BookingFormValues,
    event?: React.BaseSyntheticEvent
  ) {
    setSubmitError(null);

    const form = event?.target as HTMLFormElement | undefined;

    /*
     * Wait for the token instead of submitting without one. Pressing send a
     * second after the last field is filled in is normal, and the widget may
     * still be working; `getToken` resolves as soon as it has one. Null means
     * it genuinely cannot complete — the widget says so and offers a retry, so
     * this only has to explain why nothing was sent.
     */
    let token: string | undefined;

    if (turnstileSiteKey) {
      const resolved = await turnstileRef.current?.getToken();

      if (!resolved) {
        setSubmitError(
          'We could not confirm that you are a person, so nothing has been sent. Use the Try again button under the check below.'
        );
        return;
      }

      token = resolved;
    }

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

        /*
         * A token is single use. Whatever the server rejected the submission
         * for, the one in hand is spent, so the widget gets a fresh one before
         * the visitor presses send again.
         */
        turnstileRef.current?.reset();
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
      turnstileRef.current?.reset();
      setSubmitError(
        'We could not reach the server. Please check your connection and try again, or message us on WhatsApp.'
      );
    }
  }

  const consentErrorId = 'consent-error';

  return (
    <form
      /*
       * Wrapped rather than `onSubmit={handleSubmit(onSubmit)}`: that call
       * happens during render, and `onSubmit` reads the Turnstile ref, which
       * the React lint rules rightly refuse. Inside the handler the call
       * happens on the event instead.
       */
      onSubmit={(event) => handleSubmit(onSubmit)(event)}
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

      {/*
        The chosen departure's identity. Set by the picker, never typed; the
        server looks it up again and takes the dates and price from the trip,
        not from here.
      */}
      <input type="hidden" {...register('departureId')} />

      {/* ---------------- the trip, first ---------------- */}

      <div className="flex flex-col gap-5 rounded-lg border border-hairline bg-paper/60 p-5">
        <Field
          label="Which trip?"
          hint="Leave blank if you are still deciding"
          error={errors.tripSlug?.message}
          htmlFor="tripSlug"
        >
          {(field) => (
            <select
              {...field}
              {...register('tripSlug', {
                onChange: (event) => resetChoiceFor(event.target.value),
              })}
              className={inputClass(!!errors.tripSlug)}
            >
              <option value="">Not sure yet — help me choose</option>
              {trips.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.title}
                </option>
              ))}
            </select>
          )}
        </Field>

        {trip ? (
          <TripChoice
            trip={trip}
            today={today}
            tripType={tripType ?? ''}
            departureId={departureId ?? ''}
            // Only for the trip they arrived with; another trip has its own dates.
            arrivedWith={arrival.get('trip') === trip.slug ? arrival.get('departure') : null}
            radio={register('tripType')}
            tripTypeError={errors.tripType?.message}
            departureError={errors.departureId?.message}
            pickerOpen={pickerOpen}
            onPickDeparture={(departure) => {
              setValue('departureId', departure.id, { shouldValidate: !!errors.departureId });
              setPickerOpen(false);
            }}
            onChangeDate={() => setPickerOpen(true)}
            onSwitchToPrivate={() => {
              /*
               * The departure's date carries over as the private trip's
               * preferred date — the visitor can change it, but should not have
               * to retype the date they just chose.
               */
              const chosen = departureId ? parseDepartureId(departureId) : null;

              setValue('tripType', 'private');
              setValue('departureId', '');
              if (chosen) setValue('preferredDate', chosen.date);
              setPickerOpen(false);
            }}
            privateDateField={preferredDateField}
          />
        ) : (
          preferredDateField
        )}
      </div>

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

      <div className="sm:max-w-[calc(50%-0.625rem)]">
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
        <Turnstile
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action="before we can send your inquiry"
        />
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
