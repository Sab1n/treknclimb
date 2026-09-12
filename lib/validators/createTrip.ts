import { z } from 'zod';

import { isReservedSlug } from '../../models/shared/reservedSlugs';

/**
 * The create-a-trip schema.
 *
 * ## Why this is a separate screen and not the editor with blank values
 *
 * The editor edits a trip. This makes one, and those are different problems: a
 * Trip has eleven required paths, five of which a brand-new trip cannot
 * possibly have yet. Opening the full editor against a blank document would
 * mean eight tabs of empty fields and a save that fails until the right seven
 * are found across four of them.
 *
 * ## What is asked for here, and what is not
 *
 * Only what the model needs to store a valid **draft**. `summary`,
 * `answerBlock`, `description`, `coverImage` and `coverImageAlt` are required
 * to *publish* rather than to exist — see the note on the Trip schema — so they
 * are not asked for here. `coverImage` could not be asked for even if it were
 * wanted: the upload signature is derived from an existing trip's slug, so
 * there is nothing to sign against until the trip is saved.
 *
 * `minGroupSize` and `maxGroupSize` are not here either. They are required on
 * the interface but carry schema defaults of 1 and 12, so a create form that
 * asked for them would be asking the admin to retype a default.
 *
 * ## Slug rules are the editor's rules
 *
 * Shape, reserved list and message text all come from the same places the
 * editor uses. Two spellings of "what is a valid slug" would eventually
 * disagree, and the disagreement would surface as a trip that can be created
 * and then not saved.
 */

/**
 * The shared slug rule.
 *
 * Exported so the editor and this form cannot drift apart on what a slug is.
 * The reserved-slug message names the route that would shadow it — a trip slug
 * is the last segment under a destination, so `/<slug>` at the root is the
 * collision that matters.
 */
export const tripSlugSchema = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .max(120)
  .toLowerCase()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers and single hyphens only'
  )
  .refine((value) => !isReservedSlug(value), {
    error: (issue) =>
      `"${String(issue.input)}" is a reserved slug — it would shadow the static /${String(issue.input)} route and this page would never be reachable.`,
  });

/**
 * A required number arriving as a string.
 *
 * Same reasoning as the editor's: `Number('')` is 0, so the blank check has to
 * come before the conversion, or an empty duration becomes a zero-day trip.
 * `Number` rather than `parseInt`, because `parseInt('12abc')` is 12 and
 * quietly accepts a typo.
 */
const requiredNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((value) => Number.isFinite(Number(value)), `${label} must be a number`)
    .transform(Number)
    .refine((value) => value >= min, `${label} must be at least ${min}`)
    .refine((value) => value <= max, `${label} cannot be more than ${max}`);

export const createTripSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  slug: tripSlugSchema,
  destination: z.string().trim().min(1, 'Choose a destination'),
  /*
   * Empty string means "no activity", which is a real value for India, Tibet
   * and Bhutan rather than missing data. It becomes `null` in the route,
   * because Mongoose needs null to store an absent reference — the pairing
   * against the destination's `hasActivities` is enforced by the model's
   * `pre('validate')` hook, not here, so the rule lives in exactly one place.
   */
  activity: z.string().trim(),
  startPoint: z.string().trim().min(1, 'Start point is required').max(200),
  endPoint: z.string().trim().min(1, 'End point is required').max(200),
  durationDays: requiredNumber('Duration', 1, 365),
  price: requiredNumber('Price', 0, 1_000_000),
});

/**
 * `z.input` is the shape going in — every field a string, because that is what
 * an input holds. `z.output` is what comes out, with the two numbers parsed.
 * They are genuinely different types here, and conflating them is how a form
 * ends up typed as if its number inputs hold numbers.
 */
export type CreateTripInput = z.input<typeof createTripSchema>;
export type CreateTripOutput = z.output<typeof createTripSchema>;

/** A blank form. Exported so the page and the component agree on the shape. */
export const emptyCreateTrip: CreateTripInput = {
  title: '',
  slug: '',
  destination: '',
  activity: '',
  startPoint: '',
  endPoint: '',
  durationDays: '',
  price: '',
};
