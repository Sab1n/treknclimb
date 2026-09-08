import Link from 'next/link';
import type { Metadata } from 'next';

import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import AffiliationStrip from '../../components/layout/AffiliationStrip';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import DestinationCard from '../../components/content/DestinationCard';

import {
  getAllDestinations,
  getTripCountsByDestination,
} from '../../lib/queries/destinations';
import { destinationPath } from '../../lib/urls';

const SITE_URL = 'https://treknclimb.com';

/**
 * No dynamic segment here, so this page is static automatically — there is no
 * `generateStaticParams` to write. `revalidate` is the same ISR backstop the
 * destination pages use; on-demand `revalidatePath('/destinations')` from the
 * admin stays the primary mechanism.
 */
export const revalidate = 3600;

/**
 * A plain object, not `generateMetadata()`. Nothing here depends on route
 * params or a database read, so there is no reason to make it a function.
 */
export const metadata: Metadata = {
  title: 'Destinations — Nepal, India, Tibet and Bhutan',
  description:
    'The four regions we run trips in: Nepal, India, Tibet and Bhutan. Every route is one we operate ourselves.',
  alternates: { canonical: `${SITE_URL}/destinations` },
  openGraph: {
    title: 'Destinations — Nepal, India, Tibet and Bhutan',
    description:
      'The four regions we run trips in: Nepal, India, Tibet and Bhutan. Every route is one we operate ourselves.',
    url: `${SITE_URL}/destinations`,
    type: 'website',
  },
};

export default async function DestinationsPage() {
  const [destinations, tripCounts] = await Promise.all([
    getAllDestinations(),
    getTripCountsByDestination(),
  ]);

  /*
   * The comparison table is authored content, and every column is optional.
   * Render it only once at least one destination has something to say —
   * otherwise it is four rows of dashes, which is worse than no table.
   */
  const comparable = destinations.filter(
    (destination) =>
      destination.typicalLengthLabel ||
      destination.maxAltitudeLabel ||
      destination.bestMonthsLabel ||
      destination.permitComplexity
  );

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Destinations',
    numberOfItems: destinations.length,
    itemListElement: destinations.map((destination, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${destinationPath(destination)}`,
      name: destination.name,
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
              crumbs={[{ label: 'Home', href: '/' }, { label: 'Destinations' }]}
            />

            <h1 className="mt-6 max-w-3xl font-display text-4xl font-extrabold tracking-display sm:text-5xl lg:text-6xl">
              Four regions, one operator
            </h1>

            <p className="mt-4 max-w-prose text-base leading-relaxed text-paper/80 sm:text-lg">
              We only sell trips we run ourselves. That keeps the list short and
              means we can answer detailed questions about every route on this
              page.
            </p>
          </div>
        </section>

        {/* The four destinations */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <ul className="flex flex-col gap-8 lg:gap-10">
              {destinations.map((destination, index) => (
                <li key={String(destination._id)}>
                  <DestinationCard
                    destination={destination}
                    tripCount={tripCounts.get(String(destination._id)) ?? 0}
                    // Alternate the image side down the list.
                    reverse={index % 2 === 1}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How they compare */}
        {comparable.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                How they compare
              </h2>
              <p className="mt-2 max-w-prose text-muted">
                A rough guide before you go deeper. These describe the region,
                not any one route.
              </p>

              {/* Five columns will not fit a phone, so the table scrolls
                  inside its own container rather than the page scrolling
                  sideways. */}
              <div className="mt-8 overflow-x-auto rounded-lg border border-hairline bg-white">
                <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Typical trip length, maximum altitude, best months and
                    permit complexity by destination
                  </caption>

                  <thead>
                    <tr className="border-b border-hairline bg-paper">
                      <th scope="col" className="px-5 py-4 font-semibold">
                        Region
                      </th>
                      <th scope="col" className="px-5 py-4 font-semibold">
                        Typical length
                      </th>
                      <th scope="col" className="px-5 py-4 font-semibold">
                        Max altitude
                      </th>
                      <th scope="col" className="px-5 py-4 font-semibold">
                        Best months
                      </th>
                      <th scope="col" className="px-5 py-4 font-semibold">
                        Permit complexity
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {comparable.map((destination) => (
                      <tr
                        key={String(destination._id)}
                        className="border-b border-hairline last:border-0"
                      >
                        <th scope="row" className="px-5 py-4 font-semibold">
                          <Link
                            href={destinationPath(destination)}
                            className="underline-offset-4 hover:underline"
                          >
                            {destination.name}
                          </Link>
                        </th>
                        <td className="px-5 py-4 font-mono text-muted tabular">
                          {destination.typicalLengthLabel ?? '—'}
                        </td>
                        <td className="px-5 py-4 font-mono text-muted tabular">
                          {destination.maxAltitudeLabel ?? '—'}
                        </td>
                        <td className="px-5 py-4 font-mono text-muted tabular">
                          {destination.bestMonthsLabel ?? '—'}
                        </td>
                        <td className="px-5 py-4 text-muted">
                          {destination.permitComplexity ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-xs text-muted">
                Permits for every region are arranged by us and included in the
                price we quote.
              </p>
            </div>
          </section>
        )}

        {/* Closing CTA — the page's one marigold button */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Still deciding?
                </h2>
                <p className="mt-3 max-w-prose text-paper/80">
                  Send us your dates and how much walking you have done, and we
                  will narrow it to two options.
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
    </>
  );
}
