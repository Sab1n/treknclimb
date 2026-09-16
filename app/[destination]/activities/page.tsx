import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { redirectOrNotFound } from '../../../lib/redirects';

import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';
import AffiliationStrip from '../../../components/layout/AffiliationStrip';
import Breadcrumbs from '../../../components/ui/Breadcrumbs';
import CloudinaryImage from '../../../components/ui/CloudinaryImage';
import LongFormArticle from '../../../components/content/LongFormArticle';
import ActivityOverviewCard from '../../../components/content/ActivityOverviewCard';
import ActivityComparison from '../../../components/content/ActivityComparison';

import { getDestinationBySlug } from '../../../lib/queries/destinations';
import {
  getActivityStats,
  getDestinationSlugsWithActivities,
} from '../../../lib/queries/activities';
import Activity, { IActivity } from '../../../models/Activity';
import type { IDestination } from '../../../models/Destination';
import { connectDB } from '../../../lib/db';
import { activityPath, activitiesListingPath } from '../../../lib/urls';
import { toActivityComparisonRows } from '../../../types/dto';
import { jsonLdScript } from '../../../lib/jsonLd';

const SITE_URL = 'https://treknclimb.com';

export const revalidate = 3600;

/**
 * Only destinations that actually have the layer.
 *
 * `activities` is a **static** segment sitting beside the dynamic `[slug]`, and
 * Next resolves static before dynamic — so `/nepal/activities` reaches this
 * page rather than being read as an activity or trip slug. That is also why
 * `activities` is on the reserved-slug list.
 *
 * India, Tibet and Bhutan are not returned here, and the page calls
 * `notFound()` for them below. Both halves matter: this keeps them out of the
 * build, the guard keeps `/india/activities` from rendering on demand.
 */
export async function generateStaticParams() {
  const slugs = await getDestinationSlugsWithActivities();

  return slugs.map((slug) => ({ destination: slug }));
}

/**
 * Activities under a destination, in display order.
 *
 * Deliberately not `getActivitiesForDestination` — that helper attaches a trip
 * count with a second aggregation, and this page needs the full stats instead.
 * Running both would be two `$group`s over the same trips for overlapping data.
 */
async function getActivities(
  destinationId: IActivity['destination']
): Promise<IActivity[]> {
  await connectDB();

  return Activity.find({ destination: destinationId })
    .sort({ displayOrder: 1, name: 1 })
    .lean<IActivity[]>()
    .exec();
}

type Params = Promise<{ destination: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { destination: slug } = await params;
  const destination = await getDestinationBySlug(slug);

  if (!destination || !destination.hasActivities) return {};

  /*
   * This page targets "activities in Nepal", "things to do in Nepal",
   * "adventure activities Nepal" — queries about the region rather than about
   * one route. The title says the region and the category, not the company.
   */
  const title = `Adventure Activities in ${destination.name} — Trekking, Climbing and Hiking`;

  const description =
    destination.metaDescription ||
    `What adventure travel in ${destination.name} actually involves: the activities we run, when the seasons are, what the permits require, and how to choose between them.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}${activitiesListingPath(destination)}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${activitiesListingPath(destination)}`,
      type: 'website',
    },
  };
}

export default async function ActivitiesPage({ params }: { params: Params }) {
  const { destination: slug } = await params;
  const destination = await getDestinationBySlug(slug);

  if (!destination) return redirectOrNotFound(`/${slug}/activities`);

  /*
   * The Nepal asymmetry, enforced rather than assumed. This page is meaningless
   * for a destination with no activity layer, and rendering an empty grid at
   * /india/activities would be an indexable page saying nothing.
   */
  /*
   * A destination with no activity layer has no activities page. Not a
   * redirect candidate — the path is structurally wrong rather than moved —
   * so this stays a plain 404.
   */
  if (!destination.hasActivities) notFound();

  const [activities, stats] = await Promise.all([
    getActivities(destination._id),
    getActivityStats(destination._id),
  ]);

  const totalTrips = [...stats.values()].reduce(
    (sum, row) => sum + row.tripCount,
    0
  );

  /*
   * The comparison table is a Client Component — sortable headers need state —
   * so its rows are flattened to DTOs here. Mongoose documents carry ObjectIds,
   * which React will not serialize across the boundary.
   */
  const comparisonRows = toActivityComparisonRows(
    activities,
    destination.slug,
    stats
  );

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Adventure activities in ${destination.name}`,
    numberOfItems: activities.length,
    itemListElement: activities.map((activity, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${activityPath(activity, destination)}`,
      name: activity.name,
    })),
  };

  return (
    <>
      <Header />

      <main className="flex-1">
        {/* ---------------- Hero ---------------- */}
        {/*
          Deliberately short. Every pixel spent here is a pixel the cards are
          pushed below the fold, and the cards are what someone came to choose
          between. Breadcrumb, title, two sentences, done — the long-form copy
          now sits below the cards instead.

          `bg-ink` under the image rather than relying on it: if the Cloudinary
          asset is missing the band stays dark and legible instead of dropping
          white text onto white.
        */}
        <section className="relative isolate overflow-hidden bg-ink text-paper">
          <div className="absolute inset-0 -z-10">
            <CloudinaryImage
              src={destination.coverImage}
              alt=""
              width={1920}
              height={720}
              sizes="100vw"
              priority
              className="h-full w-full object-cover"
            />
            {/*
              Two layers, not one. The flat wash guarantees a contrast floor
              across the whole band; the gradient darkens the left, where the
              text actually sits, without flattening the photograph on the
              right. A single 60% wash would meet contrast and kill the image.
            */}
            <div aria-hidden="true" className="absolute inset-0 bg-ink/70" />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-linear-to-r from-ink via-ink/60 to-ink/20"
            />
          </div>

          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <Breadcrumbs
              crumbs={[
                { label: 'Home', href: '/' },
                { label: 'Destinations', href: '/destinations' },
                { label: destination.name, href: `/${destination.slug}` },
                { label: 'Activities' },
              ]}
            />

            <h1 className="mt-6 max-w-3xl font-display text-4xl font-extrabold tracking-display sm:text-5xl">
              Adventure activities in {destination.name}
            </h1>

            {/*
              The short intro. Two sentences, built from real counts so it can
              never claim more than exists — and never a copy of
              `description`, which is already on /destinations and in the
              destination hero.
            */}
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-paper/80 sm:text-lg">
              {activities.length}{' '}
              {activities.length === 1 ? 'activity' : 'activities'}
              {totalTrips > 0 && (
                <>
                  , across {totalTrips} {totalTrips === 1 ? 'route' : 'routes'}{' '}
                  we operate ourselves
                </>
              )}
              . Below: what each one involves, who it suits, and how they
              compare.
            </p>
          </div>
        </section>

        {/* ---------------- The activities ---------------- */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
            {/*
              This header row is where a sort or filter toolbar goes if the
              catalogue ever needs one. Nothing below assumes the grid is
              unsorted, so adding controls here does not restructure the page.
            */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                What we run in {destination.name}
              </h2>
            </div>

            {activities.length > 0 ? (
              /*
               * Fully count-independent.
               *
               * `auto-fill` with a `minmax` track, not `grid-cols-3`. The
               * browser fits as many ~22rem tracks as the container allows and
               * lays items into them, so the same class renders 1, 2, 5, 12 or
               * 20 cards correctly with no per-count branching.
               *
               * Two details do the work:
               *
               * - **`auto-fill`, never `auto-fit`.** `auto-fit` collapses the
               *   empty tracks, which makes a single card stretch across the
               *   whole row — a 1,200px-wide card with a 3:2 image. `auto-fill`
               *   keeps the empty tracks, so one card is the same width as one
               *   of twenty.
               * - **`min(100%, 22rem)`** as the track minimum. A bare `22rem`
               *   overflows a container narrower than that; `min()` lets the
               *   track shrink to the container on a phone.
               *
               * `items-stretch` is the grid default and is what `h-full` on the
               * card hangs off, so a short card and a long one in the same row
               * are the same height without either being distorted.
               */
              <ul className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-6">
                {activities.map((activity) => (
                  <li key={String(activity._id)}>
                    <ActivityOverviewCard
                      activity={activity}
                      destination={destination}
                      stats={stats.get(String(activity._id))}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-8 rounded-lg border border-dashed border-hairline bg-white p-8 text-center sm:p-12">
                <h3 className="font-display text-xl font-extrabold tracking-display">
                  No activities published yet
                </h3>
                <p className="mx-auto mt-3 max-w-prose text-muted">
                  {destination.name} is set up for activities but none have been
                  added. Tell us what you want to do and we will tell you what
                  we run.
                </p>
                <Link
                  href="/contact"
                  className="mt-6 inline-block rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
                >
                  Ask a question
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* ---------------- Side by side ---------------- */}
        {activities.length > 1 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                How they compare
              </h2>
              <p className="mt-2 max-w-prose text-muted">
                Every column is counted from the routes we currently publish
                under each activity — nothing here is a label someone typed in.
                Click a column heading to sort by it.
              </p>

              <div className="mt-8">
                <ActivityComparison
                  rows={comparisonRows}
                  destinationName={destination.name}
                />
              </div>

              <p className="mt-4 text-xs text-muted">
                These describe the trips published today, so they move as the
                catalogue does. What kit each activity needs is on its card
                above, and in full on its own page.
              </p>
            </div>
          </section>
        )}

        {/* ---------------- The long-form content ---------------- */}
        {/*
          Below the cards, every word intact.

          This is the page's SEO substance — a card grid does not rank for
          "things to do in Nepal", prose does. Position on the page is not what
          earns that: Google reads the whole document, while burying the cards
          under 590 words cost every visitor a scroll before they could see what
          was on offer. Below the fold for a human, same document for a crawler.

          `LongFormArticle` does the composition — sticky contents, pull
          quotes, numbered dividers — and renders through the Markdown-subset
          parser the blog uses, so nothing reaches dangerouslySetInnerHTML.
        */}
        {destination.activitiesIntro && (
          <section className="border-b border-hairline">
            <LongFormArticle
              heading={`Planning a trip to ${destination.name}`}
              body={destination.activitiesIntro}
              aside={<RegionFacts destination={destination} />}
            />
          </section>
        )}

        {/* ---------------- CTA band ---------------- */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Still not sure which one?
                </h2>
                <p className="mt-3 max-w-prose text-paper/80">
                  Tell us how many days you have and how much walking you have
                  done, and we will tell you which of these fits — including
                  when the answer is none of them.
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

/**
 * The region numbers, as a small card beside the article.
 *
 * These used to sit in the hero and were clutter there — nobody choosing
 * between trekking and peak climbing needs a permit-complexity rating before
 * they have seen the activities. Beside prose about seasons and permits they
 * are context rather than noise, which is the same data being right in one
 * place and wrong in another.
 *
 * Authored on the destination, not derived: they describe the region, not
 * whichever trips are published. Renders nothing when none are filled in.
 */
function RegionFacts({ destination }: { destination: IDestinationFacts }) {
  const facts = [
    { label: 'Best months', value: destination.bestMonthsLabel },
    { label: 'Altitude range', value: destination.maxAltitudeLabel },
    { label: 'Typical length', value: destination.typicalLengthLabel },
    { label: 'Permits', value: destination.permitComplexity },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));

  if (facts.length === 0) return null;

  return (
    <div className="rounded-lg border border-hairline bg-white p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {destination.name} at a glance
      </h3>

      <dl className="mt-4 flex flex-col gap-3">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-xs text-muted">{fact.label}</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold tabular">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Describes the region, not any one route.
      </p>
    </div>
  );
}

/** Just the fields RegionFacts reads — it has no business taking the whole doc. */
type IDestinationFacts = Pick<
  IDestination,
  | 'name'
  | 'bestMonthsLabel'
  | 'maxAltitudeLabel'
  | 'typicalLengthLabel'
  | 'permitComplexity'
>;
