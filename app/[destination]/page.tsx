import Link from 'next/link';
import type { Metadata } from 'next';
import { redirectOrNotFound } from '../../lib/redirects';

import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import AffiliationStrip from '../../components/layout/AffiliationStrip';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import ActivityCard from '../../components/content/ActivityCard';
import TripCard from '../../components/content/TripCard';
import CloudinaryImage from '../../components/ui/CloudinaryImage';
import FaqAccordion from '../../components/content/FaqAccordion';
import { getFaqsForDestination } from '../../lib/queries/faqs';
import { faqPageJsonLd, jsonLdScript } from '../../lib/jsonLd';

import {
  getDestinationBySlug,
  getAllDestinationSlugs,
  getActivitiesForDestination,
  getPublishedTripCount,
} from '../../lib/queries/destinations';
import { getTripsByDestination } from '../../lib/queries/trips';
import { tripPath } from '../../lib/urls';

const SITE_URL = 'https://treknclimb.com';
const TRIP_SHORTLIST_SIZE = 6;

/**
 * ISR backstop. On-demand `revalidatePath()` from the admin is the primary
 * mechanism — this only catches anything that misses it.
 */
export const revalidate = 3600;

/**
 * Pre-renders one static page per destination at build time.
 *
 * The returned objects have to match the dynamic segment name: the folder is
 * `[destination]`, so each object is `{ destination: slug }`. This is the App
 * Router replacement for `getStaticPaths`.
 *
 * `dynamicParams` is left at its default of true, so a slug that isn't in this
 * list is still rendered on demand and 404s via `notFound()` below — that
 * keeps the door open for the database-backed redirect catch-all at migration
 * time, which a `false` here would slam shut.
 */
export async function generateStaticParams() {
  const slugs = await getAllDestinationSlugs();

  return slugs.map((slug) => ({ destination: slug }));
}

/**
 * In the App Router `params` is a Promise and must be awaited — it is not the
 * plain object the Pages Router passed in. Both this function and the page
 * component receive it, and both run on the server.
 *
 * They both call `getDestinationBySlug`, which is wrapped in React's `cache()`
 * so the query runs once per render rather than twice. Next.js does that
 * automatically for `fetch()` but not for Mongoose — see the query module.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ destination: string }>;
}): Promise<Metadata> {
  const { destination: slug } = await params;
  const destination = await getDestinationBySlug(slug);

  if (!destination) return {};

  // Every SEO field falls back to the entity's own content when the admin
  // leaves it blank.
  const title = destination.metaTitle || destination.name;
  const description = destination.metaDescription || destination.description;

  return {
    title,
    description,
    alternates: {
      canonical: destination.canonicalUrl || `${SITE_URL}/${destination.slug}`,
    },
    robots: destination.noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: destination.ogTitle || title,
      description: destination.ogDescription || description,
      url: `${SITE_URL}/${destination.slug}`,
      type: 'website',
    },
  };
}

export default async function DestinationPage({
  params,
}: {
  params: Promise<{ destination: string }>;
}) {
  const { destination: slug } = await params;
  const destination = await getDestinationBySlug(slug);

  // Either 301s to wherever this path moved, or 404s. Never returns.
  if (!destination) return redirectOrNotFound(`/${slug}`);

  // The asymmetry, resolved once. Activities are only fetched for a
  // destination that has the layer; the other three skip the query entirely.
  const [activities, trips, tripCount, faqs] = await Promise.all([
    destination.hasActivities
      ? getActivitiesForDestination(destination._id)
      : Promise.resolve([]),
    getTripsByDestination(destination.slug, { limit: TRIP_SHORTLIST_SIZE }),
    getPublishedTripCount(destination._id),
    getFaqsForDestination(String(destination._id)),
  ]);

  /*
   * Null when there are no entries, which is also what hides the section — one
   * condition for the markup and the markup's subject, so a `FAQPage` node can
   * never describe a section that is not on the page.
   */
  const faqJsonLd = faqPageJsonLd(
    faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
    `${SITE_URL}/${destination.slug}`
  );

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Trips in ${destination.name}`,
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
        {/* Hero — Ink band, part of the 30% */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
            <Breadcrumbs
              crumbs={[
                { label: 'Home', href: '/' },
                { label: 'Destinations', href: '/destinations' },
                { label: destination.name },
              ]}
            />

            <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div>
                <h1 className="font-display text-4xl font-extrabold tracking-display sm:text-5xl lg:text-6xl">
                  {destination.name}
                </h1>

                <p className="mt-4 max-w-prose text-base leading-relaxed text-paper/80 sm:text-lg">
                  {destination.description}
                </p>

                <p className="mt-6 font-mono text-sm text-paper/60 tabular">
                  {tripCount > 0
                    ? `${tripCount} ${tripCount === 1 ? 'trip' : 'trips'}`
                    : 'Trips publishing soon'}
                  {destination.hasActivities && activities.length > 0 && (
                    <> · {activities.length} activities</>
                  )}
                </p>
              </div>

              <div className="overflow-hidden rounded-lg">
                <CloudinaryImage
                  src={destination.coverImage}
                  alt={destination.coverImageAlt}
                  width={960}
                  height={640}
                  priority
                  sizes="(min-width: 1024px) 40rem, 100vw"
                  className="aspect-[3/2] w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/*
          The activity layer. Nepal only today, but the branch is driven by
          hasActivities, never by name — India, Tibet and Bhutan fall straight
          through to the trip section below.
        */}
        {destination.hasActivities && activities.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                    Start with the activity
                  </h2>
                  <p className="mt-2 max-w-prose text-muted">
                    Pick the kind of trip first. The routes underneath differ
                    mostly in length and altitude.
                  </p>
                </div>

                <Link
                  href={`/${destination.slug}/activities`}
                  className="text-sm font-semibold underline underline-offset-4 hover:text-muted"
                >
                  All {destination.name} activities
                </Link>
              </div>

              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {activities.map((activity) => (
                  <li key={String(activity._id)}>
                    <ActivityCard activity={activity} destination={destination} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Trips */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                {trips.length > 0
                  ? `Popular in ${destination.name}`
                  : `Trips in ${destination.name}`}
              </h2>

              {tripCount > TRIP_SHORTLIST_SIZE && (
                <Link
                  href={`/trips?destination=${destination.slug}`}
                  className="text-sm font-semibold underline underline-offset-4 hover:text-muted"
                >
                  All {tripCount} {destination.name} trips
                </Link>
              )}
            </div>

            {trips.length > 0 ? (
              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {trips.map((trip) => (
                  <li key={String(trip._id)}>
                    <TripCard trip={trip} />
                  </li>
                ))}
              </ul>
            ) : (
              /*
                Required empty state: a destination with no published trips yet.
                Not a dead end — it names what is missing, says what happens
                next, and still routes to the one conversion event on the site.
              */
              <div className="mt-8 rounded-lg border border-dashed border-hairline bg-white p-8 text-center sm:p-12">
                <h3 className="font-display text-xl font-extrabold tracking-display">
                  No {destination.name} trips published yet
                </h3>

                <p className="mx-auto mt-3 max-w-prose text-muted">
                  We run these routes and the itineraries are being written up
                  now.{' '}
                  {destination.hasActivities && activities.length > 0
                    ? 'Browse the activities above, or tell us your dates and we will send a plan built around them.'
                    : 'Tell us your dates and we will send a plan built around them.'}
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/contact"
                    className="rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
                  >
                    Get a quote
                  </Link>
                  <Link
                    href="/destinations"
                    className="rounded-full px-5 py-2.5 text-sm font-semibold underline underline-offset-4 hover:text-muted"
                  >
                    Browse other destinations
                  </Link>
                </div>

                <p className="mt-4 text-xs text-muted">
                  No payment now. Deposit only after you approve the plan.
                </p>
              </div>
            )}
          </div>
        </section>

        {/*
          Destination FAQs, below the trips and above the closing CTA.

          Placed here because the questions are about travelling to this
          country — permits, visas, altitude, seasons — and they are what a
          reader reaches for after seeing the routes and before deciding to
          ask. Putting them above the trips would answer questions nobody had
          yet; putting them after the CTA would hide them.

          Only entries associated with this destination. A trip's own questions
          live on the trip page, from the embedded array — see the note in
          `lib/queries/faqs.ts`.
        */}
        {faqs.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="max-w-3xl">
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Travelling in {destination.name}
                </h2>
                <p className="mt-2 max-w-prose text-muted">
                  Permits, seasons and the practical questions that come up
                  before a route is chosen.{' '}
                  <Link
                    href="/faq"
                    className="font-semibold underline underline-offset-4 hover:text-ink"
                  >
                    General questions are answered here
                  </Link>
                  .
                </p>

                <div className="mt-6">
                  <FaqAccordion entries={faqs} idPrefix="destination-faq" />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Closing CTA — the page's one marigold button */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Ask about a {destination.name} trip
                </h2>
                <p className="mt-3 max-w-prose text-paper/80">
                  Send your dates and we will come back with a day-by-day plan
                  and a final price.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    href="/contact"
                    className="rounded-full bg-marigold px-6 py-3 font-semibold text-ink transition-opacity hover:opacity-90"
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListJsonLd) }}
      />

      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd) }}
        />
      )}
    </>
  );
}
