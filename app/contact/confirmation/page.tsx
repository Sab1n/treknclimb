import Link from 'next/link';
import type { Metadata } from 'next';

import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';
import TripCard from '../../../components/content/TripCard';
import { getAllPublishedTrips } from '../../../lib/queries/trips';

/**
 * Post-submission confirmation.
 *
 * Reads `?ref=`, so this page is dynamic — and that is right here. It is
 * noindexed and has no cache value, and a distinct URL is what GA4 needs to
 * record the conversion as a page view rather than an event fired from the
 * form.
 */
export const metadata: Metadata = {
  title: 'Inquiry received',
  robots: { index: false, follow: false },
};

const NEXT_STEPS = [
  'A guide reads your request and checks the dates and the season.',
  'You get a day-by-day itinerary, a final price, and answers to anything you asked.',
  'If it looks right, a deposit confirms it. If not, tell us and we will suggest something else.',
];

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

  const suggestions = (await getAllPublishedTrips()).slice(0, 3);

  const whatsappHref = whatsapp
    ? `https://wa.me/${whatsapp}${
        ref
          ? `?text=${encodeURIComponent(`Hello, I have just sent inquiry ${ref}.`)}`
          : ''
      }`
    : null;

  return (
    <>
      <Header showCta={false} />

      <main className="flex-1">
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            <p
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-confirmed text-2xl"
            >
              ✓
            </p>

            <h1 className="mt-6 font-display text-3xl font-extrabold tracking-display sm:text-4xl">
              Your inquiry reached the Pokhara office
            </h1>

            <p className="mt-4 text-base leading-relaxed text-paper/80 sm:text-lg">
              A guide will read it and come back with a day-by-day itinerary and
              a final price.
            </p>

            {ref && (
              <div className="mt-8 rounded-lg border border-white/15 p-5">
                <p className="text-xs uppercase tracking-wide text-paper/60">
                  Your reference
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular">
                  {ref}
                </p>
                <p className="mt-2 text-sm text-paper/70">
                  Quote it if you message us — it saves repeating everything.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="border-b border-hairline">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-extrabold tracking-display">
              What happens next
            </h2>

            <ol className="mt-5 flex flex-col gap-4">
              {NEXT_STEPS.map((step, index) => (
                <li key={step} className="flex gap-4">
                  <span className="font-mono text-sm text-muted tabular">
                    {index + 1}
                  </span>
                  <span className="text-muted">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-8 rounded-lg border border-hairline bg-white p-6">
              <h3 className="font-semibold">In a hurry, or dates are tight?</h3>
              <p className="mt-2 text-sm text-muted">
                WhatsApp reaches us faster than email during office hours in
                Nepal.
              </p>

              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  className="mt-4 inline-block rounded-full bg-marigold px-5 py-2.5 text-sm font-semibold text-ink"
                >
                  Message us on WhatsApp
                </a>
              ) : (
                <p className="mt-4 text-sm text-muted">
                  WhatsApp is not configured yet — reply to the acknowledgement
                  email and it reaches the same people.
                </p>
              )}
            </div>
          </div>
        </section>

        {suggestions.length > 0 && (
          <section>
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
              <h2 className="font-display text-2xl font-extrabold tracking-display">
                While you wait
              </h2>

              <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((trip) => (
                  <li key={String(trip._id)}>
                    <TripCard trip={trip} />
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <Link
                  href="/trips"
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Browse all trips
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}
