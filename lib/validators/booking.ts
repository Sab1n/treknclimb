import { z } from 'zod';
import { COUNTRIES, isCountry } from '../countries';
import { TRIP_TYPES } from '../../models/shared/departures';
import { parseDepartureId } from '../departures';

/**
 * The booking inquiry schema, shared by the client form and the route handler.
 *
 * One definition, two consumers. The client uses it through `zodResolver` for
 * inline field errors; the server parses the request body with it again. That
 * second parse is not redundant — client validation is a convenience for
 * honest visitors and provides no guarantee at all, because anyone can POST
 * directly to the endpoint.
 *
 * Fields are SRS §11 plus two documented additions: `nationality` (see
 * `lib/countries.ts` and CLAUDE.md — permit fees and visa rules differ by
 * nationality, so a quote cannot be accurate without it) and `consent`.
 */

export const CONTACT_CHANNELS = ['email', 'whatsapp', 'either'] as const;

/**
 * `''` becomes `undefined`; anything else passes through untouched.
 *
 * This runs **before** `.optional()` on every optional field, and the order is
 * the whole point — see the note on the schema below.
 */
function emptyToUndefined(value: string): string | undefined {
  return value === '' ? undefined : value;
}

/** Rejects a date that has already passed, ignoring time of day. */
function isNotInThePast(value: string): boolean {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return parsed >= today;
}

/**
 * The fields a visitor actually fills in.
 *
 * ## Empty optional inputs
 *
 * An untouched input arrives as `''`, never `undefined`. That is how HTML
 * forms work, and React Hook Form's `defaultValues` are `''` for the same
 * reason. So every optional field normalises `''` to `undefined` with
 * `.transform()` **before** `.optional()`, and any `.refine()` then runs on the
 * normalised value.
 *
 * The order matters, and the obvious-looking alternative is silently wrong:
 *
 *     z.string().trim().optional().or(z.literal('').transform(() => undefined))
 *
 * `.or()` builds a union that tries the left side first, and
 * `z.string().optional()` accepts `''` happily — so the right-hand branch never
 * runs and the value stays `''`. On `preferredDate` that reached the refine as
 * an empty string, `new Date('')` is `Invalid Date`, and **every inquiry that
 * left the date blank was rejected with "Please choose a date in the future"**.
 *
 * It survived the original endpoint tests because those payloads omitted the
 * optional keys entirely, which is the one thing a real browser never does.
 * `lib/validators/booking.test.ts` now submits the exact browser shape — every
 * key present, blanks as empty strings — so the distinction is covered rather
 * than assumed.
 */
const bookingFormFields = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Please give us a name we can use')
    .max(120, 'That name is longer than we can store'),

  email: z.email('That does not look like an email address').max(254),

  phone: z
    .string()
    .trim()
    .max(40)
    .transform(emptyToUndefined)
    .optional(),

  /**
   * Required. Nepal's trekking permit fees and visa rules differ by
   * nationality, so the quote depends on it.
   *
   * Validated against the closed list rather than accepted as free text: the
   * value is stored and has to stay filterable. The select in the browser
   * already constrains it, but the endpoint is reachable directly, so this is
   * the check that actually holds.
   */
  nationality: z
    .string()
    .trim()
    .min(1, 'Please choose your nationality')
    .refine(isCountry, 'Please choose a country from the list'),

  /** Trip slug, auto-filled from the trip page. Empty means a general inquiry. */
  tripSlug: z
    .string()
    .trim()
    .max(200)
    .transform(emptyToUndefined)
    .optional(),

  /**
   * Group departure or private trip — the visitor's choice, recorded as one.
   *
   * `''` is the untouched radio group. It is allowed through here and made
   * required by `tripChoiceRule` below *only when a trip is named*: a general
   * inquiry has no trip to travel on either way.
   *
   * `z.union([...]).transform()` rather than `z.enum().optional()`: the
   * browser sends `''`, not `undefined`, so `''` has to be accepted *and*
   * normalised before anything asks whether it is present.
   */
  tripType: z
    .union([z.enum(TRIP_TYPES), z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),

  /**
   * `<season id>:<YYYY-MM-DD>`, set by the departure picker. Shape-checked
   * here; whether it still exists is the route's question, and the answer
   * never rejects the inquiry — see `app/api/bookings/route.ts`.
   */
  departureId: z
    .string()
    .trim()
    .max(60)
    .transform(emptyToUndefined)
    .optional()
    .refine(
      (value) => value === undefined || parseDepartureId(value) !== null,
      'That departure is not one we recognise — please choose a date again'
    ),

  preferredDate: z
    .string()
    .trim()
    .transform(emptyToUndefined)
    .optional()
    .refine(
      (value) => value === undefined || isNotInThePast(value),
      'Please choose a date in the future'
    ),

  travellers: z.coerce
    .number('Please enter a number')
    .int('Whole numbers only')
    .min(1, 'At least one traveller')
    .max(50, 'For groups over 50, email us directly'),

  message: z
    .string()
    .trim()
    .max(4000, 'Please keep this under 4000 characters')
    .transform(emptyToUndefined)
    .optional(),

  preferredChannel: z.enum(CONTACT_CHANNELS),

  /**
   * Consent to be contacted about this inquiry. Unticked by default and
   * required to submit.
   *
   * `z.boolean().refine(v => v === true)` rather than `z.literal(true)` so that
   * `false` — what an unticked box actually sends — produces a field error on
   * `consent` with our wording, instead of a type mismatch. Checked on the
   * server as well as in the browser: consent that only the client enforces is
   * not consent, it is a UI convention.
   */
  consent: z
    .boolean()
    .refine(
      (value) => value === true,
      'Please tick this so we can reply to your inquiry'
    ),
});

/**
 * The rules that span fields: which choices a named trip requires.
 *
 * A standalone function so both schemas below apply the same one. Zod 4
 * refuses to `.extend()` an object that already carries refinements, so the
 * fields are declared once, and this is attached to each schema separately
 * rather than to the shared base.
 *
 * The `data` parameter is typed from the *output* of the fields — after the
 * transforms — which is why `tripType` is `'group' | 'private' | undefined`
 * here and never `''`.
 */
function tripChoiceRule(
  data: z.output<typeof bookingFormFields>,
  ctx: z.RefinementCtx
): void {
  if (!data.tripSlug) return;

  if (!data.tripType) {
    ctx.addIssue({
      code: 'custom',
      message: 'Choose a group departure or a private trip',
      path: ['tripType'],
    });
    return;
  }

  if (data.tripType === 'group' && !data.departureId) {
    ctx.addIssue({
      code: 'custom',
      message: 'Choose a departure date',
      path: ['departureId'],
    });
  }
}

export const bookingFormSchema = bookingFormFields.superRefine(tripChoiceRule);

export type BookingFormValues = z.input<typeof bookingFormSchema>;
export type BookingFormParsed = z.output<typeof bookingFormSchema>;

/** Re-exported so the form does not need a second import for the select. */
export { COUNTRIES };

/**
 * What the endpoint actually receives: the form fields plus three anti-spam
 * values the visitor never sees.
 *
 * `.extend()` builds a second schema from the first rather than repeating it,
 * so the form and the endpoint can never disagree about the real fields.
 */
export const bookingSubmissionSchema = bookingFormFields.extend({
  /**
   * Honeypot. Named to look worth filling in to a bot reading the DOM, hidden
   * from people and from screen readers. Any value at all means spam.
   */
  company: z.string().max(200).optional(),

  /**
   * When the form was rendered, as epoch milliseconds. The server rejects
   * anything completed in under three seconds — faster than a human reads the
   * fields, and a cheap filter for scripted submissions.
   */
  renderedAt: z.coerce.number().int().nonnegative(),

  /** Cloudflare Turnstile token. Absent when Turnstile is not configured. */
  turnstileToken: z.string().max(4096).optional(),
}).superRefine(tripChoiceRule);

export type BookingSubmission = z.output<typeof bookingSubmissionSchema>;

/** Submissions completed faster than this are rejected as automated. */
export const MIN_COMPLETION_MS = 3000;
