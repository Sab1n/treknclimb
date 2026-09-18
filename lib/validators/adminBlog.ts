import { z } from 'zod';

import { isReservedSlug } from '../../models/shared/reservedSlugs';
import { PUBLISH_STATUSES } from '../../models/shared/status';

/**
 * The blog post editor's schema.
 *
 * Same conventions as the other content editors: every value arrives as a
 * string because that is what an input holds, `''` becomes `undefined`
 * **before** `.optional()` rather than after, and numbers are parsed once here
 * rather than trusted from the client.
 */

/** `''` → `undefined`. Applied before `.optional()`, never after. */
const emptyToUndefined = (value: string) =>
  value.trim() === '' ? undefined : value.trim();

const optionalText = (max = 500) =>
  z.string().max(max).transform(emptyToUndefined).optional();

/**
 * The post slug.
 *
 * `/blog/<slug>` sits under a static segment, so it cannot shadow a top-level
 * route the way a destination slug can — but `category` is in the reserved list
 * for a reason that applies exactly here: `/blog/category` is a static route
 * beside `/blog/[slug]`, so a post slugged `category` builds a page the archive
 * route permanently wins. The document saves, the build passes, and the post
 * silently never serves.
 */
export const blogSlugSchema = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .max(140)
  .toLowerCase()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers and single hyphens only'
  )
  .refine((value) => !isReservedSlug(value), {
    error: (issue) =>
      `"${String(issue.input)}" is reserved — /blog/${String(issue.input)} would be shadowed by a static route and the post would never be reachable.`,
  });

/**
 * A date from an `<input type="date">`, or nothing.
 *
 * **Parsed as local midnight, not UTC.** A bare `YYYY-MM-DD` handed to `new
 * Date()` is read as UTC, which in Nepal (UTC+5:45) files an evening publish
 * under the previous day — the same trap `lib/adminTime.ts` exists to close for
 * the inquiry filters. Splitting the parts and building the date explicitly
 * avoids it.
 */
const publishDateSchema = z
  .string()
  .trim()
  .transform((value) => {
    if (value === '') return undefined;

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) return null;

    const [, year, month, day] = match;

    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  })
  .refine(
    (value) => value !== null && (value === undefined || !Number.isNaN(value.getTime())),
    'Enter a valid date'
  );

const readTimeSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : Number(value)))
  .refine(
    (value) => value === undefined || Number.isInteger(value),
    'Read time must be a whole number of minutes'
  )
  .refine(
    (value) => value === undefined || (value >= 1 && value <= 120),
    'Read time must be between 1 and 120 minutes'
  );

const objectId = (message: string) =>
  z.string().trim().regex(/^[0-9a-f]{24}$/i, message);

/** The eight shared SEO fields, spread in below. */
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
 * Fields required to publish, not required to exist.
 *
 * The same rule `Trip` uses and for the same reason: a draft is by definition
 * unfinished, and refusing to save one until it is complete means it cannot be
 * started. `body` and `featuredImage` are the two that matter — a published
 * post with no body is a blank page on a site whose organic traffic is the
 * business.
 *
 * `superRefine` rather than per-field validators, because the condition is
 * about another field (`status`) and `ctx.addIssue` with an explicit `path` is
 * what keys each message to the input that has to change.
 */
export const adminBlogPostSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    slug: blogSlugSchema,
    excerpt: optionalText(600),
    // Markdown subset, from the rich text editor. Long, so no tight cap.
    body: z.string().max(60_000).transform(emptyToUndefined).optional(),

    featuredImage: optionalText(300),
    featuredImageAlt: optionalText(300),

    category: objectId('Choose a category'),

    author: optionalText(120),
    authorRole: optionalText(160),
    authorBio: optionalText(2000),
    readTimeMinutes: readTimeSchema,

    relatedTrips: z.array(objectId('Bad trip reference')).max(12),

    publishedAt: publishDateSchema,

    status: z
      .string()
      .trim()
      .refine(
        (value) => (PUBLISH_STATUSES as readonly string[]).includes(value),
        'Choose draft, published or archived'
      ),

    ...seoFields,
  })
  .superRefine((data, ctx) => {
    if (data.status !== 'published') return;

    if (!data.body) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'A published post needs a body.',
      });
    }

    if (!data.excerpt) {
      ctx.addIssue({
        code: 'custom',
        path: ['excerpt'],
        message:
          'A published post needs an excerpt — it is the card blurb and the search snippet fallback.',
      });
    }

    if (!data.featuredImage) {
      ctx.addIssue({
        code: 'custom',
        path: ['featuredImage'],
        message: 'A published post needs a featured image.',
      });
    }

    /*
     * The alt-text rule, which is unconditional on the image rather than on
     * publishing: CLAUDE.md requires alt text on every image before save, so an
     * image with no description cannot be stored even on a draft.
     */
  })
  .superRefine((data, ctx) => {
    if (data.featuredImage && !data.featuredImageAlt) {
      ctx.addIssue({
        code: 'custom',
        path: ['featuredImageAlt'],
        message:
          'The featured image needs alt text — what it shows, for a reader who cannot see it.',
      });
    }
  });

export type AdminBlogPostInput = z.input<typeof adminBlogPostSchema>;
