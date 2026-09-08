import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import TripDetail from '../../../../components/content/TripDetail';
import {
  getTripBySlugCached,
  getPublishedTripRoutes,
  getRelatedTrips,
} from '../../../../lib/queries/trips';
import { buildTripMetadata } from '../../../../lib/tripMetadata';

/**
 * Trip detail for destinations WITH an activity layer — Nepal today.
 * URL shape: /nepal/trekking/everest-base-camp-trek
 *
 * The middle segment is named `[slug]`, not `[activity]`, and that is forced
 * rather than chosen. Next.js rejects two differently-named dynamic segments at
 * the same depth with "Ambiguous app routes detected", so the level-2 folder
 * has to carry one name for both the activity pages (Nepal) and the trip pages
 * (everywhere else). `[slug]` is the honest name for a segment that means two
 * different things depending on `destination.hasActivities`.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  const routes = await getPublishedTripRoutes();

  return routes
    .filter((route) => route.activitySlug !== null)
    .map((route) => ({
      destination: route.destinationSlug,
      slug: route.activitySlug as string,
      trip: route.tripSlug,
    }));
}

type Params = Promise<{ destination: string; slug: string; trip: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { trip: tripSlug } = await params;
  const trip = await getTripBySlugCached(tripSlug);

  return trip ? buildTripMetadata(trip) : {};
}

export default async function NepalTripPage({ params }: { params: Params }) {
  const { destination, slug, trip: tripSlug } = await params;
  const trip = await getTripBySlugCached(tripSlug);

  // The URL has to match the trip's real place in the hierarchy, or the same
  // document would be reachable at several addresses and split its own ranking.
  if (
    !trip ||
    trip.destination.slug !== destination ||
    !trip.activity ||
    trip.activity.slug !== slug
  ) {
    notFound();
  }

  const related = await getRelatedTrips(trip);

  return <TripDetail trip={trip} related={related} />;
}
