import Link from 'next/link';
import AffiliationStrip from './AffiliationStrip';
import NewsletterSignup from '../forms/NewsletterSignup';
import { getSiteSettings } from '../../lib/queries/settings';

const DESTINATION_LINKS = [
  { label: 'Nepal', href: '/nepal' },
  { label: 'India', href: '/india' },
  { label: 'Tibet', href: '/tibet' },
  { label: 'Bhutan', href: '/bhutan' },
];

const COMPANY_LINKS = [
  { label: 'About', href: '/about' },
  { label: 'Blog', href: '/blog' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
];

const LEGAL_LINKS = [
  { label: 'Privacy policy', href: '/privacy-policy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Booking policy', href: '/booking-policy' },
];

/**
 * Site footer. Ink band, part of the 30%.
 *
 * ## The NAP is read, not typed
 *
 * Name, address, phone and email come from SiteSettings so they stay
 * byte-identical with the Organization JSON-LD and every off-site directory.
 * CLAUDE.md makes that consistency an entity-resolution concern rather than a
 * tidiness one: the same string in every place is how a search engine decides
 * the footer, the structured data and the Google Business Profile all describe
 * one company.
 *
 * An **async Server Component**, which is what makes that possible without
 * threading a prop through seventeen pages. It runs on the server, reads
 * Mongoose directly and ships no JavaScript. `getSiteSettings` is wrapped in
 * React's `cache()`, so a page whose body already read the settings does not
 * pay for a second round trip to Atlas.
 *
 * ## Every field falls back
 *
 * The settings record is seeded almost empty and filled in over time, so each
 * value has to survive being missing. The name falls back to a constant, the
 * location to whichever of city and country exist, and phone and email are
 * simply omitted. A footer rendering "undefined, undefined" on a half-filled
 * record is worse than one rendering less.
 *
 * ## What this costs in cache terms
 *
 * This component is on every public page, so a NAP change now invalidates all
 * of them. `settingsPaths` handles that — see the note there on why those
 * fields map to a layout-level purge rather than an enumerated list.
 */

/** The one hardcoded name, and only as a last resort. */
const FALLBACK_NAME = 'Trek & Climb Adventure';

export default async function Footer() {
  const settings = await getSiteSettings();

  const name = settings?.tradingName || settings?.legalName || FALLBACK_NAME;

  /*
   * City and country, whichever exist. Joined rather than templated so a record
   * holding only one of them does not render a dangling comma.
   */
  const location = [settings?.addressLocality, settings?.addressCountry]
    .filter(Boolean)
    .join(', ');

  return (
    <footer className="mt-auto bg-ink text-paper">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-base font-extrabold uppercase tracking-display">
              {name}
            </p>

            {/*
              A real `address` element where there is something to put in it.
              `not-italic` because browsers style it italic by default, and a
              NAP block in italics reads as an aside rather than as the
              company's actual address.
            */}
            <address className="mt-2 flex flex-col gap-1 text-sm not-italic text-paper/60">
              {settings?.streetAddress && <span>{settings.streetAddress}</span>}
              {location && <span>{location}</span>}
              {settings?.postalCode && <span>{settings.postalCode}</span>}

              {settings?.phone && (
                <a
                  /*
                    Stripped to digits and a leading plus for the href, while
                    the visible text keeps whatever spacing the client typed.
                    A `tel:` with spaces in it is unreliable on some dialers,
                    and the readable form is what belongs on screen.
                  */
                  href={`tel:${settings.phone.replace(/[^+\d]/g, '')}`}
                  className="hover:text-paper"
                >
                  {settings.phone}
                </a>
              )}

              {settings?.email && (
                <a href={`mailto:${settings.email}`} className="hover:text-paper">
                  {settings.email}
                </a>
              )}

              {/*
                A freshly seeded record has none of the above. The location line
                alone is the minimum worth printing, so it is the floor rather
                than an empty block.
              */}
              {!settings?.streetAddress && !location && <span>Pokhara, Nepal</span>}
            </address>
          </div>

          <div>
            <h2 className="text-sm font-semibold">Destinations</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-paper/70">
              {DESTINATION_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-paper">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold">Company</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-paper/70">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-paper">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <AffiliationStrip variant="dark" />
          </div>
        </div>

        {/*
          Newsletter, sitewide. The footer is the one placement that is always
          below whatever the page was actually for, so it cannot compete with
          it — which is why the trip pages get this and nothing higher up.
        */}
        <div className="mt-12 max-w-xl border-t border-white/10 pt-8">
          <NewsletterSignup
            variant="dark"
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-paper/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()}{' '}
            {settings?.legalName || FALLBACK_NAME}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-paper">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
