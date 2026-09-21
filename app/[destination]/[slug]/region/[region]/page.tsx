import type { Metadata } from 'next';

import { redirectOrNotFound } from '../../../../../lib/redirects';
import RegionDetail from '../../../../../components/content/RegionDetail';
import {
  getRegionBySlug,
  getTripsByRegionAndActivity,
  getRegionsForActivity,
  getRegionRoutes,
} from '../../../../../lib/queries/regions';
import { getActivityBySlug } from '../../../../../lib/queries/activities';
import { getDestinationBySlug } from '../../../../../lib/queries/destinations';
import { SITE_URL } from '../../../../../lib/jsonLd';

/**
 * `/<destination>/<activity>/region/<region>` — a region listing.
 *
 * ## Why `region` is a static segment
 *
 * Without it the route would be `/nepal/trekking/[region]`, which is **the same
 * depth as `/nepal/trekking/[trip]`**. Next.js rejects two differently-named
 * dynamic segments at one depth outright ("Ambiguous app routes detected"), and
 * even if it did not, region slugs and trip slugs would share a single
 * namespace — a region called `everest-base-camp` would collide with the trek
 * of that name, and which one served would depend on nothing a person could
 * see.
 *
 * The extra segment separates them by construction rather than by a uniqueness
 * rule spanning two collections that nothing enforces. Its cost is one reserved
 * slug: `region` is in `RESERVED_SLUGS`, so no trip can take it.
 *
 * ## Four checks before rendering
 *
 * Each closes a different way of serving the wrong page:
 *
 * 1. the destination exists,
 * 2. it has an activity layer — `/india/trekking/region/x` must not resolve,
 * 3. the activity exists **and belongs to this destination**,
 * 4. the region exists **and belongs to this destination** — otherwise
 *    `/india/.../region/annapurna` would render Nepal's Annapurna page, which
 *    is duplicate content rather than a cosmetic error.
 *
 * Each failure goes through `redirectOrNotFound`, so a renamed record 301s to
 * where it moved instead of 404ing.
 */
export const revalidate = 3600;

/**
 * Only pairs that have published trips.
 *
 * Derived from the trips, never from a list of activity slugs — see
 * `lib/queries/regions.ts`. A valid pair with no published trips is still
 * *reachable*: `dynamicParams` defaults to true, so the route renders it on
 * demand with an empty state. That is what an admin who has just created a
 * region needs to see, and it is not in the sitemap, so nothing sends a
 * stranger to it.
 */
export async function generateStaticParams() {
  const routes = await getRegionRoutes();

  return routes.map((route) => ({
    destination: route.destinationSlug,
    slug: route.activitySlug,
    region: route.regionSlug,
  }));
}

type Params = Promise<{ destination: string; slug: string; region: string }>;

/** Resolves and validates all three records, or returns null. */
async function resolve(params: Params) {
  const { destination: destinationSlug, slug: activitySlug, region: regionSlug } =
    await params;

  const destination = await getDestinationBySlug(destinationSlug);

  // A destination with no activity layer has no URL of this shape at all.
  if (!destination || !destination.hasActivities) return null;

  const [activity, region] = await Promise.all([
    getActivityBySlug(activitySlug),
    getRegionBySlug(regionSlug),
  ]);

  if (!activity || activity.destination.slug !== destinationSlug) return null;
  if (!region || region.destination.slug !== destinationSlug) return null;

  return { destination, activity, region };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const resolved = await resolve(params);

  if (!resolved) return {};

  const { activity, region } = resolved;
  const destination = region.destination;

  /*
   * A region page with no published trips is thin content: a heading, a
   * paragraph of region copy, and an empty state. It is reachable on purpose —
   * an admin who has just created Langtang needs to see it — but it must not be
   * offered to a search engine.
   *
   * `cache()` on the query means this read is shared with the page body below
   * rather than being a second round trip.
   */
  const trips = await getTripsByRegionAndActivity(region._id, activity._id);
  const isThin = trips.length === 0;

  /*
   * The fallback title names all three levels, because "Annapurna" alone is
   * ambiguous in a search result and the page has to say what kind of trips it
   * lists. `metaTitle` overrides it when the admin writes one — but a region
   * record is shared by every activity rendering it, so an override applies to
   * all of them. Noted rather than solved: per-activity SEO overrides would
   * mean a second collection keyed on the pair, which is a lot of machinery for
   * a field nobody has asked to vary yet.
   */
  const title =
    region.metaTitle ||
    `${activity.name} in ${region.name}, ${destination.name}`;

  const description = region.metaDescription || region.description;
  const url = `${SITE_URL}/${destination.slug}/${activity.slug}/region/${region.slug}`;

  return {
    title,
    description,
    alternates: { canonical: region.canonicalUrl || url },
    /*
     * `follow: true` in both cases. Noindex says "do not list this page"; it is
     * not a reason to stop a crawler following the links on it to the activity
     * page and the other regions, which are pages we do want indexed.
     */
    robots:
      region.noIndex || isThin ? { index: false, follow: true } : undefined,
    openGraph: {
      title: region.ogTitle || title,
      description: region.ogDescription || description,
      url,
      type: 'website',
    },
  };
}

export default async function RegionPage({ params }: { params: Params }) {
  const { destination: destinationSlug, slug: activitySlug, region: regionSlug } =
    await params;

  const path = `/${destinationSlug}/${activitySlug}/region/${regionSlug}`;

  const resolved = await resolve(params);

  // Either 301s to wherever this path moved, or 404s. Never returns.
  if (!resolved) return redirectOrNotFound(path);

  const { activity, region } = resolved;

  const [trips, regionsHere] = await Promise.all([
    // Already resolved during generateMetadata; cache() makes this free.
    getTripsByRegionAndActivity(region._id, activity._id),
    getRegionsForActivity(activity.destination._id, activity._id),
  ]);

  const siblings = regionsHere
    .filter((other) => other.slug !== region.slug)
    .map((other) => ({
      slug: other.slug,
      name: other.name,
      tripCount: other.tripCount,
    }));

  return (
    <RegionDetail
      region={region}
      activity={activity}
      trips={trips}
      siblings={siblings}
    />
  );
}
