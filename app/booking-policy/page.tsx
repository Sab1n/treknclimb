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
 * DRAFT — AND INCOMPLETE UNTIL THE CLIENT SUPPLIES THE COMMERCIAL TERMS.
 * ============================================================================
 *
 * The process described here is accurate: there is no checkout, an inquiry is
 * not a booking, and a deposit follows a written quote. That comes from the
 * code and is safe to state.
 *
 * **The deposit amount and the cancellation terms are not invented here.**
 * They are read from `SiteSettings.depositPolicyText` and
 * `SiteSettings.cancellationPolicyText`, which the client fills in through the
 * admin. Until they do, those two sections say that the figures are confirmed
 * in the written quote — which is true, and is the only honest thing this page
 * can say — but **a booking policy with no cancellation schedule is not
 * finished.** It is the one thing on this page a customer will look for after
 * something has gone wrong, and inventing a refund ladder here would be
 * inventing a contract on the company's behalf.
 */

/**
 * Shown to visitors as the version of the document they are reading.
 *
 * The date itself lives in `lib/legalPages.ts`, because the sitemap needs the
 * same value as a `Date` and a second copy here would drift from it.
 */
const LAST_UPDATED = formatLegalDate('/booking-policy');

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Booking policy',
  description:
    'How booking a trip with Trek & Climb Adventure works: inquiry, written itinerary and price, deposit, and what happens if plans change.',
  alternates: { canonical: `${SITE_URL}/booking-policy` },
};

export default async function BookingPolicyPage() {
  const settings = await getSiteSettings();

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

  /**
   * Client-supplied policy text, rendered as plain text with line breaks
   * preserved — never as HTML. It is admin-authored and this page is public,
   * so passing it through `dangerouslySetInnerHTML` would be a stored-XSS route
   * for the sake of a paragraph break.
   */
  function policyText(value: string) {
    return <p className="whitespace-pre-line">{value}</p>;
  }

  const sections: LegalSection[] = [
    {
      id: 'how-booking-works',
      heading: 'How booking works',
      body: (
        <>
          <p>
            There is no checkout on this website and no way to pay through it.
            Booking is a conversation, in four steps:
          </p>
          <LegalList
            items={[
              <>
                <strong>You send an inquiry.</strong> Dates, group size,
                nationality and anything you want us to know. This commits you
                to nothing.
              </>,
              <>
                <strong>We send a written itinerary and a final price.</strong>{' '}
                Day by day, with what is included and what is not, priced for
                your group size and your nationality&rsquo;s permit fees.
              </>,
              <>
                <strong>You decide.</strong> Ask for changes, ask for something
                else entirely, or say no. Most itineraries go through a revision
                or two, and that is normal rather than a nuisance.
              </>,
              <>
                <strong>A deposit confirms the trip.</strong> Only once you have
                agreed to the plan and the price in writing.
              </>,
            ]}
          />
          <p>
            Until that deposit is paid, nothing is booked and you owe us
            nothing.
          </p>
        </>
      ),
    },

    {
      id: 'deposit',
      heading: 'Deposit and payment',
      body: settings?.depositPolicyText ? (
        policyText(settings.depositPolicyText)
      ) : (
        <>
          <p>
            <strong>No payment is ever taken through this website.</strong> The
            deposit amount, how it is paid and when the balance is due are set
            out in the written quote we send you, and you agree to them before
            any money changes hands.
          </p>
          <p>
            If anything in that quote is unclear, ask before you pay — write to{' '}
            {contactRoute}. We would much rather answer a question twice than
            take a deposit from someone who was not sure.
          </p>
        </>
      ),
    },

    {
      id: 'cancellation',
      heading: 'If you need to cancel',
      body: settings?.cancellationPolicyText ? (
        policyText(settings.cancellationPolicyText)
      ) : (
        <>
          <p>
            The cancellation terms that apply to your trip are the ones written
            into your quote, and we will not change them after you have agreed
            to them.
          </p>
          <p>
            Some costs stop being recoverable once they are committed — permits
            are issued in your name, domestic flights are often non-refundable,
            and staff are booked for your dates. Your quote says which of those
            apply to your itinerary and from when.
          </p>
          <p>
            If your plans change, tell us as early as you can and write to{' '}
            {contactRoute}. Earlier is nearly always cheaper, and sometimes a
            date can be moved where it cannot be refunded.
          </p>
        </>
      ),
    },

    {
      id: 'what-is-included',
      heading: 'What a price includes',
      body: (
        <>
          <p>
            Every trip page lists what is included and what is not, for that
            specific trip. The two lists are deliberately separate and
            deliberately specific, so there is nothing to discover later.
          </p>
          <p>
            Broadly: permits, your guide, porters where the itinerary uses them,
            accommodation and the meals named on the trip page are in the price.
            International flights, travel insurance, visa fees, drinks and tips
            generally are not. The trip page is the authority, not this
            paragraph.
          </p>
        </>
      ),
    },

    {
      id: 'permits-and-visas',
      heading: 'Permits and visas',
      body: (
        <>
          <p>
            <strong>We arrange your trekking permits.</strong> They are issued in
            your name and are included in the price we quote, which is why we
            ask for your nationality on the inquiry form — permit fees differ by
            nationality, and nationals of SAARC countries pay a different rate.
          </p>
          <p>
            <strong>Your visa is yours to arrange.</strong> Entry rules differ by
            passport and change without much notice. We will tell you what
            applies to your nationality, but the visa itself is between you and
            the country you are entering.
          </p>
          <p>
            Once you have booked we will ask for passport details by email.
            Permits and domestic flights legally require them, which is the only
            reason we ask.
          </p>
        </>
      ),
    },

    {
      id: 'changes-on-the-ground',
      heading: 'Changes to an itinerary',
      body: (
        <>
          <p>
            Occasionally a route has to change after you have booked — weather,
            a landslide, a permit restriction, a domestic flight that does not
            fly, or someone in the group who should not go higher that day.
          </p>
          <p>
            When that happens the guide&rsquo;s decision is final on the
            mountain, and it will be made for safety rather than for schedule.
            We will get you as close to the trip you booked as conditions allow,
            and we will tell you what changed and why.
          </p>
          <p>
            Altitude is the usual reason. Our itineraries build in
            acclimatisation days for exactly this, and cutting one to save time
            is not something we will agree to.
          </p>
        </>
      ),
    },

    {
      id: 'insurance',
      heading: 'Travel insurance',
      body: (
        <>
          <p>
            You need travel insurance that covers what you are actually doing.
            For high-altitude trekking and peak climbing that means cover to the
            maximum altitude on your itinerary and, critically,{' '}
            <strong>helicopter evacuation</strong> — the standard way someone
            comes off a Himalayan route in an emergency, and expensive without
            cover.
          </p>
          <p>
            We will tell you what cover your itinerary needs before you confirm,
            and we will ask you to confirm you have it. Buying it is your
            responsibility and we do not sell it.
          </p>
        </>
      ),
    },

    {
      id: 'complaints',
      heading: 'If something goes wrong',
      body: (
        <>
          <p>
            Tell us while you are still on the trip if you possibly can — almost
            everything is fixable in the moment and almost nothing is fixable
            six weeks later. Your guide can reach the Pokhara office.
          </p>
          <p>
            If it is not resolved by then, write to {contactRoute} and we will
            respond. We are licensed by the Department of Tourism and are
            members of TAAN and the Nepal Mountaineering Association, and those
            memberships mean something about how a complaint has to be handled.
          </p>
        </>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Booking policy"
      lastUpdated={LAST_UPDATED}
      intro={
        <>
          <p>
            How a trip with us actually gets booked, what a price covers, and
            what happens if plans change on either side.
          </p>
          <p className="text-muted">
            The terms that apply to your trip are the ones in the written quote
            you agreed to. This page describes how we work; the quote is the
            agreement.
          </p>
        </>
      }
      sections={sections}
    />
  );
}
