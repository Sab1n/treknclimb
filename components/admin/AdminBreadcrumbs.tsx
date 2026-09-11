'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { segmentLabel } from '../../lib/adminNav';

/**
 * The admin breadcrumb trail, derived from the URL.
 *
 * **Not the same component as `components/ui/Breadcrumbs.tsx`, on purpose.**
 * That one emits `BreadcrumbList` JSON-LD, which exists to tell Google how a
 * page sits in the site. Admin pages are noindex and disallowed in robots.txt,
 * so structured data here would be markup describing a hierarchy no crawler is
 * allowed to see — and the JSON-LD would carry an inquiry's id.
 *
 * The trail is derived from the path rather than passed in by each page,
 * because it lives in the layout and a layout cannot read its child's props.
 * The tradeoff is real: `/admin/inquiries/68f2…` renders as
 * Admin / Booking inquiries / Inquiry, not the reference number, because the
 * shell has not read that document and should not read it a second time to
 * label a breadcrumb. The page itself shows the reference in its heading.
 */
export default function AdminBreadcrumbs() {
  const pathname = usePathname();

  const segments = pathname.split('/').filter(Boolean);

  // Just /admin: the trail would be a single item naming the page you are on.
  if (segments.length <= 1) return null;

  const crumbs = segments.map((segment, index) => ({
    label: segmentLabel(segment, segments[index - 1]),
    href: `/${segments.slice(0, index + 1).join('/')}`,
    last: index === segments.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        {crumbs.map((crumb) => (
          <li key={crumb.href} className="flex items-center gap-x-2">
            {crumb.href !== `/${segments[0]}` && (
              <span aria-hidden="true" className="text-hairline">
                /
              </span>
            )}

            {crumb.last ? (
              <span aria-current="page" className="text-ink">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="underline-offset-4 hover:text-ink hover:underline"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
