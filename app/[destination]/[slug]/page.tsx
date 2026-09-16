import { redirectOrNotFound } from '../../../lib/redirects';
import type { Metadata } from 'next';

import TripDetail from '../../../components/content/TripDetail';
import ActivityDetail from '../../../components/content/ActivityDetail';
import {
  getTripBySlugCached,
  getPublishedTripRoutes,
  getRelatedTrips,
} from '../../../lib/queries/trips';
import {
  getActivityBySlug,
  getTripsByActivity,
  getActivityRoutes,
} from '../../../lib/queries/activities';
import { getDestinationBySlug } from '../../../lib/queries/destinations';
import { buildTripMetadata } from '../../../lib/tripMetadata';

const SITE_URL = 'https://treknclimb.com';

/**
 * Level 2 under a destination. What this segment means depends on the
 * asymmetry, and the page branches on `destination.hasActivities`:
 *
 *   /nepal/trekking            destination WITH activities    -> an ACTIVITY
 *   /india/markha-valley-trek  destination WITHOUT activities -> a TRIP
 *
 * The folder is named `[slug]` rather than `[activity]` or `[trip]` because
 * Next.js rejects two differently-named dynamic segments at the same depth
 * ("Ambiguous app routes detected"), so one folder has to serve both. See the
 * URL architecture section of CLAUDE.md — the generic name is deliberate.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  const [activityRoutes, tripRoutes] = await Promise.all([
    getActivityRoutes(),
    getPublishedTripRoutes(),
  ]);

  return [
    // Activity pages, for destinations with the layer.
    ...activityRoutes.map((route) => ({
      destination: route.destinationSlug,
      slug: route.activitySlug,
    })),
    // Trip pages, for destinations without it.
    ...tripRoutes
      .filter((route) => route.activitySlug === null)
      .map((route) => ({
        destination: route.destinationSlug,
        slug: route.tripSlug,
      })),
  ];
}

type Params = Promise<{ destination: string; slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { destination: destinationSlug, slug } = await params;

  const destination = await getDestinationBySlug(destinationSlug);
  if (!destination) return {};

  if (destination.hasActivities) {
    const activity = await getActivityBySlug(slug);

    if (!activity || activity.destination.slug !== destinationSlug) return {};

    const title =
      activity.metaTitle || `${activity.name} in ${destination.name}`;
    const description = activity.metaDescription || activity.description;
    const url = `${SITE_URL}/${destinationSlug}/${activity.slug}`;

    return {
      title,
      description,
      alternates: { canonical: activity.canonicalUrl || url },
      robots: activity.noIndex ? { index: false, follow: true } : undefined,
      openGraph: {
        title: activity.ogTitle || title,
        description: activity.ogDescription || description,
        url,
        type: 'website',
      },
    };
  }

  const trip = await getTripBySlugCached(slug);

  return trip ? buildTripMetadata(trip) : {};
}

export default async function DestinationChildPage({
  params,
}: {
  params: Params;
}) {
  const { destination: destinationSlug, slug } = await params;

  const path = `/${destinationSlug}/${slug}`;

  const destination = await getDestinationBySlug(destinationSlug);
  // Either 301s to wherever this path moved, or 404s. Never returns.
  if (!destination) return redirectOrNotFound(path);

  /* ---------------- activity branch (Nepal) ---------------- */
  if (destination.hasActivities) {
    const activity = await getActivityBySlug(slug);

    // The activity has to actually belong to this destination, or
    // /india/trekking would render Nepal's trekking page.
    if (!activity || activity.destination.slug !== destinationSlug) {
      return redirectOrNotFound(path);
    }

    const trips = await getTripsByActivity(activity._id);

    return <ActivityDetail activity={activity} trips={trips} />;
  }

  /* ---------------- trip branch (everywhere else) ---------------- */
  const trip = await getTripBySlugCached(slug);

  // A trip with an activity has its canonical home one level deeper, so it must
  // not also answer here.
  /*
   * A renamed trip reaches the redirect here. The mismatch cases — wrong
   * destination, or a Nepal trip asking to be served one level up — are checked
   * the same way: a `Redirects` row may legitimately point at the canonical
   * URL, and if none exists this 404s exactly as before.
   */
  if (!trip || trip.destination.slug !== destinationSlug || trip.activity) {
    return redirectOrNotFound(path);
  }

  const related = await getRelatedTrips(trip);

  return <TripDetail trip={trip} related={related} />;
}
