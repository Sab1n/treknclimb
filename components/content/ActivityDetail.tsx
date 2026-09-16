import Link from 'next/link';

import Header from '../layout/Header';
import Footer from '../layout/Footer';
import AffiliationStrip from '../layout/AffiliationStrip';
import Breadcrumbs from '../ui/Breadcrumbs';
import CloudinaryImage from '../ui/CloudinaryImage';
import TripCard from './TripCard';

import { IActivityPopulated } from '../../models/Activity';
import { ITripPopulated } from '../../models/Trip';
import { tripPath, filteredTripsPath } from '../../lib/urls';
import { DIFFICULTY_GRADES, GRADE_ORDER } from '../../lib/difficultyGrades';
import { jsonLdScript } from '../../lib/jsonLd';

const SITE_URL = 'https://treknclimb.com';

/**
 * An activity page — Nepal only today, but nothing here says so.
 *
 * Reached at `/nepal/trekking`. Rendered by the level-2 route when the
 * destination has an activity layer; the same route renders a trip page when it
 * does not.
 */
export default function ActivityDetail({
  activity,
  trips,
}: {
  activity: IActivityPopulated;
  trips: ITripPopulated[];
}) {
  const destination = activity.destination;
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${activity.name} in ${destination.name}`,
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
        {/* Hero — Ink band */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <Breadcrumbs
              crumbs={[
                { label: 'Home', href: '/' },
                { label: 'Destinations', href: '/destinations' },
                { label: destination.name, href: `/${destination.slug}` },
                { label: activity.name },
              ]}
            />

            <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div>
                <p className="text-sm uppercase tracking-wide text-paper/60">
                  {destination.name}
                </p>

                <h1 className="mt-2 font-display text-4xl font-extrabold tracking-display sm:text-5xl">
                  {activity.name}
                </h1>

                <p className="mt-4 max-w-prose text-base leading-relaxed text-paper/80 sm:text-lg">
                  {activity.description}
                </p>

                {/*
                  `description` says what the activity is; `suitability` answers
                  who it is for. Optional, so it may not be written yet.
                */}
                {activity.suitability && (
                  <div className="mt-6 max-w-prose border-l-2 border-marigold pl-4">
                    <h2 className="text-xs uppercase tracking-wide text-paper/60">
                      Who this suits
                    </h2>
                    <p className="mt-2 leading-relaxed text-paper/80">
                      {activity.suitability}
                    </p>
                  </div>
                )}

                <p className="mt-6 font-mono text-sm text-paper/60 tabular">
                  {trips.length > 0
                    ? `${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}`
                    : 'Trips publishing soon'}
                </p>
              </div>

              <div className="overflow-hidden rounded-lg">
                <CloudinaryImage
                  src={activity.coverImage}
                  alt={activity.coverImageAlt}
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

        {/* Trips under this activity */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                {activity.name} trips
              </h2>

              <Link
                href={`/${destination.slug}`}
                className="text-sm font-semibold underline underline-offset-4 hover:text-muted"
              >
                All {destination.name} activities
              </Link>
            </div>

            {trips.length > 0 ? (
              <>
                <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {trips.map((trip) => (
                    <li key={String(trip._id)}>
                      <TripCard trip={trip} />
                    </li>
                  ))}
                </ul>

                {/*
                  The progression out of this page: learn what the activity is
                  here, then compare the options within it on /trips.

                  This is the one place that link belongs. Activity cards
                  elsewhere on the site link to *this* page, never past it to a
                  filter state — this page carries its own metadata, intro copy,
                  suitability and grades table and is the landing page for
                  "trekking in Nepal", while the filtered listing canonicals back
                  to plain /trips and would orphan it.
                */}
                <div className="mt-8 rounded-lg border border-hairline bg-white p-6">
                  <Link
                    href={filteredTripsPath({
                      destination: destination.slug,
                      activity: activity.slug,
                    })}
                    className="font-semibold underline underline-offset-4"
                  >
                    Compare all {trips.length}{' '}
                    {activity.name.toLowerCase()} trips by price, duration and
                    difficulty
                  </Link>
                  <p className="mt-2 text-sm text-muted">
                    Opens the full listing with this activity already selected.
                  </p>
                </div>
              </>
            ) : (
              /*
                Required empty state: an activity with no published trips yet.
                Names the situation, offers the other activities, and still
                routes to the one conversion event on the site.
              */
              <div className="mt-8 rounded-lg border border-dashed border-hairline bg-white p-8 text-center sm:p-12">
                <h3 className="font-display text-xl font-extrabold tracking-display">
                  No {activity.name.toLowerCase()} trips published yet
                </h3>

                <p className="mx-auto mt-3 max-w-prose text-muted">
                  We run these routes and the itineraries are being written up
                  now. Tell us your dates and we will send a plan built around
                  them.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/contact"
                    className="rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
                  >
                    Get a quote
                  </Link>
                  <Link
                    href={`/${destination.slug}`}
                    className="rounded-full px-5 py-2.5 text-sm font-semibold underline underline-offset-4 hover:text-muted"
                  >
                    Other {destination.name} activities
                  </Link>
                </div>

                <p className="mt-4 text-xs text-muted">
                  No payment now. Deposit only after you approve the plan.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* What the grades mean — reference data, identical across activities */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
              What the grades mean
            </h2>
            <p className="mt-2 max-w-prose text-muted">
              Our grading is about consecutive days and altitude, not technical
              difficulty.
            </p>

            <div className="mt-8 overflow-x-auto rounded-lg border border-hairline bg-white">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Daily walking hours, altitude range and suitability for each
                  difficulty grade
                </caption>
                <thead>
                  <tr className="border-b border-hairline bg-paper">
                    <th scope="col" className="px-5 py-4 font-semibold">
                      Grade
                    </th>
                    <th scope="col" className="px-5 py-4 font-semibold">
                      Daily walking
                    </th>
                    <th scope="col" className="px-5 py-4 font-semibold">
                      Max altitude
                    </th>
                    <th scope="col" className="px-5 py-4 font-semibold">
                      Suits
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {GRADE_ORDER.map((grade) => {
                    const row = DIFFICULTY_GRADES[grade];

                    return (
                      <tr
                        key={grade}
                        className="border-b border-hairline last:border-0"
                      >
                        <th scope="row" className="px-5 py-4 font-semibold">
                          {grade}
                        </th>
                        <td className="px-5 py-4 font-mono text-muted tabular">
                          {row.dailyWalking}
                        </td>
                        <td className="px-5 py-4 font-mono text-muted tabular">
                          {row.altitude}
                        </td>
                        <td className="px-5 py-4 text-muted">{row.suits}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Closing CTA — the page's one marigold button */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Not sure which {activity.name.toLowerCase()} route?
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListJsonLd) }}
      />
    </>
  );
}
