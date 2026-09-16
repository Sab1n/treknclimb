import Link from 'next/link';
import { jsonLdScript } from '../../lib/jsonLd';

export interface Crumb {
  label: string;
  /** Omitted on the current page, which is not a link. */
  href?: string;
}

/**
 * The visible breadcrumb trail and its BreadcrumbList JSON-LD, emitted
 * together from one array so the markup can never drift from what the visitor
 * sees — which is what Google requires of breadcrumb structured data.
 */
export default function Breadcrumbs({
  crumbs,
  baseUrl = 'https://treknclimb.com',
}: {
  crumbs: Crumb[];
  baseUrl?: string;
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      ...(crumb.href ? { item: `${baseUrl}${crumb.href}` } : {}),
    })),
  };

  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          {crumbs.map((crumb, index) => (
            <li key={crumb.label} className="flex items-center gap-x-2">
              {index > 0 && (
                <span aria-hidden="true" className="text-hairline">
                  /
                </span>
              )}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="underline-offset-4 hover:text-ink hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-ink" aria-current="page">
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
    </>
  );
}
