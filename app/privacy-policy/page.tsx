import Link from 'next/link';
import type { Metadata } from 'next';

import LegalDocument, {
  LegalList,
  type LegalSection,
} from '../../components/content/LegalDocument';
import { getSiteSettings } from '../../lib/queries/settings';
import {
  CONSENT_STATEMENT,
  CONSENT_STATEMENT_SINCE,
} from '../../lib/consent';

const SITE_URL = 'https://treknclimb.com';

/**
 * ============================================================================
 * DRAFT — DESCRIBES THE SYSTEM ACCURATELY, BUT HAS NOT BEEN LEGALLY REVIEWED.
 * ============================================================================
 *
 * Everything below is a factual description of what this codebase actually
 * does — the fields the form collects, the processors it sends data to, the
 * TTL on rejected submissions — written against the code rather than adapted
 * from a template. That part is accurate and is the hard part to get right.
 *
 * What it is not is legal advice, and the retention periods and the rights
 * wording should be confirmed by someone qualified before launch. The two
 * retention commitments (24 months, 7 years) are **policy, not yet
 * automation**: nothing deletes on a schedule today, so they are promises a
 * person currently has to keep.
 */

/** Update whenever the text below changes. Shown to visitors as the version. */
const LAST_UPDATED = '10 September 2026';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What Trek & Climb Adventure collects when you send an inquiry, who processes it, how long it is kept, and how to ask for a copy or deletion.',
  alternates: { canonical: `${SITE_URL}/privacy-policy` },
};

export default async function PrivacyPolicyPage() {
  const settings = await getSiteSettings();

  /*
   * The contact route for a data request. It has to be a real address — a
   * privacy policy that cannot tell you where to write is broken — so it falls
   * back to the contact form rather than printing a blank or a placeholder
   * address that bounces.
   */
  const privacyEmail = settings?.email;

  const contactRoute = privacyEmail ? (
    <a
      href={`mailto:${privacyEmail}`}
      className="font-semibold underline underline-offset-4"
    >
      {privacyEmail}
    </a>
  ) : (
    <Link href="/contact" className="font-semibold underline underline-offset-4">
      the contact form
    </Link>
  );

  const legalName = settings?.legalName || 'Trek & Climb Adventure';

  // The constant is an ISO date so it sorts and compares; this page reads it
  // aloud, so it is formatted here rather than stored pre-formatted.
  const consentSince = new Date(CONSENT_STATEMENT_SINCE).toLocaleDateString(
    'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' }
  );

  const postalAddress = [
    settings?.streetAddress,
    settings?.addressLocality,
    settings?.addressRegion,
    settings?.postalCode,
    settings?.addressCountry,
  ]
    .filter(Boolean)
    .join(', ');

  const sections: LegalSection[] = [
    {
      id: 'who-we-are',
      heading: 'Who we are',
      body: (
        <>
          <p>
            {legalName} is a trekking and adventure travel operator based in
            Pokhara, Nepal. We run our own trips across Nepal, India, Tibet and
            Bhutan, and this website is how most people first contact us.
          </p>
          {postalAddress && <p>{postalAddress}</p>}
          <p>
            If you have a question about anything on this page, write to{' '}
            {contactRoute}.
          </p>
        </>
      ),
    },

    {
      id: 'what-we-collect',
      heading: 'What the inquiry form collects',
      body: (
        <>
          <p>
            The inquiry form is the only place this website asks you for
            anything. When you send one, we receive:
          </p>
          <LegalList
            items={[
              <>
                <strong>Your name</strong> and <strong>email address</strong>,
                so we can reply.
              </>,
              <>
                <strong>Your phone or WhatsApp number</strong>, if you give one.
                It is optional.
              </>,
              <>
                <strong>Your nationality</strong> — see the next section for why
                we need it.
              </>,
              <>
                <strong>Which trip you asked about</strong>, if you arrived from
                a trip page or chose one from the list.
              </>,
              <>
                <strong>Your preferred start date</strong> and{' '}
                <strong>the number of travellers</strong>.
              </>,
              <>
                <strong>Anything you write in the message box</strong>. That
                field is free text, so please only put in it what you are
                comfortable sending by email.
              </>,
              <>
                <strong>How you would like us to reply</strong> — email,
                WhatsApp or either.
              </>,
              <>
                <strong>The page you submitted the form from</strong>, so we
                know which trip you were reading.
              </>,
              <>
                <strong>The date and time you agreed</strong> to the statement
                beside the consent box.
              </>,
            ]}
          />
          <p>
            <strong>There is no payment on this website.</strong> There is no
            checkout, no card form and no customer account, so we never receive
            card or bank details through it. If you go on to book, we ask for
            passport details separately, by email, because permits and internal
            flights in Nepal legally require them — and only after you have
            agreed to a plan and a price.
          </p>
          <p>
            <strong>Your IP address</strong> is used while you submit — to
            rate-limit the form and to run the bot check described below. It is{' '}
            <strong>not stored alongside your inquiry</strong>. The only case in
            which we retain it is a submission our filters rejected, covered two
            sections down.
          </p>
        </>
      ),
    },

    {
      id: 'why-nationality',
      heading: 'Why we ask for your nationality',
      body: (
        <>
          <p>
            Because we cannot quote you an accurate price without it. Nepal
            charges different trekking permit fees depending on nationality —
            nationals of SAARC countries pay less than others — and the visa
            rules on arrival are not the same for every passport.
          </p>
          <p>
            So nationality is not a marketing field. It changes two real numbers
            on the quote we send you, and asking after the fact would mean
            revising a price we had already given you.
          </p>
          <p>
            We use it for that, and for understanding which countries our
            inquiries come from. We do not use it to set different prices for
            the same permit, and we do not share it with anyone except the
            authorities that issue your permits, once you have booked.
          </p>
        </>
      ),
    },

    {
      id: 'consent',
      heading: 'What you agreed to',
      body: (
        <>
          <p>
            The inquiry form will not submit until you tick the consent box. It
            is never pre-ticked. The statement, in force since{' '}
            {consentSince}, is:
          </p>
          <blockquote className="border-l-2 border-hairline pl-4 italic">
            &ldquo;{CONSENT_STATEMENT}&rdquo;
          </blockquote>
          <p>
            We store the moment you agreed along with your inquiry, so that if
            the wording here ever changes we can tell which version you actually
            saw.
          </p>
          <p>
            You can withdraw that consent at any time by writing to{' '}
            {contactRoute}. Withdrawing it means we stop using your details to
            follow up, and delete them unless we are required to keep them for
            the tax reasons described below.
          </p>
        </>
      ),
    },

    {
      id: 'newsletter',
      heading: 'If you subscribe to the newsletter',
      body: (
        <>
          <p>
            The newsletter is separate from an inquiry. Signing up for one does
            not sign you up for the other, and the box on the confirmation page
            after you send an inquiry is never pre-ticked.
          </p>
          <p>
            When you subscribe we collect <strong>your email address</strong>,{' '}
            <strong>the page you subscribed from</strong>, and{' '}
            <strong>the date and time you confirmed</strong>. Nothing else — no
            name, no interests, and no tracking on our side of what you open.
          </p>
          <p>
            <strong>We use double opt-in.</strong> Submitting the form does not
            subscribe you: it sends one email with a confirmation link, and
            nothing further happens until you click it. If it was not you who
            typed the address, doing nothing is enough — the request is deleted
            automatically after seven days.
          </p>
          <p>
            That confirmation click is what we keep as the record of consent,
            because it is the only step that proves the address belongs to
            whoever agreed.
          </p>
          <p>
            <strong>Who sends it.</strong> The confirmation email comes from
            Resend, the same service that carries inquiry email. The newsletter
            itself is sent by a separate marketing provider, and{' '}
            <strong>only confirmed addresses are ever passed to them</strong>.
            They store your address and handle the unsubscribe link in every
            email, which is where an unsubscribe actually takes effect. The
            provider is named at the foot of every newsletter we send.
          </p>
          <p>
            Unsubscribing from any email removes you from that sending list
            immediately. Our own copy of the record is not updated
            automatically, and we never send from it — if you want that copy
            deleted too, ask at {contactRoute} and we will.
          </p>
        </>
      ),
    },

    {
      id: 'rejected-submissions',
      heading: 'Submissions our filters reject',
      body: (
        <>
          <p>
            The form is protected by automatic anti-spam checks: a hidden field
            no person can see, a timer that rejects anything completed faster
            than a human could read the form, a Cloudflare bot check, and a
            limit on how many inquiries one address can send.
          </p>
          <p>
            <strong>Those checks are automatic, and automatic checks are
            sometimes wrong.</strong> If one rejects a genuine inquiry, we do not
            want it to vanish without trace. So every rejected submission is
            written to a separate log — the reason it was rejected, the time,
            the IP address it came from and what was submitted — and is{' '}
            <strong>deleted automatically after 30 days</strong>.
          </p>
          <p>
            That log exists for exactly one purpose: so that if you tell us you
            sent something and heard nothing, we can look rather than guess. It
            is not used for marketing, it is not a customer list, and nothing is
            ever taken out of it except to answer that question.
          </p>
        </>
      ),
    },

    {
      id: 'processors',
      heading: 'Who else processes your data',
      body: (
        <>
          <p>
            We do not sell your details, and we do not pass your inquiry to
            other operators. We do rely on a small number of service providers
            to run the site, and they process data on our behalf:
          </p>
          <LegalList
            items={[
              <>
                <strong>MongoDB Atlas</strong> — hosts the database your
                inquiry is stored in. It runs on Amazon Web Services in Mumbai,
                India.
              </>,
              <>
                <strong>Resend</strong> — delivers the notification to our
                office and the acknowledgement to you, so it processes your
                name, email address and the contents of your inquiry.
              </>,
              <>
                <strong>Cloudflare Turnstile</strong> — the bot check on the
                form. It receives your IP address and information about your
                browser in order to decide whether you are a person. It does not
                receive what you typed into the form.
              </>,
              <>
                <strong>Upstash</strong> — holds the counters that limit how
                many inquiries can be sent from one IP address or one email
                address. That means it briefly holds your IP address and your
                email address as counter keys. These expire within 24 hours.
              </>,
              <>
                <strong>Cloudinary</strong> — serves the photographs on this
                site. Like any image host it sees the IP address and browser of
                whoever loads an image. It receives nothing from the form.
              </>,
              <>
                <strong>Google Analytics 4</strong> —{' '}
                <em>not in use on this site yet.</em> When it is added it will
                receive page-view data, and only if you allow analytics cookies.
                This page will be updated before that happens.
              </>,
            ]}
          />
        </>
      ),
    },

    {
      id: 'retention',
      heading: 'How long we keep it',
      body: (
        <>
          <LegalList
            items={[
              <>
                <strong>Inquiries that do not become bookings</strong> are
                deleted after <strong>24 months</strong>. People often plan a
                Himalayan trip a season or two ahead and come back to a
                conversation we already had, which is why it is not shorter.
              </>,
              <>
                <strong>Records of trips that were booked</strong> are kept for{' '}
                <strong>seven years</strong>, because Nepali tax law requires us
                to retain the underlying records of a transaction for that long.
              </>,
              <>
                <strong>Rejected submissions</strong> are deleted automatically
                after <strong>30 days</strong>.
              </>,
              <>
                <strong>Rate-limiting counters</strong> expire within{' '}
                <strong>24 hours</strong>.
              </>,
            ]}
          />
          <p>
            If you ask us to delete your details before those periods are up, we
            will, except where the seven-year tax rule applies to a booking that
            actually happened.
          </p>
        </>
      ),
    },

    {
      id: 'your-rights',
      heading: 'Asking for a copy, a correction or deletion',
      body: (
        <>
          <p>You can ask us to:</p>
          <LegalList
            items={[
              'Send you a copy of everything we hold about you.',
              'Correct anything that is wrong.',
              'Delete your details.',
              'Stop contacting you, without deleting anything.',
            ]}
          />
          <p>
            Write to {contactRoute} and say which of those you want. We will
            reply within <strong>30 days</strong>. We may ask you to confirm
            your identity first — usually by replying from the address the
            inquiry was sent from — because handing someone else&rsquo;s details
            over on request would be its own privacy failure.
          </p>
          <p>
            We handle these requests the same way wherever you live. If you are
            in the UK or the EU and you are not satisfied with our response, you
            are entitled to complain to your national data protection authority.
          </p>
        </>
      ),
    },

    {
      id: 'cookies',
      heading: 'Cookies',
      body: (
        <>
          <p>
            This site uses as few cookies as it can. Where something below is
            not live yet, it is marked — we would rather this page say what the
            site actually does than describe a plan.
          </p>
          <LegalList
            items={[
              <>
                <strong>Your cookie choice</strong> — remembers whether you
                allowed analytics, so you are not asked on every page.{' '}
                <em>Set only once the analytics banner exists.</em>
              </>,
              <>
                <strong>Currency preference</strong> — remembers which currency
                you chose to see prices in. Functional only; it holds a currency
                code and nothing about you. <em>Not live yet.</em>
              </>,
              <>
                <strong>Cloudflare Turnstile</strong> — set by Cloudflare when
                the bot check runs on the inquiry form, to tell a person from a
                script.
              </>,
              <>
                <strong>Admin session</strong> — set only when a member of our
                staff signs in to manage the site. It is never set for visitors.
              </>,
              <>
                <strong>Google Analytics</strong> — <em>not in use yet.</em>{' '}
                When added, it will be off until you allow it, and you will be
                able to change that decision at any time.
              </>,
            ]}
          />
          <p>
            No advertising cookies, no third-party trackers and no cross-site
            profiling. Prices are converted in your browser rather than on our
            server, which is why a currency choice needs a cookie at all.
          </p>
        </>
      ),
    },

    {
      id: 'changes',
      heading: 'Changes to this policy',
      body: (
        <p>
          When this policy changes we update the date at the top of the page.
          The consent statement quoted above carries its own effective date, so
          a change to it can be told apart from a change to anything else here.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Privacy policy"
      lastUpdated={LAST_UPDATED}
      intro={
        <>
          <p>
            This describes what happens to your details when you use this
            website — what we collect, who else touches it, how long we keep it
            and how to get it back or have it deleted.
          </p>
          <p className="text-muted">
            It is written to match what the site actually does, not to cover
            every eventuality in the abstract. If something here does not match
            your experience of using it, that is a bug and we would like to know.
          </p>
        </>
      }
      sections={sections}
    />
  );
}
