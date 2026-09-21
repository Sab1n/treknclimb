import Link from 'next/link';
import type { Metadata } from 'next';

import LegalDocument, {
  LegalList,
  type LegalSection,
} from '../../components/content/LegalDocument';
import { getSiteSettings } from '../../lib/queries/settings';
import { formatLegalDate } from '../../lib/legalPages';

const SITE_URL = 'https://treknclimb.com';

/**
 * ============================================================================
 * DRAFT — NOT LEGALLY REVIEWED. GOVERNING LAW NEEDS CLIENT CONFIRMATION.
 * ============================================================================
 *
 * What is accurate here is the description of the system: there is no
 * checkout, an inquiry is not a booking, prices are quoted in USD and any
 * converted figure is indicative. Those are statements about the code and they
 * are correct.
 *
 * What is a reasonable default rather than a client instruction is the
 * limitation of liability and the governing-law clause, which names Nepal
 * because the company is a Nepali private limited company operating from
 * Pokhara. **Both need confirming before launch**, and the liability section
 * in particular should be read by someone qualified — a limitation clause that
 * is unenforceable where the customer lives is worse than a short honest one.
 */

/**
 * Shown to visitors as the version of the document they are reading.
 *
 * The date itself lives in `lib/legalPages.ts`, because the sitemap needs the
 * same value as a `Date` and a second copy here would drift from it.
 */
const LAST_UPDATED = formatLegalDate('/terms');

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Terms of use',
  description:
    'The terms that apply to using the Trek & Climb Adventure website, what an inquiry is and is not, and how prices on the site should be read.',
  alternates: { canonical: `${SITE_URL}/terms` },
};

export default async function TermsPage() {
  const settings = await getSiteSettings();

  const legalName = settings?.legalName || 'Trek & Climb Adventure';

  const contactRoute = settings?.email ? (
    <a
      href={`mailto:${settings.email}`}
      className="font-semibold underline underline-offset-4"
    >
      {settings.email}
    </a>
  ) : (
    <Link href="/contact" className="font-semibold underline underline-offset-4">
      the contact form
    </Link>
  );

  const sections: LegalSection[] = [
    {
      id: 'who',
      heading: 'Who these terms are with',
      body: (
        <>
          <p>
            This website is operated by {legalName}, a trekking and adventure
            travel operator registered in Nepal and based in Pokhara. &ldquo;We&rdquo;
            and &ldquo;us&rdquo; below mean that company.
          </p>
          <p>
            By using the site you accept these terms. If you do not, please
            don&rsquo;t use it — though you are still welcome to email us.
          </p>
        </>
      ),
    },

    {
      id: 'what-this-site-is',
      heading: 'What this website is',
      body: (
        <>
          <p>
            It is a catalogue of the trips we run and a way of asking us for a
            quote. That is all it is.
          </p>
          <LegalList
            items={[
              'There is no online payment. No card details are taken anywhere on this site.',
              'There is no customer account and nothing to sign up for.',
              'Nothing you do here books, reserves or holds a place on anything.',
            ]}
          />
        </>
      ),
    },

    {
      id: 'inquiry-not-booking',
      heading: 'An inquiry is not a booking',
      body: (
        <>
          <p>
            Sending the form starts a conversation. It does not create a
            contract, reserve a date, or commit either of us to anything.
          </p>
          <p>
            What happens next is that a guide reads it, checks the dates and the
            season, and sends you a day-by-day itinerary with a final price. A
            trip is only booked once you have agreed to that plan and that price
            in writing and paid a deposit. Until then you owe us nothing and we
            owe you nothing beyond a considered reply.
          </p>
          <p>
            The terms of the trip itself — deposit, balance, cancellation, what
            is included — are in the{' '}
            <Link
              href="/booking-policy"
              className="font-semibold underline underline-offset-4"
            >
              booking policy
            </Link>{' '}
            and in the quote we send you.
          </p>
        </>
      ),
    },

    {
      id: 'prices',
      heading: 'How to read the prices on this site',
      body: (
        <>
          <p>
            Every price on this site is <strong>per person, in US dollars</strong>,
            and is the starting price for that trip — the lowest per-person rate
            across our group sizes. A larger group costs less per person; the
            trip page shows the tiers.
          </p>
          <p>
            If you switch the site to another currency, the figure you see is a{' '}
            <strong>conversion for guidance only</strong>. It is calculated from
            a stored exchange rate that will not match your bank&rsquo;s rate on
            the day. The price we hold you to is the one in the written quote.
          </p>
          <p>
            Prices, itineraries and availability can change — permit fees are
            set by the government and are revised, and a route can close. The
            price becomes fixed when we send you a quote, not when you read a
            page.
          </p>
        </>
      ),
    },

    {
      id: 'accuracy',
      heading: 'Accuracy of what is on the site',
      body: (
        <>
          <p>
            We write the trip descriptions, altitudes, durations and season
            advice ourselves and we take care to keep them right. Even so,
            mountains, permits and airline schedules change, and a page can be
            out of date between the day it is written and the day you read it.
          </p>
          <p>
            Where a page and a written quote disagree, the quote is the one that
            counts. If you spot something wrong on the site, tell us at{' '}
            {contactRoute} — we would rather fix it than defend it.
          </p>
          <p>
            We do not promise the site will always be available or free of
            errors. If it is down when you want to reach us, WhatsApp and email
            still work.
          </p>
        </>
      ),
    },

    {
      id: 'content',
      heading: 'Photographs and text',
      body: (
        <>
          <p>
            The photographs, itineraries and written descriptions on this site
            are ours, and are not free to reuse. You are welcome to link to any
            page here, and to quote a short passage with attribution.
          </p>
          <p>
            Copying itineraries or photographs to sell trips of your own is not
            welcome, and we do ask.
          </p>
        </>
      ),
    },

    {
      id: 'links',
      heading: 'Links to other sites',
      body: (
        <p>
          We link to the government departments and associations we are
          registered with, and occasionally to other useful sources. We do not
          control those sites and are not responsible for what is on them.
        </p>
      ),
    },

    {
      id: 'liability',
      heading: 'Our responsibility, and its limits',
      body: (
        <>
          <p>
            We are responsible for running the trips we sell, and for the care
            we take in doing it. Nothing on this page limits that, and nothing
            here excludes liability for death or personal injury caused by our
            negligence, or for fraud — no clause can, and we would not want one
            that tried.
          </p>
          <p>
            What we cannot accept responsibility for is loss caused by relying
            on the website itself rather than on a written quote: a price that
            has since changed, a season window described in general terms, or an
            itinerary we have revised. Those are the reason we send a quote.
          </p>
        </>
      ),
    },

    {
      id: 'law',
      heading: 'Which law applies',
      body: (
        <p>
          These terms are governed by the laws of Nepal, where the company is
          registered and where the trips are operated. This does not remove any
          protection you have under the consumer law of the country you live in.
        </p>
      ),
    },

    {
      id: 'changes',
      heading: 'Changes to these terms',
      body: (
        <p>
          We update these terms from time to time and change the date at the top
          of the page when we do. The terms that apply to your trip are the ones
          in the quote you agreed to, not whatever this page says later.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Terms of use"
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          These cover using this website. The terms of a trip you book with us
          are in the{' '}
          <Link
            href="/booking-policy"
            className="font-semibold underline underline-offset-4"
          >
            booking policy
          </Link>{' '}
          and in the written quote we send you.
        </p>
      }
      sections={sections}
    />
  );
}
