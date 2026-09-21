import { z } from 'zod';

import { isReservedSlug } from '../../models/shared/reservedSlugs';
import { PERMIT_COMPLEXITIES } from '../../models/shared/permitComplexity';
import { PUBLISH_STATUSES } from '../../models/shared/status';

/**
 * Schemas for the destination and activity editors.
 *
 * Same conventions as the trip editor, for the same reasons: every value
 * arrives as a string because that is what an input holds, `''` becomes
 * `undefined` **before** `.optional()` rather than after, and the slug rules
 * are shared rather than respelled.
 */

/** `''` → `undefined`. Applied before `.optional()`, never after. */
const emptyToUndefined = (value: string) =>
  value.trim() === '' ? undefined : value.trim();

/**
 * An optional free-text field.
 *
 * The order matters and is the bug CLAUDE.md records:
 * `z.string().optional().or(z.literal('').transform(...))` looks right and is
 * not — `.or()` tries the left branch first, `z.string().optional()` accepts
 * `''`, and the transform never runs. Here the consequence is an empty string
 * stored on an optional path instead of the field being left unset, which makes
 * `activitiesIntro` render an empty section rather than fall back.
 */
const optionalText = (max = 500) =>
  z.string().max(max).transform(emptyToUndefined).optional();

/**
 * The slug rule, shared by both editors.
 *
 * A destination slug becomes a top-level URL and an activity slug the second
 * segment, so both are exposed to the reserved list — a destination slugged
 * `blog` builds a page the static route permanently wins, and the document
 * saves and the build passes while the page silently never serves.
 */
export const contentSlugSchema = z
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

/** A whole number arriving as a string. Blank means zero, which is the default. */
const displayOrderSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? 0 : Number(value)))
  .refine(Number.isFinite, 'Display order must be a number')
  .refine((value) => value >= 0 && value <= 999, 'Display order must be 0–999');

/** The eight shared SEO fields, spread into both schemas below. */
const seoFields = {
  metaTitle: optionalText(200),
  metaDescription: optionalText(400),
  canonicalUrl: optionalText(500),
  ogTitle: optionalText(200),
  ogDescription: optionalText(400),
  ogImage: optionalText(500),
  schemaType: optionalText(80),
  noIndex: z.boolean(),
};

/**
 * The destination editor.
 *
 * **There is no `create` counterpart, and that is the point.** The four
 * destinations are seeded once and edit-only; a create schema would be the
 * first half of a feature CLAUDE.md rules out.
 *
 * `hasActivities` is absent too, and for a stronger reason: it is the source of
 * truth for the Nepal asymmetry, which propagates through the data model, the
 * URL structure, filters, breadcrumbs and the trip editor. Toggling it on a
 * destination with published trips would invalidate every one of them at once —
 * each trip's `pre('validate')` hook would start demanding, or rejecting, an
 * activity that the trip either does not have or cannot lose. It is a migration,
 * not a checkbox, so the editor does not offer it.
 */
export const adminDestinationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  slug: contentSlugSchema,
  description: z.string().trim().min(1, 'Description is required').max(2000),
  coverImage: z.string().trim().min(1, 'A cover image is required').max(300),
  coverImageAlt: z
    .string()
    .trim()
    .min(1, 'The cover image needs alt text')
    .max(300),
  displayOrder: displayOrderSchema,

  // The four comparison labels on /destinations. All optional — the table
  // renders only for destinations that have them.
  typicalLengthLabel: optionalText(120),
  maxAltitudeLabel: optionalText(120),
  bestMonthsLabel: optionalText(120),
  permitComplexity: z
    .string()
    .trim()
    .transform(emptyToUndefined)
    .optional()
    .refine(
      (value) =>
        value === undefined ||
        (PERMIT_COMPLEXITIES as readonly string[]).includes(value),
      'Choose one of the listed permit complexities'
    ),

  // Markdown subset, rendered through PostBody. Long, so no tight cap.
  activitiesIntro: optionalText(20_000),

  ...seoFields,
});

export type AdminDestinationInput = z.input<typeof adminDestinationSchema>;

/**
 * The activity editor, used by both create and save.
 *
 * One schema for both, unlike trips — an activity has no field it cannot have
 * at creation, so there is no deadlock to work around and no reason for a
 * reduced create form. `destination` is accepted here because an activity can
 * legitimately move between destinations; the model's own check is what stops
 * it landing on one without an activity layer.
 */
export const adminActivitySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  slug: contentSlugSchema,
  destination: z.string().trim().min(1, 'Choose a destination'),
  description: z.string().trim().min(1, 'Description is required').max(4000),
  suitability: optionalText(4000),
  coverImage: z.string().trim().min(1, 'A cover image is required').max(300),
  coverImageAlt: z
    .string()
    .trim()
    .min(1, 'The cover image needs alt text')
    .max(300),
  displayOrder: displayOrderSchema,

  ...seoFields,
});

export type AdminActivityInput = z.input<typeof adminActivitySchema>;

/**
 * The region editor, used by both create and save.
 *
 * Shaped like the activity schema minus `suitability`. `destination` is
 * accepted and **not restricted to destinations with an activity layer**: a
 * region is a place, India has real ones, and what such a record lacks is a
 * URL rather than a right to exist. The model takes the same position.
 *
 * `description` allows 4000 characters because it is the editorial body of the
 * region page rather than a card blurb — it goes through the Markdown-subset
 * parser, so it carries headings and paragraphs.
 */
export const adminRegionSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  slug: contentSlugSchema,
  destination: z.string().trim().min(1, 'Choose a destination'),
  description: z.string().trim().min(1, 'Description is required').max(4000),
  coverImage: z.string().trim().min(1, 'A cover image is required').max(300),
  coverImageAlt: z
    .string()
    .trim()
    .min(1, 'The cover image needs alt text')
    .max(300),
  displayOrder: displayOrderSchema,

  ...seoFields,
});

export type AdminRegionInput = z.input<typeof adminRegionSchema>;

/**
 * An optional ObjectId reference arriving from a select.
 *
 * `''` is what the "None" option submits, and it has to become `null` rather
 * than `undefined`: `Faq.trip` and `Testimonial.trip` are typed
 * `Types.ObjectId | null` — nullable, not optional — because the key is always
 * present and null is a real, meaningful value. Sending `undefined` would leave
 * an existing association in place on an update instead of clearing it, which
 * is the specific bug of "I removed the trip and it came back".
 *
 * The shape is checked here rather than left to Mongoose, because a bad id
 * throws a `CastError` with no field path attached and the editor cannot render
 * it against the right select.
 */
const optionalRef = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .refine(
    (value) => value === null || /^[0-9a-f]{24}$/i.test(value),
    'That is not a valid record reference'
  );

/**
 * The testimonial editor.
 *
 * ## The photo is optional; its alt text is conditional on it
 *
 * CLAUDE.md requires alt text on every image before save, and a testimonial
 * without a photo has no image to describe. `superRefine` rather than a field
 * validator, because the rule is about the *pair* — a single field cannot see
 * its neighbour — and `ctx.addIssue` with an explicit `path` is what keys the
 * error to `photoAlt` so the editor renders it under that input rather than at
 * the top of the form.
 *
 * The model enforces the same rule through a conditional `required` function,
 * and that is the one that actually guarantees it: this schema is bypassed by
 * any migration script, and the model is not.
 */
export const adminTestimonialSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    quote: z.string().trim().min(1, 'The quote is required').max(2000),
    photo: optionalText(300),
    photoAlt: optionalText(300),
    trip: optionalRef,
    country: optionalText(80),
    displayOrder: displayOrderSchema,
    status: z
      .string()
      .trim()
      .refine(
        (value) => (PUBLISH_STATUSES as readonly string[]).includes(value),
        'Choose draft, published or archived'
      ),
  })
  .superRefine((data, ctx) => {
    if (data.photo && !data.photoAlt) {
      ctx.addIssue({
        code: 'custom',
        path: ['photoAlt'],
        message:
          'A photo needs alt text — what it shows, for a reader who cannot see it.',
      });
    }
  });

export type AdminTestimonialInput = z.input<typeof adminTestimonialSchema>;

/**
 * The FAQ editor.
 *
 * `destination` is the only association. A trip's questions live in
 * `Trip.faqs`, the embedded array the trip editor writes and the trip page
 * renders — there is no `trip` field here to validate.
 *
 * The answer is deliberately uncapped at a low number. It is prose that ends
 * up in `FAQPage` JSON-LD, where a truncated answer is worse than a long one.
 */
export const adminFaqSchema = z.object({
  question: z.string().trim().min(1, 'The question is required').max(300),
  answer: z.string().trim().min(1, 'The answer is required').max(5000),
  category: optionalText(80),
  destination: optionalRef,
  displayOrder: displayOrderSchema,
  status: z
    .string()
    .trim()
    .refine(
      (value) => (PUBLISH_STATUSES as readonly string[]).includes(value),
      'Choose draft, published or archived'
    ),
});

export type AdminFaqInput = z.input<typeof adminFaqSchema>;

/**
 * A reorder request: ids in their new order.
 *
 * Separate from the editor schema because reordering is a different operation
 * with a different failure mode. It carries no content, so it cannot fail
 * validation on a field the admin cannot see from the list, and it must not
 * quietly rewrite anything but `displayOrder`.
 */
export const faqReorderSchema = z.object({
  ids: z
    .array(z.string().trim().regex(/^[0-9a-f]{24}$/i, 'Bad record reference'))
    .min(1, 'Nothing to reorder')
    .max(500),
});

/**
 * The team-member editor.
 *
 * Same photo/alt pairing as testimonials, and the same `superRefine` for the
 * same reason: the rule is about the **pair**, so a single field validator
 * cannot see its neighbour, and `ctx.addIssue` with an explicit `path` is what
 * keys the message to `photoAlt` rather than dumping it at the top of the form.
 *
 * The model enforces it twice over — a conditional `required` for document
 * saves and a `pre('findOneAndUpdate')` for query middleware — and those are
 * the guarantees. This schema is bypassed by any script; the model is not.
 *
 * `credentials` and `languages` arrive as arrays of strings from repeatable
 * lists. Blank entries are dropped rather than rejected: an empty row is
 * someone clicking "add" and changing their mind, not an error worth blocking
 * a save over.
 */
const trimmedList = (max: number, maxLength: number) =>
  z
    .array(z.string().max(maxLength))
    .max(max)
    .transform((values) =>
      values.map((value) => value.trim()).filter((value) => value !== '')
    );

export const adminTeamMemberSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    role: z.string().trim().min(1, 'A role is required').max(120),
    photo: optionalText(300),
    photoAlt: optionalText(300),
    bio: optionalText(3000),
    credentials: trimmedList(20, 160),
    languages: trimmedList(20, 80),
    /**
     * Years guiding. Bounded because it is a claim about a named person, and
     * an unbounded number is a typo waiting to be published as fact.
     */
    yearsExperience: z
      .string()
      .trim()
      .transform((value) => (value === '' ? undefined : Number(value)))
      .refine(
        (value) => value === undefined || Number.isInteger(value),
        'Years of experience must be a whole number'
      )
      .refine(
        (value) => value === undefined || (value >= 0 && value <= 80),
        'Years of experience must be between 0 and 80'
      ),
    displayOrder: displayOrderSchema,
    status: z
      .string()
      .trim()
      .refine(
        (value) => (PUBLISH_STATUSES as readonly string[]).includes(value),
        'Choose draft, published or archived'
      ),
  })
  .superRefine((data, ctx) => {
    if (data.photo && !data.photoAlt) {
      ctx.addIssue({
        code: 'custom',
        path: ['photoAlt'],
        message:
          'A photo needs alt text — what it shows, for a reader who cannot see it.',
      });
    }
  });

export type AdminTeamMemberInput = z.input<typeof adminTeamMemberSchema>;
