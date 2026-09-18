import { revalidatePath } from 'next/cache';

import { connectDB } from './db';
import Trip from '../models/Trip';
import Activity from '../models/Activity';
import Destination from '../models/Destination';
import BlogCategory from '../models/BlogCategory';

/**
 * Which cached pages a content change makes stale.
 *
 * Trip, destination, activity and blog pages are statically generated with ISR,
 * so without an explicit purge an edit is invisible until the revalidate window
 * expires — an hour on this site. A client who changes something, sees it on one
 * screen and not another, concludes the CMS is broken, which is worse than it
 * not updating at all because it looks like data loss.
 *
 * ## Why these functions read the database
 *
 * A destination appears on its own page, on `/destinations`, on the homepage —
 * and in the breadcrumb of every trip beneath it. Renaming one therefore
 * invalidates pages whose URLs are not derivable from the destination alone, so
 * the paths have to be looked up.
 *
 * That is a handful of queries on a write that happens rarely, against a
 * catalogue of a few dozen trips. If the catalogue ever reaches the hundreds,
 * the move is a broader `revalidateTag` rather than enumerating paths — but
 * tagging every read is a cost paid on every render to speed up a write that
 * happens weekly, which is the wrong trade today.
 */

/** Purges each path once. A Set, because these lists legitimately overlap. */
export function revalidateAll(paths: Iterable<string>): string[] {
  const unique = [...new Set(paths)].filter(Boolean);

  for (const path of unique) revalidatePath(path);

  return unique;
}

/**
 * Every public page showing a destination's own content.
 *
 * Takes the slug rather than the document, because a rename needs this called
 * twice — once for where the destination was and once for where it now is.
 * Leaving the old path cached means the destination is served from two URLs at
 * once, which is a duplicate-content problem rather than a stale one.
 */
export async function destinationPaths(
  destinationId: string,
  slug: string,
  hasActivities: boolean
): Promise<string[]> {
  await connectDB();

  const paths = [
    `/${slug}`,
    '/destinations',
    '/trips',
    // The homepage carries destination tiles.
    '/',
  ];

  if (hasActivities) paths.push(`/${slug}/activities`);

  /*
   * Every trip beneath it. A trip page renders its destination's name in the
   * breadcrumb and the hero, so a rename that skipped these would leave the old
   * name on every trip page for an hour.
   */
  const trips = await Trip.find({ destination: destinationId })
    .select('slug activity')
    .populate('activity', 'slug')
    .lean<{ slug: string; activity: { slug: string } | null }[]>()
    .exec();

  for (const trip of trips) {
    paths.push(
      trip.activity
        ? `/${slug}/${trip.activity.slug}/${trip.slug}`
        : `/${slug}/${trip.slug}`
    );
  }

  const activities = await Activity.find({ destination: destinationId })
    .select('slug')
    .lean<{ slug: string }[]>()
    .exec();

  for (const activity of activities) {
    paths.push(`/${slug}/${activity.slug}`);
  }

  return paths;
}

/**
 * Every public page showing an activity's own content.
 *
 * Same shape as above and the same reason for taking slugs: an activity rename
 * moves its page and every trip page beneath it, so both the old and the new
 * sets have to be purged.
 */
export async function activityPaths(
  activityId: string,
  destinationSlug: string,
  activitySlug: string
): Promise<string[]> {
  await connectDB();

  const paths = [
    `/${destinationSlug}/${activitySlug}`,
    `/${destinationSlug}/activities`,
    `/${destinationSlug}`,
    '/trips',
  ];

  const trips = await Trip.find({ activity: activityId })
    .select('slug')
    .lean<{ slug: string }[]>()
    .exec();

  for (const trip of trips) {
    paths.push(`/${destinationSlug}/${activitySlug}/${trip.slug}`);
  }

  return paths;
}

/**
 * A trip's canonical public URL, or null if the trip is gone or unpublished.
 *
 * The destination/activity asymmetry decides the shape: a Nepal trip lives at
 * `/nepal/<activity>/<trip>` and an India one at `/india/<trip>`. Building the
 * path from the destination alone would produce a URL that 404s for three
 * destinations out of four — or, worse, one that resolves for the wrong one,
 * because both routes exist.
 *
 * Null for a draft, deliberately. There is no cached page for a trip that
 * appears nowhere public, so purging a path for it would be a request to
 * regenerate a page that will 404 anyway.
 */
export async function tripCanonicalPath(
  tripId: unknown
): Promise<string | null> {
  await connectDB();

  let trip;

  try {
    trip = await Trip.findById(tripId)
      .select('slug status activity destination')
      .populate('activity', 'slug')
      .populate('destination', 'slug')
      .lean<{
        slug: string;
        status: string;
        activity: { slug: string } | null;
        destination: { slug: string } | null;
      }>()
      .exec();
  } catch {
    // A malformed id throws a CastError rather than returning null.
    return null;
  }

  if (!trip || !trip.destination || trip.status !== 'published') return null;

  return trip.activity
    ? `/${trip.destination.slug}/${trip.activity.slug}/${trip.slug}`
    : `/${trip.destination.slug}/${trip.slug}`;
}

/**
 * Which pages a single FAQ entry appears on.
 *
 * ## The association decides, and there are two cases
 *
 * | destination | renders on |
 * |---|---|
 * | null | `/faq` — the general page |
 * | set  | that destination page |
 *
 * There is no trip case. A trip renders `Trip.faqs`, the embedded array, and
 * nothing else — see the note on `models/Faq.ts` for why the `trip` ref was
 * removed rather than left as a second source nothing read.
 *
 * ## Why the caller has to call this twice
 *
 * These paths are derived from the association, so **changing the association
 * changes the answer** — and the page the entry has just left is exactly the
 * one still serving it from cache. The save route reads the old association
 * before assigning and purges both sets. Purging only the new one leaves the
 * entry visible on the old page for the full revalidate window, which reads as
 * an edit that did not save.
 *
 * A destination page is purged rather than its whole subtree: the FAQ renders
 * on the destination page itself, not on the trips beneath it. Renaming a
 * *destination* is a different operation and `destinationPaths` handles it.
 */
export async function faqPaths(faq: { destination?: unknown }): Promise<string[]> {
  await connectDB();

  if (!faq.destination) return ['/faq'];

  let destination;

  try {
    destination = await Destination.findById(faq.destination)
      .select('slug')
      .lean<{ slug: string }>()
      .exec();
  } catch {
    // A malformed id throws a CastError rather than returning null.
    destination = null;
  }

  return destination ? [`/${destination.slug}`] : [];
}

/**
 * Which pages a testimonial appears on.
 *
 * Today: the homepage, and nothing else. `getPublishedTestimonials` has exactly
 * one caller.
 *
 * The trip association is read anyway and the trip's page purged with it. That
 * is one lookup on a write that happens rarely, and it is the difference
 * between this being correct the day a trip page starts showing its own
 * testimonials and it being a bug found by a client wondering why a quote they
 * added is not there.
 */
export async function testimonialPaths(testimonial: {
  trip?: unknown;
}): Promise<string[]> {
  await connectDB();

  const paths = ['/'];

  if (testimonial.trip) {
    const path = await tripCanonicalPath(testimonial.trip);
    if (path) paths.push(path);
  }

  return paths;
}

/**
 * Which cached pages each SiteSettings field appears on.
 *
 * ## Derived by reading the pages, not assumed
 *
 * Exactly five public pages call `getSiteSettings()` — `/`, `/about`,
 * `/booking-policy`, `/privacy-policy` and `/terms` — and this table was built
 * by listing the fields each one actually reads. That matters because the
 * obvious assumption is wrong in both directions:
 *
 * - **The footer does not read SiteSettings.** Its own comment says the NAP
 *   belongs there, but it currently renders a static link list, so changing the
 *   address does *not* invalidate every page on the site. A blanket
 *   `revalidatePath('/', 'layout')` would regenerate the entire catalogue on
 *   every settings save for no reason.
 * - **Several fields reach pages that never name them**, through
 *   `organizationJsonLd`. `phone` and `socialLinks` are rendered nowhere as
 *   text, but they are in the structured data on `/` and `/about`, and a
 *   `sameAs` that still lists a dead profile is a real problem.
 *
 * So the map is explicit and the JSON-LD dependency is written into it. **When
 * a page starts or stops reading a field, this table has to change with it** —
 * nothing enforces that, which is why the derivation is recorded here rather
 * than left to be re-guessed.
 */
/**
 * The marker for 'this field is on every page'.
 *
 * Not a path. `settingsPaths` maps it to a layout-level purge, which is a
 * different call — see the note there.
 */
export const SITEWIDE = '__sitewide__';

const SETTINGS_FIELD_PAGES: Record<string, string[]> = {
  // Homepage only.
  heroHeadline: ['/'],
  heroSubheading: ['/'],
  heroCtaLabel: ['/'],
  riskReversalText: ['/'],
  officeHours: ['/'],
  valuePropositions: ['/'],

  // Homepage and About.
  contactPersonName: ['/', '/about'],
  contactPersonRole: ['/', '/about'],
  responseTimePromise: ['/', '/about'],
  headlineStats: ['/', '/about'],

  // About only.
  longDescription: ['/about'],
  commitments: ['/about'],
  safetyPolicies: ['/about'],

  // Booking policy only.
  depositPolicyText: ['/booking-policy'],
  cancellationPolicyText: ['/booking-policy'],

  /*
   * NAP and identity. Rendered as text on the legal pages and on About, and
   * carried into Organization JSON-LD on `/` and `/about` — which is why the
   * homepage appears here even though it prints none of these as prose.
   */
  /*
   * The footer renders these on every page, so a change to one is sitewide.
   * It was not always so: the footer used to be a static link list, and wiring
   * it to SiteSettings is what moved these from a four-path list to the whole
   * site. The marker records that dependency explicitly rather than leaving a
   * long enumerated list to drift.
   */
  legalName: [SITEWIDE],
  tradingName: [SITEWIDE],
  shortDescription: ['/', '/about'],
  foundingYear: ['/', '/about'],
  registrationNumber: ['/', '/about'],
  streetAddress: [SITEWIDE],
  addressLocality: [SITEWIDE],
  postalCode: [SITEWIDE],
  addressCountry: [SITEWIDE],
  email: [SITEWIDE],
  phone: [SITEWIDE],

  // Not in the footer — only the legal pages and the JSON-LD.
  addressRegion: ['/', '/about', '/privacy-policy'],

  // JSON-LD only — no page prints this, both pages carry it in markup.
  socialLinks: ['/', '/about'],

  /*
   * Nothing reads this. The WhatsApp link uses `NEXT_PUBLIC_WHATSAPP_NUMBER`
   * instead. Listed with an empty array rather than omitted, so the absence is
   * a recorded fact rather than a gap in the table.
   */
  whatsappNumber: [],

  /*
   * Affiliation registration numbers are not SiteSettings fields, but they are
   * saved by the same screen and they feed `memberOf` identifiers on both
   * pages plus the expanded list on About.
   */
  affiliations: ['/', '/about'],
};

/**
 * The pages made stale by a settings save.
 *
 * Takes the fields that actually changed rather than purging everything every
 * time. Editing the hero headline should not regenerate the privacy policy —
 * not because the cost matters at this size, but because a purge list that is
 * always the same tells whoever reads the response nothing about what happened.
 *
 * ## Why NAP is a layout purge and not a list of paths
 *
 * The footer renders the company name, address, phone and email, and the footer
 * is on every public page. So those fields genuinely do invalidate the whole
 * site, and there are two ways to say so:
 *
 * 1. **Enumerate every path** — every trip, activity, destination, blog post
 *    and category, plus the static pages. That means four collection scans on
 *    every settings save, a list that grows with the catalogue, and a new page
 *    type silently missing from it the day someone adds one.
 * 2. **A layout-level purge** — one call that invalidates the root layout and
 *    every route nested under it.
 *
 * The second, and it is not the blunt instrument it looks like. A blunt purge
 * regenerates pages the change does not affect; here *every* page carries the
 * footer, so every page really is stale. The enumerated list would arrive at
 * the same set by a longer route and be wrong the first time it fell behind
 * the routes.
 *
 * **The cost is real and worth stating**: it discards the whole static
 * catalogue, so the next request for each page regenerates it. On a site of a
 * few dozen pages, for a change that happens a handful of times in the life of
 * the business, that is the right trade. If the catalogue reached the hundreds
 * and the address were edited often — neither of which is true — the answer
 * would be a tagged query behind the footer instead.
 *
 * An unknown field name contributes nothing and is not an error: the caller
 * diffs whole objects, so it can legitimately see a key this table does not
 * describe. Silently ignoring it is right; the alternative is a settings save
 * that fails because a field was added to the model.
 */
export function settingsPaths(changedFields: Iterable<string>): string[] {
  const paths = new Set<string>();

  for (const field of changedFields) {
    for (const path of SETTINGS_FIELD_PAGES[field] ?? []) paths.add(path);
  }

  return [...paths];
}

/**
 * Purges what a settings change made stale, layout-wide where the footer is
 * involved.
 *
 * Separate from `revalidateAll` because the sitewide case is a different call
 * — the 'layout' variant rather than the default 'page' — and folding a magic
 * string into the generic helper would hide that from every other caller.
 *
 * Returns what a person should be told rather than the raw list: the admin
 * screen shows this back, and "every page" is the honest description of a
 * root-layout purge.
 */
export function revalidateSettings(changedFields: Iterable<string>): string[] {
  const targets = settingsPaths(changedFields);

  if (targets.includes(SITEWIDE)) {
    // The root layout and every route nested under it.
    revalidatePath('/', 'layout');

    return ['every page (the footer carries this)'];
  }

  return revalidateAll(targets);
}

/**
 * Every public page that shows a price.
 *
 * Prices are stored in USD and rendered into the static HTML, and the currency
 * switcher converts them **client-side from rates passed down as props** — so
 * the rates a visitor converts with are the ones captured when the page was
 * last generated. A rate change is therefore stale content on every page
 * carrying a price, not just on a listing.
 *
 * Enumerated rather than layout-purged, unlike the footer NAP: prices appear on
 * the trip, destination, activity and listing pages, but not on the legal
 * pages, the blog, /about or /faq. A root-layout purge would regenerate those
 * for nothing, and here the list is derivable in four queries rather than
 * guessed.
 *
 * **Nothing renders a converted price yet.** `getActiveExchangeRates` has no
 * caller — the currency switcher is not built — so today this purges pages that
 * would not change. That is deliberate: the alternative is remembering to add
 * the purge on the day the switcher lands, which is exactly the kind of thing
 * that gets missed and produces "the CMS is broken".
 */
export async function pricePaths(): Promise<string[]> {
  await connectDB();

  const paths = new Set<string>(['/', '/trips', '/destinations']);

  const destinations = await Destination.find()
    .select('slug hasActivities')
    .lean<{ slug: string; hasActivities: boolean }[]>()
    .exec();

  for (const destination of destinations) {
    paths.add(`/${destination.slug}`);
    if (destination.hasActivities) paths.add(`/${destination.slug}/activities`);
  }

  const activities = await Activity.find()
    .select('slug destination')
    .populate('destination', 'slug')
    .lean<{ slug: string; destination: { slug: string } | null }[]>()
    .exec();

  for (const activity of activities) {
    if (activity.destination) {
      paths.add(`/${activity.destination.slug}/${activity.slug}`);
    }
  }

  /*
   * Published trips only. A draft has no cached page, so purging its path is a
   * request to regenerate something that will 404.
   */
  const trips = await Trip.find({ status: 'published' })
    .select('slug activity destination')
    .populate('activity', 'slug')
    .populate('destination', 'slug')
    .lean<
      {
        slug: string;
        activity: { slug: string } | null;
        destination: { slug: string } | null;
      }[]
    >()
    .exec();

  for (const trip of trips) {
    if (!trip.destination) continue;

    paths.add(
      trip.activity
        ? `/${trip.destination.slug}/${trip.activity.slug}/${trip.slug}`
        : `/${trip.destination.slug}/${trip.slug}`
    );
  }

  return [...paths];
}

/**
 * Every public page a blog post appears on.
 *
 * Takes the category id rather than reading it off the post, because a save
 * that **moves** a post between categories has to purge both archives — the one
 * it left is still listing it, and after the assignment there is nothing on the
 * document that names it. Same shape, and the same reason, as `faqPaths`.
 *
 * ## There is no trip page in this list
 *
 * `BlogPost.relatedTrips` points from the post **to** trips, and it renders on
 * the *post* page as "trips this answers a question about". No trip page shows
 * the posts that reference it — `Trip.relatedTrips` is a separate trip-to-trip
 * field, and nothing queries blog posts from a trip route.
 *
 * So editing a post cannot make a trip page stale, and purging one would be a
 * regeneration that changes nothing. If a related-posts section is ever added
 * to the trip page, this is where the reverse lookup belongs.
 *
 * ## Drafts purge too
 *
 * The caller decides. Unlike a trip, a post that goes from published to draft
 * has to purge the listings it was on — that is the whole point of
 * unpublishing, and skipping the purge because the new status is not
 * `published` leaves it on /blog for the revalidate window.
 */
export async function blogPostPaths(options: {
  slug: string;
  categoryId?: unknown;
}): Promise<string[]> {
  await connectDB();

  const paths = [
    `/blog/${options.slug}`,
    '/blog',
    // The homepage carries the three most recent posts.
    '/',
  ];

  if (options.categoryId) {
    let category;

    try {
      category = await BlogCategory.findById(options.categoryId)
        .select('slug')
        .lean<{ slug: string }>()
        .exec();
    } catch {
      // A malformed id throws a CastError rather than returning null.
      category = null;
    }

    if (category) paths.push(`/blog/category/${category.slug}`);
  }

  return paths;
}
