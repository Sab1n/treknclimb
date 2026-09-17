import { revalidatePath } from 'next/cache';

import { connectDB } from './db';
import Trip from '../models/Trip';
import Activity from '../models/Activity';
import Destination from '../models/Destination';

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
  legalName: ['/', '/about', '/privacy-policy', '/terms'],
  tradingName: ['/', '/about'],
  shortDescription: ['/', '/about'],
  foundingYear: ['/', '/about'],
  registrationNumber: ['/', '/about'],
  streetAddress: ['/', '/about', '/privacy-policy'],
  addressLocality: ['/', '/about', '/privacy-policy'],
  addressRegion: ['/', '/about', '/privacy-policy'],
  postalCode: ['/', '/about', '/privacy-policy'],
  addressCountry: ['/', '/about', '/privacy-policy'],
  email: ['/', '/about', '/booking-policy', '/privacy-policy', '/terms'],

  // JSON-LD only — no page prints these, both pages carry them in markup.
  phone: ['/', '/about'],
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
 * Takes the fields that actually changed rather than purging all five every
 * time. Editing the hero headline should not regenerate the privacy policy —
 * not because the cost matters at this size, but because a purge list that is
 * always the same tells whoever reads the response nothing about what happened.
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
