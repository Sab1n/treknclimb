import Link from 'next/link';
import AffiliationStrip from './AffiliationStrip';
import NewsletterSignup from '../forms/NewsletterSignup';

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
 * NAP is not hardcoded here — it belongs in SiteSettings so it stays
 * byte-identical with the Organization JSON-LD and every off-site profile.
 * That record is seeded almost empty, so this renders the links only until
 * a SiteSettings-aware version lands with the homepage.
 */
export default function Footer() {
  return (
    <footer className="mt-auto bg-ink text-paper">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-base font-extrabold uppercase tracking-display">
              Trek &amp; Climb Adventure
            </p>
            <p className="mt-2 text-sm text-paper/60">Pokhara, Nepal</p>
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
            &copy; {new Date().getFullYear()} Trek &amp; Climb Adventure Pvt. Ltd.
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
