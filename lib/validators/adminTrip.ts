import { z } from 'zod';

import { PUBLISH_STATUSES } from '../../models/shared/status';
import { MONTHS, TRIP_DIFFICULTIES } from '../../models/shared/tripVocab';
import { isReservedSlug } from '../../models/shared/reservedSlugs';

/**
 * The trip editor's schema, shared by the form and the save route.
 *
 * Everything arrives as a string, because that is what an input holds. This is
 * the single place it becomes a number, a boolean or `undefined` — doing it in
 * the browser as well would mean two conversions that can disagree, and the
 * browser's is advisory regardless.
 *
 * ## `''` becomes `undefined` before `.optional()`, never after
 *
 * An untouched input submits an empty string, not `undefined`. The tempting
 * `z.string().optional().or(z.literal('').transform(...))` is wrong: `.or()`
 * tries the left branch first, `z.string().optional()` accepts `''`, and the
 * transform never runs. That shipped a bug on the booking form that rejected
 * every inquiry leaving the date blank. `.transform(...).optional()` is the
 * order that works.
 *
 * For a trip this matters differently but just as much: `''` reaching Mongoose
 * on an optional string path stores an empty string rather than leaving the
 * field unset, and `Number('')` is `0` — a trip silently priced at zero.
 */

/** `''` → `undefined`. Applied before `.optional()`, never after. */
const emptyToUndefined = (value: string) =>
  value.trim() === '' ? undefined : value.trim();

/** An optional free-text field. Blank means "not set", not "set to blank". */
const optionalText = (max = 500) =>
  z.string().max(max).transform(emptyToUndefined).optional();

/**
 * A required number arriving as a string.
 *
 * `Number('')` is 0 and `Number('  ')` is 0, so the blank check has to come
 * before the conversion or an empty duration field saves as a zero-day trip
 * that passes `min: 1` nowhere and fails confusingly at the model. `Number`
 * rather than `parseInt`: `parseInt('12abc')` is 12, which quietly accepts a
 * typo.
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

/** The same, but blank is allowed and means "not set". */
const optionalNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .transform(emptyToUndefined)
    .optional()
    .refine(
      (value) => value === undefined || Number.isFinite(Number(value)),
      `${label} must be a number`
    )
    .transform((value) => (value === undefined ? undefined : Number(value)))
    .refine(
      (value) => value === undefined || (value >= min && value <= max),
      `${label} must be between ${min} and ${max}`
    );

/**
 * A row's client-side React key. Accepted and then discarded.
 *
 * The editor needs it, the database must never store it. Letting it through
 * would put a rendering detail into MongoDB on every subdocument, where it
 * would outlive the component that produced it and confuse the next person to
 * read a trip document.
 */
const rowKey = z.string().max(64);

const tierSchema = z.object({
  key: rowKey,
  minPeople: requiredNumber('Minimum people', 1, 100),
  maxPeople: requiredNumber('Maximum people', 1, 100),
  pricePerPerson: requiredNumber('Tier price', 0, 1_000_000),
  label: optionalText(200),
});

const itinerarySchema = z.object({
  key: rowKey,
  title: z.string().trim().min(1, 'Each day needs a title').max(200),
  description: z.string().trim().min(1, 'Each day needs a description'),
  location: optionalText(200),
  maxAltitudeM: optionalNumber('Altitude', 0, 9000),
  distanceKm: optionalNumber('Distance', 0, 500),
  durationHours: optionalNumber('Walking hours', 0, 24),
  accommodation: optionalText(200),
  meals: optionalText(200),
  image: optionalText(300),
  imageAlt: optionalText(300),
});

const gallerySchema = z.object({
  key: rowKey,
  url: z.string().trim().min(1, 'Image is missing its reference').max(300),
  /*
   * Required here as well as on the model. CLAUDE.md makes alt text mandatory
   * on every image before save, and the model enforces it — but a message
   * arriving as a Mongoose ValidationError keyed `gallery.2.alt` is harder for
   * the editor to attach to a field than one Zod produces with the same path.
   * Both run; this is the one the admin sees.
   */
  alt: z.string().trim().min(1, 'Alt text is required on every image').max(300),
  caption: optionalText(300),
});

const faqSchema = z.object({
  key: rowKey,
  question: z.string().trim().min(1, 'A question is required').max(300),
  answer: z.string().trim().min(1, 'An answer is required'),
});

/** A list line — the includes/excludes editors. Blanks are dropped, not stored. */
const listLine = z.string().trim().max(300);

export const adminTripSchema = z
  .object({
    // --- basic ---
    title: z.string().trim().min(1, 'Title is required').max(200),
    slug: z
      .string()
      .trim()
      .min(1, 'Slug is required')
      .max(120)
      .toLowerCase()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Use lowercase letters, numbers and single hyphens only'
      )
      /*
       * The reserved-slug check runs here as well as on the model, so it
       * surfaces as a field error the editor can attach to the slug input
       * rather than as a ValidationError discovered on save. Same function
       * both places, so they cannot disagree about what is reserved.
       *
       * The message names the route that would shadow it. A trip slug is the
       * last segment under a destination, so `/<destination>/<slug>` is the
       * collision — saying "/blog" here would send an admin looking in the
       * wrong place.
       */
      /*
       * Zod 4 takes the message as `error`, which may be a function of the
       * issue — `issue.input` is the offending value. The older
       * `(value) => ({ message })` overload is gone.
       */
      .refine((value) => !isReservedSlug(value), {
        error: (issue) =>
          `"${String(issue.input)}" is a reserved slug — it would shadow the static /${String(issue.input)} route and this page would never be reachable.`,
      }),
    destination: z.string().trim().min(1, 'Choose a destination'),
    /*
     * Empty string means "no activity", which is a real value for India, Tibet
     * and Bhutan — not missing data. It stays a string here and becomes `null`
     * in the route, because Mongoose needs null to clear the reference;
     * `undefined` would leave whatever is already stored in place.
     */
    activity: z.string().trim(),
    /*
     * Required to publish, not required to exist — matching the model. The
     * emptiness check moved to a superRefine below, because it depends on
     * `status`, and a field-level rule cannot see its siblings.
     */
    summary: z.string().trim().max(400),
    answerBlock: z.string().trim().max(2000),
    description: z.string().trim(),
    status: z.enum(PUBLISH_STATUSES),
    featured: z.boolean(),

    // --- facts ---
    durationDays: requiredNumber('Duration', 1, 365),
    difficulty: z
      .string()
      .trim()
      .transform(emptyToUndefined)
      .optional()
      .refine(
        (value) =>
          value === undefined ||
          (TRIP_DIFFICULTIES as readonly string[]).includes(value),
        'Choose one of the listed difficulty grades'
      ),
    bestMonths: z.array(z.enum(MONTHS)),
    /*
     * A Region id, or '' for "no region" — which is the common case, not an
     * edge one. Validated as a string here and turned into an ObjectId or null
     * by the route, exactly like `activity` two fields up.
     */
    region: z.string().trim(),
    maxAltitudeM: optionalNumber('Max altitude', 0, 9000),
    peakName: optionalText(120),
    tripGrade: optionalText(120),
    minGroupSize: requiredNumber('Minimum group size', 1, 100),
    maxGroupSize: requiredNumber('Maximum group size', 1, 100),
    hasElevationProfile: z.boolean(),
    startPoint: z.string().trim().min(1, 'Start point is required').max(200),
    endPoint: z.string().trim().min(1, 'End point is required').max(200),

    // --- pricing ---
    price: requiredNumber('Price', 0, 1_000_000),
    discountedPrice: optionalNumber('Discounted price', 0, 1_000_000),
    priceLabel: optionalText(120),
    groupPricing: z.array(tierSchema).max(20),

    itinerary: z.array(itinerarySchema).max(60),
    /*
     * Blank lines are filtered out rather than rejected. An empty row is what a
     * list editor looks like the moment someone clicks "Add" and then changes
     * their mind, and failing the whole save over it would be hostile.
     */
    includes: z
      .array(listLine)
      .max(60)
      .transform((lines) => lines.filter((line) => line !== '')),
    excludes: z
      .array(listLine)
      .max(60)
      .transform((lines) => lines.filter((line) => line !== '')),
    faqs: z.array(faqSchema).max(40),

    coverImage: z.string().trim().max(300),
    coverImageAlt: z.string().trim().max(300),
    gallery: z.array(gallerySchema).max(40),

    // --- seo ---
    metaTitle: optionalText(200),
    metaDescription: optionalText(400),
    canonicalUrl: optionalText(500),
    ogTitle: optionalText(200),
    ogDescription: optionalText(400),
    ogImage: optionalText(500),
    schemaType: optionalText(80),
    noIndex: z.boolean(),
  })
  /*
   * Cross-field rules live here rather than on individual fields, because a
   * field-level refine cannot see its siblings. Each attaches to the input the
   * admin should go and fix, via `path`.
   */
  .refine((data) => data.maxGroupSize >= data.minGroupSize, {
    message: 'Maximum group size cannot be smaller than the minimum',
    path: ['maxGroupSize'],
  })
  .refine(
    (data) =>
      data.discountedPrice === undefined || data.discountedPrice < data.price,
    {
      message:
        'A discounted price has to be lower than the price — otherwise it is not a discount',
      path: ['discountedPrice'],
    }
  )
  /*
   * The publish gate.
   *
   * These five fields are optional on a draft and mandatory the moment the
   * trip goes live — the same rule the model enforces, repeated here so the
   * failure arrives keyed to a field the editor can highlight rather than as a
   * Mongoose ValidationError discovered after a round trip.
   *
   * The messages say "to publish", not "is required", because the field is
   * genuinely optional in the state the admin was just in. "Summary is
   * required" on a draft that saved fine a minute ago reads as a bug.
   */
  .superRefine((data, ctx) => {
    if (data.status !== 'published') return;

    const gated: [keyof typeof data, string][] = [
      ['summary', 'A summary is required to publish — it is the card and listing teaser'],
      ['answerBlock', 'An answer block is required to publish — it is what the page is extracted from'],
      ['description', 'A description is required to publish'],
      ['coverImage', 'A cover image is required to publish — upload one on the Gallery tab'],
      ['coverImageAlt', 'The cover image needs alt text before this can be published'],
    ];

    for (const [field, message] of gated) {
      if (!data[field]) {
        ctx.addIssue({ code: 'custom', message, path: [field] });
      }
    }
  })
  /*
   * Alt text without an image is harmless; an image without alt text is not,
   * and that holds on a draft too. Checked separately from the publish gate
   * for exactly that reason.
   */
  .superRefine((data, ctx) => {
    if (data.coverImage && !data.coverImageAlt) {
      ctx.addIssue({
        code: 'custom',
        message: 'This image needs alt text',
        path: ['coverImageAlt'],
      });
    }
  })
  /*
   * Tier bounds and overlap.
   *
   * `superRefine` rather than `refine`, because this has to report *which*
   * tier is wrong. A boolean refine can only say "the tiers are invalid", and
   * an admin with twelve tiers then has to find the bad one by eye.
   *
   * The model carries the same rule as a path validator on `groupPricing`,
   * which is the guarantee. This one exists so the message lands on a row.
   */
  .superRefine((data, ctx) => {
    const tiers = data.groupPricing;

    tiers.forEach((tier, index) => {
      if (tier.minPeople > tier.maxPeople) {
        ctx.addIssue({
          code: 'custom',
          message: 'The smallest group size cannot be larger than the largest',
          path: ['groupPricing', index, 'maxPeople'],
        });
      }
    });

    /*
     * Overlap is checked on a sorted copy, and the issue is reported against
     * the row's *original* index — the admin sees the tiers in the order they
     * entered them, so an error pinned to a sorted position would highlight
     * the wrong row.
     */
    const ordered = tiers
      .map((tier, index) => ({ tier, index }))
      .sort((a, b) => a.tier.minPeople - b.tier.minPeople);

    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1].tier;
      const current = ordered[i];

      if (current.tier.minPeople <= previous.maxPeople) {
        ctx.addIssue({
          code: 'custom',
          message: `Overlaps the tier covering ${previous.minPeople}–${previous.maxPeople} people. Group sizes must not be covered by two tiers.`,
          path: ['groupPricing', current.index, 'minPeople'],
        });
      }
    }
  })
  /*
   * The conditional altitude rule.
   *
   * The model enforces this too, via a subdocument validator that reads
   * `this.parent().hasElevationProfile`. It is repeated here for the same
   * reason as the gallery alt text: a Mongoose ValidationError arrives keyed
   * `itinerary.3.maxAltitudeM` but only after a round trip, and only for the
   * first failure Mongoose happens to hit. This reports every missing day at
   * once, before anything is written.
   */
  .superRefine((data, ctx) => {
    if (!data.hasElevationProfile) return;

    data.itinerary.forEach((day, index) => {
      if (day.maxAltitudeM === undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Altitude is required while this trip has an elevation profile',
          path: ['itinerary', index, 'maxAltitudeM'],
        });
      }
    });
  })
  /*
   * Alt text on a per-day image. Same rule as the gallery, same reason: alt
   * text is required on every image before save, so it is required exactly
   * when there is an image to describe.
   */
  .superRefine((data, ctx) => {
    data.itinerary.forEach((day, index) => {
      if (day.image && !day.imageAlt) {
        ctx.addIssue({
          code: 'custom',
          message: 'This image needs alt text before the trip can save',
          path: ['itinerary', index, 'imageAlt'],
        });
      }
    });
  });

/**
 * `z.input` is the shape going in (all strings), `z.output` the shape coming
 * out (numbers parsed, blanks dropped). They are genuinely different types
 * here because of the transforms, and conflating them is how a form ends up
 * typed as if its number inputs hold numbers.
 */
export type AdminTripInput = z.input<typeof adminTripSchema>;
export type AdminTripOutput = z.output<typeof adminTripSchema>;
