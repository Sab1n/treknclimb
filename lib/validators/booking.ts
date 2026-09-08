import { z } from 'zod';

/**
 * The booking inquiry schema, shared by the client form and the route handler.
 *
 * One definition, two consumers. The client uses it through `zodResolver` for
 * inline field errors; the server parses the request body with it again. That
 * second parse is not redundant — client validation is a convenience for
 * honest visitors and provides no guarantee at all, because anyone can POST
 * directly to the endpoint.
 *
 * Fields are exactly SRS §11 and nothing else.
 */

export const CONTACT_CHANNELS = ['email', 'whatsapp', 'either'] as const;

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
 * Empty optional inputs arrive as `''` from an HTML form, not `undefined`, so
 * each one is normalised to `undefined` before validation. Without that, an
 * untouched phone field would fail a `.min()` check.
 */
export const bookingFormSchema = z.object({
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
    .optional()
    .or(z.literal('').transform(() => undefined)),

  /** Trip slug, auto-filled from the trip page. Empty means a general inquiry. */
  tripSlug: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),

  preferredDate: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined))
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
    .optional()
    .or(z.literal('').transform(() => undefined)),

  preferredChannel: z.enum(CONTACT_CHANNELS),
});

export type BookingFormValues = z.input<typeof bookingFormSchema>;
export type BookingFormParsed = z.output<typeof bookingFormSchema>;

/**
 * What the endpoint actually receives: the form fields plus three anti-spam
 * values the visitor never sees.
 *
 * `.extend()` builds a second schema from the first rather than repeating it,
 * so the form and the endpoint can never disagree about the real fields.
 */
export const bookingSubmissionSchema = bookingFormSchema.extend({
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
});

export type BookingSubmission = z.output<typeof bookingSubmissionSchema>;

/** Submissions completed faster than this are rejected as automated. */
export const MIN_COMPLETION_MS = 3000;
