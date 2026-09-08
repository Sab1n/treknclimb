import Link from 'next/link';
import { NAV_LINKS } from './Navbar';

/**
 * Mobile navigation, built on `<details>`/`<summary>` so it opens and closes
 * with no JavaScript at all — this page has no Client Components yet, and a
 * disclosure element gets keyboard support and expanded/collapsed semantics
 * from the browser for free.
 *
 * It will need to become a Client Component when it has to close on route
 * change or trap focus. Until then this is smaller and works before hydration.
 */
export default function MobileNav() {
  return (
    <details className="group md:hidden">
      <summary
        className="flex cursor-pointer list-none items-center justify-center rounded p-2 text-paper marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold"
        aria-label="Open menu"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" className="group-open:hidden" />
          <path d="M6 6l12 12M18 6L6 18" className="hidden group-open:block" />
        </svg>
      </summary>

      <nav
        aria-label="Mobile"
        className="absolute inset-x-0 top-full z-20 border-t border-white/10 bg-ink px-4 pb-6 pt-2 shadow-lg"
      >
        <ul className="flex flex-col">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block border-b border-white/10 py-3 text-paper/90 transition-colors hover:text-paper"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
