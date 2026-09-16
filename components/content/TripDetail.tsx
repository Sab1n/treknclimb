import Link from 'next/link';

import Header from '../layout/Header';
import Footer from '../layout/Footer';
import AffiliationStrip from '../layout/AffiliationStrip';
import Breadcrumbs from '../ui/Breadcrumbs';
import TripCard from './TripCard';
import TripGallery from './TripGallery';
import ElevationProfile from './ElevationProfile';

import { ITripPopulated } from '../../models/Trip';
import { tripPath } from '../../lib/urls';
import { toGalleryImages, toElevationPoints } from '../../types/dto';
import { jsonLdScript } from '../../lib/jsonLd';

const SITE_URL = 'https://treknclimb.com';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * The whole trip detail page body.
 *
 * Both route shapes — `/[destination]/[slug]/[trip]` for Nepal and
 * `/[destination]/[slug]` for everywhere else — resolve their params and then
 * render this. Keeping the body here means the asymmetry lives in routing and
 * in `tripPath()`, not duplicated across two 400-line page files.
 */
export default function TripDetail({
  trip,
  related,
}: {
  trip: ITripPopulated;
  related: ITripPopulated[];
}) {
  const canonicalPath = tripPath(trip);

  // Both of these cross into Client Components, so they go through the DTO
  // converters: ObjectIds dropped, Cloudinary URLs built here on the server.
  const images = toGalleryImages(trip);
  const elevationPoints = toElevationPoints(trip);

  const seasonLabel =
    trip.bestMonths.length > 0
      ? trip.bestMonths.map((m) => m.slice(0, 3)).join(', ')
      : null;

  /* ------------------------------------------------------------------ *
   * Structured data. No aggregateRating — the ratings are imported from
   * off-site platforms, and emitting them risks a manual action.
   * ------------------------------------------------------------------ */
  const tripJsonLd = {
    '@context': 'https://schema.org',
    '@type': trip.schemaType || 'TouristTrip',
    name: trip.title,
    description: trip.metaDescription || trip.summary,
    url: `${SITE_URL}${canonicalPath}`,
    ...(images[0].fullUrl ? { image: images[0].fullUrl } : {}),
    touristType: trip.difficulty ? `${trip.difficulty} grade` : undefined,
    offers: {
      '@type': 'Offer',
      price: trip.price,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}${canonicalPath}`,
    },
    provider: {
      '@type': 'TravelAgency',
      name: 'Trek & Climb Adventure',
      url: SITE_URL,
    },
    ...(trip.itinerary.length > 0
      ? {
          itinerary: {
            '@type': 'ItemList',
            numberOfItems: trip.itinerary.length,
            itemListElement: trip.itinerary.map((d) => ({
              '@type': 'ListItem',
              position: d.day,
              name: d.title,
            })),
          },
        }
      : {}),
  };

  const faqJsonLd =
    trip.faqs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: trip.faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
          })),
        }
      : null;

  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Destinations', href: '/destinations' },
    { label: trip.destination.name, href: `/${trip.destination.slug}` },
    ...(trip.activity
      ? [
          {
            label: trip.activity.name,
            href: `/${trip.destination.slug}/${trip.activity.slug}`,
          },
        ]
      : []),
    { label: trip.title },
  ];

  return (
    <>
      <Header showCta={false} />

      {/* pb-20 keeps the mobile action bar from covering the footer */}
      <main className="flex-1 pb-20 lg:pb-0">
        {/* Hero — Ink band */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
            <Breadcrumbs crumbs={crumbs} />

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {trip.badge && (
                <span className="rounded-full bg-marigold px-3 py-1 text-xs font-semibold text-ink">
                  {trip.badge}
                </span>
              )}
              {trip.activity && (
                <span className="rounded-full border border-white/20 px-3 py-1 text-xs">
                  {trip.activity.name}
                </span>
              )}
              {trip.tripCode && (
                <span className="font-mono text-xs text-paper/50 tabular">
                  {trip.tripCode}
                </span>
              )}
            </div>

            <h1 className="mt-3 max-w-4xl font-display text-3xl font-extrabold tracking-display sm:text-4xl lg:text-5xl">
              {trip.title}
            </h1>

            {trip.ratingAverage != null && trip.ratingCount != null && (
              <p className="mt-3 text-sm text-paper/70">
                <span className="font-mono font-semibold tabular">
                  {trip.ratingAverage.toFixed(1)}
                </span>{' '}
                from {trip.ratingCount.toLocaleString('en-US')} reviews
                {trip.ratingSource ? ` on ${trip.ratingSource}` : ''}
              </p>
            )}

            {/* Facts bar */}
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-6 sm:grid-cols-3 lg:grid-cols-5">
              <Fact label="Duration" value={`${trip.durationDays} days`} />
              {trip.maxAltitudeM != null && (
                <Fact
                  label="Max altitude"
                  value={`${trip.maxAltitudeM.toLocaleString('en-US')} m`}
                />
              )}
              {trip.difficulty && <Fact label="Grade" value={trip.difficulty} />}
              <Fact
                label="Group size"
                value={`${trip.minGroupSize}–${trip.maxGroupSize}`}
              />
              {seasonLabel && <Fact label="Best months" value={seasonLabel} />}
            </dl>
          </div>
        </section>

        {/* Gallery — near the top, not buried */}
        <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <TripGallery images={images} title={trip.title} />
        </section>

        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
            {/* ---------------- main column ---------------- */}
            <div className="min-w-0">
              {/* Answer block — the AI-extraction target */}
              <p className="rounded-lg border-l-4 border-marigold bg-white p-5 text-base leading-relaxed sm:text-lg">
                {trip.answerBlock}
              </p>

              {trip.hasElevationProfile && elevationPoints.length > 1 && (
                <ElevationProfile points={elevationPoints} className="mt-10" />
              )}

              <section className="mt-10">
                <h2 className="font-display text-2xl font-extrabold tracking-display">
                  Overview
                </h2>
                {trip.description.split('\n\n').map((paragraph, index) => (
                  <p
                    key={index}
                    className="mt-3 max-w-prose leading-relaxed text-muted"
                  >
                    {paragraph}
                  </p>
                ))}
              </section>

              {trip.highlights.length > 0 && (
                <section className="mt-10">
                  <h2 className="font-display text-2xl font-extrabold tracking-display">
                    Highlights
                  </h2>
                  <ul className="mt-4 flex flex-col gap-3">
                    {trip.highlights.map((highlight) => (
                      <li key={highlight} className="flex gap-3">
                        <span aria-hidden="true" className="text-confirmed">
                          ✓
                        </span>
                        <span className="text-muted">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {trip.itinerary.length > 0 && (
                <section className="mt-10">
                  <h2 className="font-display text-2xl font-extrabold tracking-display">
                    Day by day
                  </h2>

                  {/*
                    <details>/<summary> rather than a JS accordion: it opens and
                    closes without hydration, is keyboard accessible for free,
                    and its content is in the HTML for crawlers that do not run
                    JavaScript.
                  */}
                  <ul className="mt-4 overflow-hidden rounded-lg border border-hairline bg-white">
                    {trip.itinerary.map((itineraryDay) => (
                      <li
                        key={itineraryDay.day}
                        className="border-b border-hairline last:border-0"
                      >
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-baseline gap-4 p-5 marker:hidden hover:bg-paper">
                            <span className="font-mono text-xs text-muted tabular">
                              Day {itineraryDay.day}
                            </span>
                            <span className="flex-1 font-semibold">
                              {itineraryDay.title}
                            </span>
                            {itineraryDay.maxAltitudeM != null && (
                              <span className="font-mono text-xs text-muted tabular">
                                {itineraryDay.maxAltitudeM.toLocaleString('en-US')} m
                              </span>
                            )}
                            <span
                              aria-hidden="true"
                              className="text-muted transition-transform group-open:rotate-45"
                            >
                              +
                            </span>
                          </summary>

                          <div className="px-5 pb-5 pl-[4.5rem]">
                            <p className="max-w-prose leading-relaxed text-muted">
                              {itineraryDay.description}
                            </p>

                            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted tabular">
                              {itineraryDay.location && (
                                <span>{itineraryDay.location}</span>
                              )}
                              {itineraryDay.durationHours != null && (
                                <span>Walking {itineraryDay.durationHours} hrs</span>
                              )}
                              {itineraryDay.distanceKm != null && (
                                <span>{itineraryDay.distanceKm} km</span>
                              )}
                              {itineraryDay.accommodation && (
                                <span>Stay {itineraryDay.accommodation}</span>
                              )}
                              {itineraryDay.meals && (
                                <span>Meals {itineraryDay.meals}</span>
                              )}
                            </p>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(trip.includes.length > 0 || trip.excludes.length > 0) && (
                <section className="mt-10">
                  <h2 className="font-display text-2xl font-extrabold tracking-display">
                    What the price covers
                  </h2>

                  <div className="mt-4 grid gap-6 sm:grid-cols-2">
                    <div className="rounded-lg border border-hairline bg-white p-5">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-confirmed">
                        Included
                      </h3>
                      <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
                        {trip.includes.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span aria-hidden="true" className="text-confirmed">
                              ✓
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-lg border border-hairline bg-white p-5">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                        Not included
                      </h3>
                      <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
                        {trip.excludes.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span aria-hidden="true">·</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              )}

              {trip.groupPricing.length > 0 && (
                <section className="mt-10">
                  <h2 className="font-display text-2xl font-extrabold tracking-display">
                    Price by group size
                  </h2>
                  <p className="mt-2 max-w-prose text-muted">
                    Smaller groups cost more per person because guide and porter
                    costs are fixed. These are the same rates we quote by email.
                  </p>

                  <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-white">
                    <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-hairline bg-paper">
                          <th scope="col" className="px-5 py-4 font-semibold">
                            Group size
                          </th>
                          <th scope="col" className="px-5 py-4 font-semibold">
                            Per person
                          </th>
                          <th scope="col" className="px-5 py-4 font-semibold">
                            What changes
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...trip.groupPricing]
                          .sort((a, b) => a.minPeople - b.minPeople)
                          .map((tier) => (
                            <tr
                              key={`${tier.minPeople}-${tier.maxPeople}`}
                              className="border-b border-hairline last:border-0"
                            >
                              <th scope="row" className="px-5 py-4 font-mono font-normal tabular">
                                {tier.minPeople === tier.maxPeople
                                  ? `${tier.minPeople} traveller`
                                  : `${tier.minPeople}–${tier.maxPeople} travellers`}
                              </th>
                              <td className="px-5 py-4 font-mono font-semibold tabular">
                                {usd.format(tier.pricePerPerson)}
                              </td>
                              <td className="px-5 py-4 text-muted">
                                {tier.label ?? '—'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-3 text-xs text-muted">
                    Shown in USD. Prices in other currencies are indicative and
                    confirmed when we reply.
                  </p>
                </section>
              )}

              {trip.faqs.length > 0 && (
                <section className="mt-10">
                  <h2 className="font-display text-2xl font-extrabold tracking-display">
                    Questions about this trip
                  </h2>

                  <ul className="mt-4 overflow-hidden rounded-lg border border-hairline bg-white">
                    {trip.faqs.map((faq) => (
                      <li
                        key={faq.question}
                        className="border-b border-hairline last:border-0"
                      >
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-start gap-4 p-5 font-semibold marker:hidden hover:bg-paper">
                            <span className="flex-1">{faq.question}</span>
                            <span
                              aria-hidden="true"
                              className="text-muted transition-transform group-open:rotate-45"
                            >
                              +
                            </span>
                          </summary>
                          <p className="max-w-prose px-5 pb-5 leading-relaxed text-muted">
                            {faq.answer}
                          </p>
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {/* ---------------- sticky inquiry rail ---------------- */}
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-lg bg-ink p-6 text-paper">
                <p className="text-xs uppercase tracking-wide text-paper/60">
                  From
                </p>
                <p className="mt-1 font-mono text-4xl font-semibold tabular">
                  {usd.format(trip.price)}
                </p>
                <p className="mt-1 text-sm text-paper/70">
                  per person · {trip.durationDays} days
                </p>

                <Link
                  href={`/contact?trip=${trip.slug}`}
                  className="mt-5 block rounded-full bg-marigold px-6 py-3 text-center font-semibold text-ink transition-opacity hover:opacity-90"
                >
                  Get my free itinerary
                </Link>

                <ul className="mt-4 flex flex-col gap-2 text-sm text-paper/70">
                  <li>✓ No payment now — deposit only after you approve the plan</li>
                  <li>✓ A reply from a guide in Pokhara, not a call centre</li>
                  {trip.bestMonths.length > 0 && (
                    <li>✓ Best months: {seasonLabel}</li>
                  )}
                </ul>

                <div className="mt-6 border-t border-white/10 pt-5">
                  <AffiliationStrip variant="dark" />
                </div>
              </div>
            </aside>
          </div>

          {related.length > 0 && (
            <section className="mt-14 border-t border-hairline pt-10">
              <h2 className="font-display text-2xl font-extrabold tracking-display">
                Similar trips
              </h2>
              <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((relatedTrip) => (
                  <li key={String(relatedTrip._id)}>
                    <TripCard trip={relatedTrip} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>

      {/* ---------------- sticky mobile action bar ---------------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-lg font-semibold text-paper tabular">
              {usd.format(trip.price)}
            </p>
            <p className="text-xs text-paper/60">
              per person · {trip.durationDays} days
            </p>
          </div>
          <Link
            href={`/contact?trip=${trip.slug}`}
            className="rounded-full bg-marigold px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Get a quote
          </Link>
        </div>
      </div>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(tripJsonLd) }}
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-paper/60">{label}</dt>
      <dd className="mt-1 font-mono text-lg tabular">{value}</dd>
    </div>
  );
}
