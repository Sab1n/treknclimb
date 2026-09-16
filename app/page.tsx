import Link from 'next/link';
import type { Metadata } from 'next';

import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import AffiliationStrip from '../components/layout/AffiliationStrip';
import TripSearch from '../components/forms/TripSearch';
import DestinationTile from '../components/content/DestinationTile';
import ActivityCard from '../components/content/ActivityCard';
import TripCard from '../components/content/TripCard';
import TestimonialCard from '../components/content/TestimonialCard';
import BlogPostCard from '../components/content/BlogPostCard';

import {
  getAllDestinations,
  getTripCountsByDestination,
  getActivitiesForDestination,
} from '../lib/queries/destinations';
import { getFeaturedTrips, getAllPublishedTrips } from '../lib/queries/trips';
import { getPublishedTestimonials } from '../lib/queries/testimonials';
import { getPublishedPosts } from '../lib/queries/blog';
import { getSiteSettings } from '../lib/queries/settings';
import { getAffiliations } from '../lib/queries/affiliations';
import { organizationJsonLd, websiteJsonLd, SITE_URL, jsonLdScript } from '../lib/jsonLd';

export const revalidate = 3600;

/*
 * Fallback copy, used only when SiteSettings has nothing for a field.
 *
 * The homepage's conversion copy belongs to the client and lives in the
 * settings singleton so they can change it without a deploy. But that document
 * is created empty and edited in the admin, so any field on it can be blank at
 * any moment — an admin clearing the hero headline must not produce an empty
 * `<h1>` on the site's most important page. These are the floor, not the
 * intent.
 */
const FALLBACK = {
  heroHeadline:
    'Himalayan treks and climbs, run by the guides who walk them',
  heroSubheading:
    'Nepal, India, Tibet and Bhutan. Send us your dates and we come back with a day-by-day itinerary and a final price. Nothing is booked by asking.',
  ctaLabel: 'Get my free itinerary',
  riskReversal: 'No payment now. Deposit only after you approve the plan.',
  description:
    'Guided treks, peak climbs and cultural journeys across Nepal, India, Tibet and Bhutan, run from Pokhara.',
};

/**
 * `generateMetadata()` rather than `export const metadata`, because the
 * description comes out of the database. The convention is that a plain object
 * is right when nothing depends on params or a read — this page reads
 * SiteSettings, so it earns the function.
 *
 * It costs no extra query: `getSiteSettings` is wrapped in React's `cache()`,
 * so this call and the page body's call are one round trip.
 *
 * `title.absolute` skips the `%s | Trek & Climb Adventure` template from the
 * root layout. Every other page wants that suffix; the homepage title already
 * ends with the company name and would otherwise say it twice.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const description = settings?.shortDescription || FALLBACK.description;

  const title =
    'Trek & Climb Adventure — Trekking and Peak Climbing in Nepal, India, Tibet and Bhutan';

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: SITE_URL },
    openGraph: { title, description, url: SITE_URL, type: 'website' },
  };
}

export default async function HomePage() {
  /*
   * Every independent read, issued together. None depends on another, so
   * awaiting them in sequence would serialise seven round trips to Atlas for no
   * reason. The activity read is the exception — it needs Nepal's id — so it
   * comes after.
   */
  const [
    destinations,
    tripCounts,
    featured,
    testimonials,
    posts,
    settings,
    affiliations,
  ] = await Promise.all([
    getAllDestinations(),
    getTripCountsByDestination(),
    getFeaturedTrips(3),
    getPublishedTestimonials(3),
    getPublishedPosts({ limit: 3 }),
    getSiteSettings(),
    getAffiliations(),
  ]);

  /*
   * The Nepal asymmetry, on the homepage. Only one destination has an activity
   * layer, and which one is a property of the data — `hasActivities` — not a
   * hardcoded 'nepal'. If the client ever gives India an activity layer, this
   * section follows without an edit here.
   */
  const withActivities = destinations.find((d) => d.hasActivities);

  const activities = withActivities
    ? await getActivitiesForDestination(withActivities._id)
    : [];

  // Nothing flagged featured yet: show the top of the ordinary listing order
  // rather than dropping the section. An empty homepage is worse than an
  // unopinionated one.
  const leadTrips =
    featured.length > 0 ? featured : (await getAllPublishedTrips()).slice(0, 3);

  const valueProps = [...(settings?.valuePropositions ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  const stats = [...(settings?.headlineStats ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  const heroHeadline = settings?.heroHeadline || FALLBACK.heroHeadline;
  const heroSubheading = settings?.heroSubheading || FALLBACK.heroSubheading;
  const ctaLabel = settings?.heroCtaLabel || FALLBACK.ctaLabel;
  const riskReversal = settings?.riskReversalText || FALLBACK.riskReversal;

  return (
    <>
      {/*
        The hero search button is this viewport's one marigold element, so the
        header's own CTA is suppressed. The closing band carries the other, a
        full page-length away.
      */}
      <Header showCta={false} />

      <main className="flex-1">
        {/* ---------------- Hero ---------------- */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center lg:gap-16">
              <div>
                <h1 className="max-w-2xl font-display text-4xl font-extrabold leading-[1.05] tracking-display sm:text-5xl lg:text-6xl">
                  {heroHeadline}
                </h1>

                <p className="mt-5 max-w-prose text-base leading-relaxed text-paper/80 sm:text-lg">
                  {heroSubheading}
                </p>

                {stats.length > 0 && (
                  <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-5">
                    {stats.map((stat) => (
                      <div key={String(stat._id ?? stat.label)}>
                        <dt className="text-xs uppercase tracking-wide text-paper/60">
                          {stat.label}
                        </dt>
                        <dd className="mt-1 font-mono text-2xl font-semibold tabular">
                          {stat.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              <div>
                <TripSearch destinations={destinations} />

                <p className="mt-3 text-center text-sm text-paper/60">
                  {riskReversal}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Destination explorer ---------------- */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Where do you want to walk?
                </h2>
                <p className="mt-2 max-w-prose text-muted">
                  Four regions, all of them ones we run trips in ourselves.
                </p>
              </div>

              <Link
                href="/destinations"
                className="text-sm font-semibold underline underline-offset-4"
              >
                Compare all four
              </Link>
            </div>

            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {destinations.map((destination) => (
                <li key={String(destination._id)}>
                  <DestinationTile
                    destination={destination}
                    tripCount={tripCounts.get(String(destination._id)) ?? 0}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------- Featured trips ---------------- */}
        {leadTrips.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                    {featured.length > 0
                      ? 'Trips we are known for'
                      : 'Where most people start'}
                  </h2>
                  <p className="mt-2 max-w-prose text-muted">
                    Fixed itineraries, with a price that already includes
                    permits, guide and porters.
                  </p>
                </div>

                <Link
                  href="/trips"
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  All trips
                </Link>
              </div>

              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {leadTrips.map((trip) => (
                  <li key={String(trip._id)}>
                    <TripCard trip={trip} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------------- Value propositions ---------------- */}
        {valueProps.length > 0 && (
          <section className="bg-ink text-paper">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <h2 className="max-w-2xl font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                Why book with the operator rather than an agent
              </h2>

              <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                {valueProps.map((prop) => (
                  <li key={String(prop._id ?? prop.title)}>
                    <h3 className="font-display text-lg font-extrabold tracking-display">
                      {prop.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-paper/70">
                      {prop.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------------- Browse by activity ---------------- */}
        {withActivities && activities.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                    Or start with what you want to do
                  </h2>

                  {/*
                    The activity layer is named rather than implied. It exists
                    in one destination and nowhere else, and a heading that
                    quietly pretended otherwise would send people looking for
                    peak climbing in Bhutan.
                  */}
                  <p className="mt-2 max-w-prose text-muted">
                    Our {withActivities.name} trips are grouped by activity. The
                    other regions are organised by route.
                  </p>
                </div>

                <Link
                  href={`/${withActivities.slug}`}
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  All {withActivities.name} trips
                </Link>
              </div>

              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {activities.map((activity) => (
                  <li key={String(activity._id)}>
                    <ActivityCard
                      activity={activity}
                      destination={withActivities}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------------- Testimonials ---------------- */}
        {testimonials.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                What people said afterwards
              </h2>

              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {testimonials.map((testimonial) => (
                  <li key={String(testimonial._id)}>
                    <TestimonialCard testimonial={testimonial} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------------- Latest from the blog ---------------- */}
        {posts.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                    Field notes
                  </h2>
                  <p className="mt-2 max-w-prose text-muted">
                    Permit changes, route conditions and season advice, written
                    by the guides who run these routes.
                  </p>
                </div>

                <Link
                  href="/blog"
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  All field notes
                </Link>
              </div>

              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                  <li key={String(post._id)}>
                    <BlogPostCard post={post} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------------- Affiliations ---------------- */}
        {affiliations.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
              <h2 className="font-display text-xl font-extrabold tracking-display">
                Licensed, registered and accountable
              </h2>
              <p className="mt-2 max-w-prose text-muted">
                We are registered with the Government of Nepal and are members
                of the bodies that regulate trekking and mountaineering here.
              </p>

              <div className="mt-6">
                <AffiliationStrip />
              </div>
            </div>
          </section>
        )}

        {/* ---------------- Closing CTA ---------------- */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
              <div>
                <h2 className="max-w-xl font-display text-3xl font-extrabold tracking-display sm:text-4xl">
                  Tell us your dates and we will build the trip around them
                </h2>

                <p className="mt-4 max-w-prose text-paper/80">
                  Every itinerary we send is written for the group it is for —
                  your fitness, your dates, the time you actually have.
                </p>

                <div className="mt-8">
                  <Link
                    href="/contact"
                    className="inline-block rounded-full bg-marigold px-6 py-3.5 font-semibold text-ink transition-opacity hover:opacity-90"
                  >
                    {ctaLabel}
                  </Link>
                </div>

                {/* Risk reversal, directly under the CTA. */}
                <p className="mt-3 text-sm text-paper/60">{riskReversal}</p>
              </div>

              {/*
                The response-time promise and a named human, beside the CTA.
                Both come from SiteSettings and both are simply absent until the
                client fills them in — an invented "replies within 2 hours" on
                the block whose whole job is trust is the wrong place to guess.
              */}
              <div className="rounded-lg border border-white/15 p-6 lg:justify-self-end">
                {settings?.responseTimePromise && (
                  <p className="font-display text-lg font-extrabold tracking-display">
                    {settings.responseTimePromise}
                  </p>
                )}

                {settings?.contactPersonName && (
                  <p className="mt-3 text-sm text-paper/70">
                    Your inquiry goes to {settings.contactPersonName}
                    {settings.contactPersonRole
                      ? `, ${settings.contactPersonRole}`
                      : ''}
                    , in our Pokhara office.
                  </p>
                )}

                {settings?.officeHours && (
                  <p className="mt-2 font-mono text-xs text-paper/60 tabular">
                    {settings.officeHours}
                  </p>
                )}

                <div className="mt-6 border-t border-white/10 pt-5">
                  <AffiliationStrip variant="dark" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Carries the sitewide newsletter signup, same as every other page. */}
      <Footer />

      {/*
        Organization and WebSite, on the homepage only. This is the URL search
        engines treat as the entity's home, so the identity node lives here and
        other pages reference it by @id rather than repeating it.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            organizationJsonLd(
              settings,
              affiliations,
              destinations.map((destination) => destination.name)
            )
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(websiteJsonLd(settings)),
        }}
      />
    </>
  );
}
