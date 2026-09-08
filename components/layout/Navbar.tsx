import Link from 'next/link';

export const NAV_LINKS = [
  { label: 'Destinations', href: '/destinations' },
  { label: 'Trips', href: '/trips' },
  { label: 'About', href: '/about' },
  { label: 'Blog', href: '/blog' },
  { label: 'Contact', href: '/contact' },
];

/** Desktop navigation. Hidden below md, where MobileNav takes over. */
export default function Navbar() {
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-6 text-sm">
        {NAV_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-paper/80 underline-offset-4 transition-colors hover:text-paper hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
