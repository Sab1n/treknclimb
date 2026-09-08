import type { Metadata } from 'next';

import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import AffiliationStrip from '../../components/layout/AffiliationStrip';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import BookingForm, { type TripOption } from '../../components/forms/BookingForm';
import { getAllPublishedTrips } from '../../lib/queries/trips';

const SITE_URL = 'https://treknclimb.com';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Get a quote — tell us your dates',
  description:
    'Send your dates and group size and we will come back with a day-by-day itinerary and a final price. No payment now.',
  alternates: { canonical: `${SITE_URL}/contact` },
};

export default async function ContactPage() {
  const trips = await getAllPublishedTrips();

  const options: TripOption[] = trips.map((trip) => ({
    slug: trip.slug,
    title: trip.title,
  }));

  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

  return (
    <>
      {/* The form's submit button is this page's marigold CTA. */}
      <Header showCta={false} />

      <main className="flex-1">
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <Breadcrumbs
              crumbs={[{ label: 'Home', href: '/' }, { label: 'Get a quote' }]}
            />

            <h1 className="mt-6 max-w-3xl font-display text-4xl font-extrabold tracking-display sm:text-5xl">
              Tell us your dates
            </h1>

            <p className="mt-4 max-w-prose text-base leading-relaxed text-paper/80 sm:text-lg">
              A guide in Pokhara reads every inquiry and sends back a day-by-day
              plan and a final price. Nothing is booked by sending this.
            </p>
          </div>
        </section>

        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
              <div className="min-w-0 max-w-2xl">
                <BookingForm
                  trips={options}
                  turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                  whatsappNumber={whatsapp}
                />
              </div>

              <aside className="lg:sticky lg:top-6 lg:self-start">
                <div className="rounded-lg border border-hairline bg-white p-6">
                  <h2 className="font-display text-lg font-extrabold tracking-display">
                    What happens next
                  </h2>
                  <ol className="mt-4 flex flex-col gap-3 text-sm text-muted">
                    <li>1. A guide reads your request and checks the dates.</li>
                    <li>2. You get an itinerary and a final price by email.</li>
                    <li>
                      3. If it looks right, a deposit confirms. If not, we
                      suggest something else.
                    </li>
                  </ol>

                  {whatsapp && (
                    <a
                      href={`https://wa.me/${whatsapp}`}
                      className="mt-6 block rounded-full border-2 border-ink px-5 py-2.5 text-center text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
                    >
                      Ask on WhatsApp instead
                    </a>
                  )}

                  <div className="mt-6 border-t border-hairline pt-5">
                    <AffiliationStrip />
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
