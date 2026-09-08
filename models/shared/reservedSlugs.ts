/**
 * Slugs that would shadow a static route.
 *
 * `/[destination]` sits at the app root and matches any single-segment path.
 * Next.js resolves static segments before dynamic ones, so a destination
 * slugged `blog` would build a page at `/blog` that is permanently
 * unreachable — the static `/blog` route wins and the record silently
 * disappears from the site. Nothing about that failure looks like an error:
 * the document saves, the build succeeds, the page just never serves.
 *
 * Slugs are editable in the admin, so this has to be enforced at save time
 * rather than assumed.
 *
 * Lives in `shared/` because every slugged model has the same exposure and
 * attaches the same validator: Destination, Activity, Trip, BlogPost and
 * BlogCategory.
 */
export const RESERVED_SLUGS = [
  'destinations',
  // Not a top-level route, but /[destination]/activities is — an activity
  // slugged 'activities' would shadow its own listing page.
  'activities',
  'trips',
  'blog',
  'about',
  'contact',
  'faq',
  'admin',
  'api',
  'privacy-policy',
  'terms',
  'booking-policy',
] as const;

export type ReservedSlug = (typeof RESERVED_SLUGS)[number];

/**
 * Compares case-insensitively and after trimming, because Mongoose's
 * `lowercase: true` and `trim: true` run as setters — and a validator can see
 * a value before another model has applied the same normalisation.
 */
export function isReservedSlug(value: string): boolean {
  const normalised = value.trim().toLowerCase();

  return (RESERVED_SLUGS as readonly string[]).includes(normalised);
}

/**
 * Drop-in Mongoose validator for a slug path:
 *
 *   slug: { type: String, required: true, validate: reservedSlugValidator }
 *
 * A path validator rather than a hook, so the error attaches to the `slug`
 * field and the admin editor can render it against the right input.
 */
export const reservedSlugValidator = {
  validator: (value: string) => !isReservedSlug(value),
  message: ({ value }: { value: string }) =>
    `"${value}" is a reserved slug — it would shadow the static /${value} route and the page would never be reachable.`,
};
