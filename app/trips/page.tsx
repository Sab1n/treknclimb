import Link from 'next/link';
import type { Metadata } from 'next';

import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import AffiliationStrip from '../../components/layout/AffiliationStrip';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import TripCard from '../../components/content/TripCard';
import TripsExplorer, {
  type TripListItem,
} from '../../components/content/TripsExplorer';
import type {
  TripFacets,
  FacetOption,
} from '../../components/content/TripFilters';

import { getAllPublishedTrips } from '../../lib/queries/trips';
import { toTripFilterMeta } from '../../types/dto';
import { tripPath } from '../../lib/urls';
import { TRIP_DIFFICULTIES } from '../../models/Trip';

const SITE_URL = 'https://treknclimb.com';

/**
 * The full trip listing.
 *
 * **This page is statically generated, and the filtering happens in the
 * browser.** The alternative — reading `searchParams` on the server and
 * filtering in MongoDB — would opt the route out of static generation
 * entirely, because a page that reads `searchParams` must be rendered per
 * request. Three things decided it:
 *
 * 1. Only the unfiltered `/trips` is ever meant to be indexed, and filter
 *    combinations must never become indexable URLs. With client-side
 *    filtering there is exactly one document and one canonical, so a filtered
 *    URL *cannot* become a separate page. Server-side filtering would mean
 *    emitting the right canonical and noindex on every combination and
 *    trusting that to stay correct forever.
 * 2. Crawlers that do not run JavaScript still need the catalogue. The static
 *    HTML contains every card, because the explorer's initial state is
 *    unfiltered.
 * 3. The catalogue is small. Filtering a few dozen trips in the browser is
 *    free; the whole set is already on the page.
 *
 * This flips if the catalogue reaches the point where shipping every trip is
 * wasteful — a few hundred, not a few dozen. At that point `/trips` becomes
 * dynamic, filtering moves into MongoDB, and the canonical and noindex tags
 * have to be handled explicitly.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'All trips — treks, peak climbs and tours',
  description:
    'Every trip we run across Nepal, India, Tibet and Bhutan. Filter by destination, activity, duration, grade and price.',
  // Filtered views are the same document with a different query string, so this
  // canonical is correct for all of them by construction.
  alternates: { canonical: `${SITE_URL}/trips` },
  openGraph: {
    title: 'All trips — treks, peak climbs and tours',
    description:
      'Every trip we run across Nepal, India, Tibet and Bhutan. Filter by destination, activity, duration, grade and price.',
    url: `${SITE_URL}/trips`,
    type: 'website',
  },
};

export default async function TripsPage() {
  const trips = await getAllPublishedTrips();

  /* ---------------- facets, counted from the real catalogue ---------------- */

  const destinationCounts = new Map<string, FacetOption>();
  const activityCounts = new Map<string, Map<string, FacetOption>>();
  const difficultyCounts = new Map<string, number>();

  for (const trip of trips) {
    const destination = trip.destination;

    const existing = destinationCounts.get(destination.slug);
    if (existing) {
      existing.count += 1;
    } else {
      destinationCounts.set(destination.slug, {
        value: destination.slug,
        label: destination.name,
        count: 1,
      });
    }

    // Activity facets are grouped by destination, so the filter UI can offer
    // them only for a destination that actually has the layer.
    if (trip.activity) {
      if (!activityCounts.has(destination.slug)) {
        activityCounts.set(destination.slug, new Map());
      }

      const group = activityCounts.get(destination.slug)!;
      const current = group.get(trip.activity.slug);

      if (current) {
        current.count += 1;
      } else {
        group.set(trip.activity.slug, {
          value: trip.activity.slug,
          label: trip.activity.name,
          count: 1,
        });
      }
    }

    if (trip.difficulty) {
      difficultyCounts.set(
        trip.difficulty,
        (difficultyCounts.get(trip.difficulty) ?? 0) + 1
      );
    }
  }

  const facets: TripFacets = {
    destinations: [...destinationCounts.values()],
    activitiesByDestination: Object.fromEntries(
      [...activityCounts.entries()].map(([slug, group]) => [
        slug,
        [...group.values()],
      ])
    ),
    // Ordered easiest to hardest rather than by count, and only grades that
    // actually occur — an empty filter option is a dead end.
    difficulties: TRIP_DIFFICULTIES.filter((grade) =>
      difficultyCounts.has(grade)
    ).map((grade) => ({
      value: grade,
      label: grade,
      count: difficultyCounts.get(grade) ?? 0,
    })),
  };

  /*
   * Each card is rendered here, on the server, and handed to the client
   * explorer as a React node alongside the small amount of metadata the
   * filters read. TripCard stays a Server Component.
   */
  const items: TripListItem[] = trips.map((trip) => ({
    meta: toTripFilterMeta(trip),
    card: <TripCard trip={trip} />,
  }));

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'All trips',
    numberOfItems: trips.length,
    itemListElement: trips.map((trip, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${tripPath(trip)}`,
      name: trip.title,
    })),
  };

  return (
    <>
      <Header />

      <main className="flex-1">
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <Breadcrumbs
              crumbs={[{ label: 'Home', href: '/' }, { label: 'All trips' }]}
            />

            <h1 className="mt-6 font-display text-4xl font-extrabold tracking-display sm:text-5xl">
              All trips
            </h1>

            <p className="mt-4 max-w-prose text-base leading-relaxed text-paper/80 sm:text-lg">
              {trips.length} routes across Nepal, India, Tibet and Bhutan.
              Filter by what actually constrains you — days available, altitude
              tolerance and budget.
            </p>
          </div>
        </section>

        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            {trips.length > 0 ? (
              <TripsExplorer items={items} facets={facets} />
            ) : (
              <div className="rounded-lg border border-dashed border-hairline bg-white p-8 text-center sm:p-12">
                <h2 className="font-display text-xl font-extrabold tracking-display">
                  No trips published yet
                </h2>
                <p className="mx-auto mt-3 max-w-prose text-muted">
                  The itineraries are being written up now. Tell us your dates
                  and we will send a plan built around them.
                </p>
                <Link
                  href="/contact"
                  className="mt-6 inline-block rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
                >
                  Get a quote
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Too many options?
                </h2>
                <p className="mt-3 max-w-prose text-paper/80">
                  Send your dates and how much walking you have done, and we
                  will shortlist two that fit.
                </p>

                <div className="mt-6">
                  <Link
                    href="/contact"
                    className="inline-block rounded-full bg-marigold px-6 py-3 font-semibold text-ink transition-opacity hover:opacity-90"
                  >
                    Get my free itinerary
                  </Link>
                </div>

                <p className="mt-3 text-sm text-paper/60">
                  No payment now. Deposit only after you approve the plan.
                </p>
              </div>

              <div className="lg:justify-self-end">
                <AffiliationStrip variant="dark" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {/* Unfiltered view only — the filtered views are this same document. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
    </>
  );
}
