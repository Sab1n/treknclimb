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
  // Same shape as 'activities': not a top-level route, but /blog/category is a
  // static segment sitting beside /blog/[slug]. A post slugged 'category'
  // would build a page at /blog/category that the archive route wins, and the
  // post would silently never serve.
  'category',
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
 * Builds a Mongoose validator for a slug path:
 *
 *   slug: { ..., validate: reservedSlugValidator('/blog') }
 *
 * A path validator rather than a hook, so the error attaches to the `slug`
 * field and the admin editor can render it against the right input.
 *
 * **`routePrefix` is what the slug sits under, and it is why this is a factory
 * rather than a constant.** The models using this live at four different
 * depths, and a message that named `/category` when the collision is actually
 * at `/blog/category` sends an admin looking for a root-level route that does
 * not exist. Naming the real path is the entire value of the message — the
 * failure it describes is invisible otherwise.
 *
 * Pass the literal prefix where it is static (`/blog`, `/blog/category`) and a
 * placeholder where the parent segment is dynamic (`/<destination>`), so the
 * message reads as a route shape rather than a specific URL.
 */
export function reservedSlugValidator(routePrefix = '') {
  return {
    validator: (value: string) => !isReservedSlug(value),
    message: ({ value }: { value: string }) =>
      `"${value}" is a reserved slug — it would shadow the static ${routePrefix}/${value} route and the page would never be reachable.`,
  };
}
