import Link from 'next/link';

import Header from '../layout/Header';
import Footer from '../layout/Footer';
import AffiliationStrip from '../layout/AffiliationStrip';
import Breadcrumbs from '../ui/Breadcrumbs';
import CloudinaryImage from '../ui/CloudinaryImage';
import TripCard from './TripCard';
import PostBody from './PostBody';

import { IRegionPopulated } from '../../models/Region';
import { IActivity } from '../../models/Activity';
import { ITripPopulated } from '../../models/Trip';
import { tripPath, filteredTripsPath, activityPath } from '../../lib/urls';
import { jsonLdScript, SITE_URL } from '../../lib/jsonLd';

/**
 * A region page — `/nepal/trekking/region/everest`.
 *
 * ## Why it takes an activity as well as a region
 *
 * A region belongs to a **destination**, but it is rendered **under an
 * activity**. The Everest region holds treks and peak climbs; those are two
 * pages with two headings and two trip lists, not one page mixing them.
 *
 * Nothing here tests which activity it is. The heading, the copy and the
 * comparison link are all built from `activity.name`, so a peak-climbing region
 * page reads correctly the moment one exists — no branch, nothing to remember.
 *
 * ## Other regions
 *
 * `siblings` is every *other* region holding trips under this same activity.
 * It is what stops this page being a dead end for someone who has decided the
 * region is wrong rather than the activity.
 */
export default function RegionDetail({
  region,
  activity,
  trips,
  siblings,
}: {
  region: IRegionPopulated;
  /*
   * `Pick`, not `IActivity`, and certainly not `IActivityPopulated`. This
   * component needs a name and a slug; asking for the whole document would make
   * the populated and unpopulated shapes incompatible at the call site for no
   * benefit, since it reads neither the destination ref nor anything else.
   */
  activity: Pick<IActivity, 'name' | 'slug'>;
  trips: ITripPopulated[];
  siblings: { slug: string; name: string; tripCount: number }[];
}) {
  const destination = region.destination;
  const activityLabel = activity.name.toLowerCase();

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${activity.name} in ${region.name}, ${destination.name}`,
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
            {/*
              Four levels deep, so the trail is doing real work here. It also
              emits the BreadcrumbList JSON-LD from the same array it renders,
              which is what stops the markup drifting from what a visitor sees.
            */}
            <Breadcrumbs
              crumbs={[
                { label: 'Home', href: '/' },
                { label: 'Destinations', href: '/destinations' },
                { label: destination.name, href: `/${destination.slug}` },
                {
                  label: activity.name,
                  href: activityPath(activity, destination),
                },
                { label: region.name },
              ]}
            />

            <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div>
                <p className="text-sm uppercase tracking-wide text-paper/60">
                  {activity.name} · {destination.name}
                </p>

                <h1 className="mt-2 font-display text-4xl font-extrabold tracking-display sm:text-5xl">
                  {region.name}
                </h1>

                <p className="mt-6 font-mono text-sm text-paper/60 tabular">
                  {trips.length > 0
                    ? `${trips.length} ${activityLabel} ${trips.length === 1 ? 'trip' : 'trips'}`
                    : `No ${activityLabel} trips published yet`}
                </p>
              </div>

              <div className="overflow-hidden rounded-lg">
                <CloudinaryImage
                  src={region.coverImage}
                  alt={region.coverImageAlt}
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

        {/* Intro — the editorial substance that makes this rank */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="max-w-prose">
              {/*
                Through the Markdown-subset parser, like every other long-form
                body on the site — so nothing reaches dangerouslySetInnerHTML
                and the client can structure this with headings rather than us
                fixing the sections in code.
              */}
              <PostBody body={region.description} />
            </div>
          </div>
        </section>

        {/* Trips in this region, under this activity */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                {region.name} {activityLabel} trips
              </h2>

              <Link
                href={activityPath(activity, destination)}
                className="text-sm font-semibold underline underline-offset-4 hover:text-muted"
              >
                All {destination.name} {activityLabel}
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
                  The same progression the activity pages use: understand the
                  place here, then compare the options on /trips. This page
                  carries its own metadata, canonical and intro copy and is the
                  landing page for "Everest treks"; the filtered listing
                  canonicals back to plain /trips, so linking cards past this
                  page to a filter state would orphan the one that can rank.
                */}
                <div className="mt-8 rounded-lg border border-hairline bg-white p-6">
                  <Link
                    href={filteredTripsPath({
                      destination: destination.slug,
                      activity: activity.slug,
                      region: region.slug,
                    })}
                    className="font-semibold underline underline-offset-4"
                  >
                    Compare all {trips.length} {region.name} {activityLabel}{' '}
                    {trips.length === 1 ? 'trip' : 'trips'} by price and duration
                  </Link>
                  <p className="mt-2 text-sm text-muted">
                    Opens the full listing with this region already selected.
                  </p>
                </div>
              </>
            ) : (
              /*
                An admin has created the region and not yet published trips under
                this activity. The page is reachable but is not in the sitemap
                and was not prebuilt, so nothing advertises it — this state
                exists so the person who just made the record can see it, not as
                a page anyone arrives at.
              */
              <div className="mt-8 rounded-lg border border-dashed border-hairline bg-white p-8 text-center sm:p-12">
                <h3 className="font-display text-xl font-extrabold tracking-display">
                  No {region.name} {activityLabel} trips published yet
                </h3>

                <p className="mx-auto mt-3 max-w-prose text-muted">
                  We run routes in this region and the itineraries are being
                  written up now. Tell us your dates and we will send a plan
                  built around them.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/contact"
                    className="rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
                  >
                    Get a quote
                  </Link>
                  <Link
                    href={activityPath(activity, destination)}
                    className="rounded-full px-5 py-2.5 text-sm font-semibold underline underline-offset-4 hover:text-muted"
                  >
                    All {destination.name} {activityLabel}
                  </Link>
                </div>

                <p className="mt-4 text-xs text-muted">
                  No payment now. Deposit only after you approve the plan.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* The other regions under this activity */}
        {siblings.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                Other {destination.name} {activityLabel} regions
              </h2>

              <ul className="mt-6 flex flex-wrap gap-3">
                {siblings.map((sibling) => (
                  <li key={sibling.slug}>
                    <Link
                      href={`/${destination.slug}/${activity.slug}/region/${sibling.slug}`}
                      className="inline-flex items-baseline gap-2 rounded-full border border-hairline bg-white px-5 py-2.5 text-sm font-semibold transition-colors hover:border-ink"
                    >
                      {sibling.name}
                      <span className="font-mono text-xs text-muted tabular">
                        {sibling.tripCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Closing CTA — the page's one marigold button */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Not sure which {region.name} route?
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
