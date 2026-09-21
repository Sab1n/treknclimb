import { connectDB } from '../db';
import Destination from '../../models/Destination';
import Activity from '../../models/Activity';
import Trip from '../../models/Trip';
import BlogPost from '../../models/BlogPost';
import BlogCategory from '../../models/BlogCategory';
import Region from '../../models/Region';

import { PUBLISHED as PUBLISHED_POST } from './blog';
import { getRegionRoutes } from './regions';
import { getSiteSettings } from './settings';
import { getPublishedTeam } from './team';
import { getSitewideFaqs } from './faqs';

import { SITE_URL } from '../jsonLd';
import {
  destinationPath,
  activityPath,
  activitiesListingPath,
  tripPath,
  blogPostPath,
  blogCategoryPath,
} from '../urls';
import { LEGAL_PATHS, legalLastUpdatedAt } from '../legalPages';

/*
 * Side-effect registration. `.populate()` resolves a ref by model *name* at
 * query time, and a model only registers when its module is first imported.
 * `Activity` and `Destination` are imported for their own queries below, which
 * happens to register them — if either direct use is ever removed, leave a
 * bare `import '../../models/Activity';` behind rather than deleting the line,
 * or the populate starts throwing MissingSchemaError depending on what else
 * the build happened to import first.
 */

/**
 * Everything the sitemap lists, as site-relative paths.
 *
 * ## Why this is a query module and not the route file
 *
 * `app/sitemap.ts` has one job — turn this into the shape Next serialises. The
 * rules about *what belongs in a sitemap* are the part that can be wrong, and
 * they are the part worth reading in one place: three exclusions, each of
 * which fails silently in a different direction.
 *
 * ## The three exclusions
 *
 * 1. **Unpublished.** Drafts and archived records are not pages. Blog posts
 *    additionally need a `publishedAt`, because the blog filters on both and a
 *    sitemap entry the page refuses to render is a 404 we invited a crawler to
 *    walk into. That filter is imported rather than retyped for exactly that
 *    reason.
 * 2. **`noIndex`.** The page already emits `robots: { index: false }` for
 *    these. Listing a URL in a sitemap while telling the crawler not to index
 *    it is a contradiction, and the sitemap is the weaker of the two signals —
 *    so it wastes crawl budget and says nothing.
 * 3. **A `canonicalUrl` override pointing somewhere else.** Inclusion in a
 *    sitemap is itself a canonical hint. A record whose SEO tab says "the real
 *    version of this is over there" must not also nominate itself, or the two
 *    signals disagree and Google picks for us.
 *
 * ## What is not excluded, deliberately
 *
 * A trip under a `noIndex` activity is still listed. `noIndex` is set per
 * record and nothing in the model says it cascades — a destination might be
 * held back from the index while its trips rank perfectly well. Cascading is a
 * content decision, not an obvious default, so it is left to be asked rather
 * than assumed.
 */
export interface SitemapRoute {
  /** Site-relative, always beginning with `/`. */
  path: string;
  /**
   * Omitted rather than defaulted when nothing real is known.
   *
   * `new Date()` would be the easy fallback and it is a lie: it tells a
   * crawler every page changed on every deploy, which is how a sitemap stops
   * being believed. An absent `<lastmod>` is a fact about our knowledge; a
   * wrong one is a claim about the page.
   */
  lastModified?: Date;
}

/**
 * The shared SEO columns every indexable model carries, as they come back from
 * a projection.
 *
 * `noIndex` is declared optional here even though the schema gives it
 * `default: false`, because a document written before the field existed has no
 * value at all — see the filter below.
 */
interface SeoRow {
  slug: string;
  noIndex?: boolean;
  canonicalUrl?: string;
  updatedAt: Date;
}

interface DestinationRow extends SeoRow {
  hasActivities: boolean;
}

interface ActivityRow extends SeoRow {
  destination: { slug: string } | null;
}

interface RegionRow extends SeoRow {
  destination: { slug: string } | null;
}

interface TripRow extends SeoRow {
  destination: { slug: string } | null;
  activity: { slug: string } | null;
}

/**
 * `{ $ne: true }` rather than `{ noIndex: false }`.
 *
 * The two are not the same query. `noIndex: false` matches only documents that
 * actually store `false`; a document saved before the SEO field set was added
 * has no `noIndex` key, and Mongoose's `default` fills it in on *write*, not
 * retroactively. `$ne: true` matches false, missing and null alike, which is
 * the question being asked — "has nobody said not to index this".
 */
const INDEXABLE = { noIndex: { $ne: true } } as const;

/**
 * Does this record's canonical override point away from its own URL?
 *
 * Trailing slashes are normalised because `canonicalUrl` is free text an admin
 * typed, and `https://treknclimb.com/nepal/` naming its own page should not
 * read as pointing elsewhere.
 */
function pointsElsewhere(
  canonicalUrl: string | undefined,
  path: string
): boolean {
  if (!canonicalUrl) return false;

  const strip = (url: string) => url.trim().replace(/\/+$/, '');

  return strip(canonicalUrl) !== strip(`${SITE_URL}${path}`);
}

/** The most recent of a set of timestamps, or undefined if there are none. */
function newest(dates: (Date | null | undefined)[]): Date | undefined {
  const times = dates
    .filter((date): date is Date => date instanceof Date)
    .map((date) => date.getTime());

  return times.length ? new Date(Math.max(...times)) : undefined;
}

/**
 * Every indexable URL on the site, in the order a person would read them.
 *
 * One pass, all reads issued together. At this catalogue size — four
 * destinations, a handful of activities, tens of trips — the whole sitemap is
 * a few hundred URLs, well under the 50,000 URL / 50MB limit at which Next's
 * `generateSitemaps` and a sitemap index would become necessary.
 */
export async function getSitemapRoutes(): Promise<SitemapRoute[]> {
  await connectDB();

  const [
    destinations,
    activities,
    trips,
    posts,
    categories,
    settings,
    team,
    faqs,
    regions,
    regionRoutes,
  ] = await Promise.all([
    Destination.find(INDEXABLE)
      .select('slug noIndex canonicalUrl updatedAt hasActivities')
      .sort({ displayOrder: 1, name: 1 })
      .lean<DestinationRow[]>()
      .exec(),

    Activity.find(INDEXABLE)
      .select('slug noIndex canonicalUrl updatedAt destination')
      .sort({ displayOrder: 1, name: 1 })
      .populate('destination', 'slug')
      .lean<ActivityRow[]>()
      .exec(),

    Trip.find({ status: 'published', ...INDEXABLE })
      .select('slug noIndex canonicalUrl updatedAt destination activity')
      .sort({ displayOrder: 1, title: 1 })
      .populate('destination', 'slug')
      .populate('activity', 'slug')
      .lean<TripRow[]>()
      .exec(),

    BlogPost.find({ ...PUBLISHED_POST, ...INDEXABLE })
      .select('slug noIndex canonicalUrl updatedAt')
      .sort({ publishedAt: -1 })
      .lean<SeoRow[]>()
      .exec(),

    BlogCategory.find(INDEXABLE)
      .select('slug noIndex canonicalUrl updatedAt')
      .sort({ displayOrder: 1, name: 1 })
      .lean<SeoRow[]>()
      .exec(),

    getSiteSettings(),
    getPublishedTeam(),
    getSitewideFaqs(),

    Region.find(INDEXABLE)
      .select('slug noIndex canonicalUrl updatedAt destination')
      .sort({ displayOrder: 1, name: 1 })
      .populate('destination', 'slug')
      .lean<RegionRow[]>()
      .exec(),

    /*
     * Which region pages exist is decided by the trips, not by the region
     * records — the same rule the routes follow. `getRegionRoutes()` returns
     * only (destination, activity, region) triples that have a published trip,
     * so a region with nothing in it stays out of the sitemap even though the
     * route would still render it. Advertising an empty page is the thin
     * content this avoids.
     */
    getRegionRoutes(),
  ]);

  /**
   * Builds a route from a record, or returns null if its own SEO fields say it
   * should not be listed. `noIndex` is already filtered in the query; the
   * canonical check cannot be, because it compares against a URL that only
   * exists once the path has been built.
   */
  const route = (row: SeoRow, path: string): SitemapRoute | null =>
    pointsElsewhere(row.canonicalUrl, path)
      ? null
      : { path, lastModified: row.updatedAt };

  const routes: (SitemapRoute | null)[] = [];

  /* ------------------------------------------------------------------ *
   * Static pages
   *
   * These have no record, so `lastModified` is derived from whatever the
   * page actually renders: the homepage and /contact are SiteSettings,
   * /destinations is the destinations, /trips is the trips. Where a page
   * renders nothing from the database, the date is left off.
   * ------------------------------------------------------------------ */

  routes.push(
    { path: '/', lastModified: settings?.updatedAt },
    {
      path: '/destinations',
      lastModified: newest(destinations.map((d) => d.updatedAt)),
    },
    { path: '/trips', lastModified: newest(trips.map((t) => t.updatedAt)) },
    { path: '/blog', lastModified: newest(posts.map((p) => p.updatedAt)) },
    {
      path: '/about',
      lastModified: newest([
        settings?.updatedAt,
        ...team.map((member) => member.updatedAt),
      ]),
    },
    { path: '/faq', lastModified: newest(faqs.map((faq) => faq.updatedAt)) },
    { path: '/contact', lastModified: settings?.updatedAt }
  );

  /* ------------------------------------------------------------------ *
   * Destinations and their activity listings
   * ------------------------------------------------------------------ */

  for (const destination of destinations) {
    routes.push(route(destination, destinationPath(destination)));

    /*
     * `/nepal/activities` exists only where there is an activity layer. It is
     * a static segment with no record of its own, so it takes the newest of
     * the destination and the activities it lists — which is what the page is
     * made of: that destination's `activitiesIntro` plus its activity cards.
     */
    if (!destination.hasActivities) continue;

    const under = activities.filter(
      (activity) => activity.destination?.slug === destination.slug
    );

    routes.push({
      path: activitiesListingPath(destination),
      lastModified: newest([
        destination.updatedAt,
        ...under.map((activity) => activity.updatedAt),
      ]),
    });
  }

  /* ------------------------------------------------------------------ *
   * Activities
   * ------------------------------------------------------------------ */

  for (const activity of activities) {
    /*
     * A broken `destination` ref leaves nothing to build a URL from, and the
     * activity page would 404 on the same missing parent. Skipped rather than
     * guessed at.
     */
    if (!activity.destination) continue;

    routes.push(route(activity, activityPath(activity, activity.destination)));
  }

  /* ------------------------------------------------------------------ *
   * Regions
   *
   * One URL per (activity, region) pair that has trips, so the Everest
   * region contributes a trekking page and, once a peak climb is filed
   * there, a peak-climbing one. `lastModified` comes from the region
   * record; both pages share it, because both render its copy.
   * ------------------------------------------------------------------ */

  const regionBySlug = new Map(regions.map((region) => [region.slug, region]));

  for (const pair of regionRoutes) {
    const region = regionBySlug.get(pair.regionSlug);

    // Absent means the region is `noIndex`, which the query already filtered
    // out — so the page exists but must not be advertised.
    if (!region) continue;

    const path = `/${pair.destinationSlug}/${pair.activitySlug}/region/${pair.regionSlug}`;

    routes.push(route(region, path));
  }

  /* ------------------------------------------------------------------ *
   * Trips
   *
   * `tripPath()` resolves the Nepal asymmetry — a trip with an activity
   * sits one level deeper than one without — so the two URL shapes are
   * not special-cased here. It is also what the trip page emits as its
   * canonical, so the sitemap and the canonical tag agree by
   * construction rather than by both happening to be written correctly.
   * ------------------------------------------------------------------ */

  for (const trip of trips) {
    if (!trip.destination) continue;

    routes.push(
      route(trip, tripPath({ ...trip, destination: trip.destination }))
    );
  }

  /* ------------------------------------------------------------------ *
   * Blog
   * ------------------------------------------------------------------ */

  for (const post of posts) routes.push(route(post, blogPostPath(post)));

  for (const category of categories) {
    routes.push(route(category, blogCategoryPath(category)));
  }

  /* ------------------------------------------------------------------ *
   * Legal
   *
   * The only pages whose date is authored rather than derived, because
   * their text lives in the page file. See `lib/legalPages.ts`.
   * ------------------------------------------------------------------ */

  for (const path of LEGAL_PATHS) {
    routes.push({ path, lastModified: legalLastUpdatedAt(path) });
  }

  /*
   * `(entry): entry is SitemapRoute => entry !== null` is a **type
   * predicate**. Without it TypeScript keeps the result as
   * `(SitemapRoute | null)[]` — it cannot tell that a filter removed the
   * nulls, because `filter` is just a function as far as the compiler is
   * concerned. The predicate is how you tell it what the function proved.
   */
  return routes.filter((entry): entry is SitemapRoute => entry !== null);
}
