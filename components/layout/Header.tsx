import Link from 'next/link';
import Navbar from './Navbar';
import MobileNav from './MobileNav';

/**
 * Site header. Ink band, part of the 30%.
 *
 * Deliberately not sticky: the header carries the page's one marigold CTA, and
 * a sticky header would put it on screen at the same time as the marigold CTA
 * in the closing band — two gold buttons in one viewport, which the palette
 * rule forbids.
 *
 * Pass `showCta={false}` on pages that carry their own persistent CTA. The trip
 * page has a sticky inquiry rail, which would otherwise be a second gold button
 * on screen at the same time as this one.
 */
export default function Header({ showCta = true }: { showCta?: boolean }) {
  return (
    <header className="relative bg-ink text-paper">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-display text-sm font-extrabold uppercase tracking-display sm:text-base"
        >
          Trek &amp; Climb Adventure
          <span className="hidden text-paper/60 sm:inline"> · Pokhara</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <Navbar />

          {showCta && (
            <Link
              href="/contact"
              className="hidden rounded-full bg-marigold px-4 py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-90 sm:inline-block"
            >
              Get a quote
            </Link>
          )}

          <MobileNav />
        </div>
      </div>
    </header>
  );
}
