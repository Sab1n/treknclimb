import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { PageHeading } from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import { getDestinationsForAdmin } from '../../../../lib/queries/adminContent';
import { formatDateTime } from '../../../../lib/adminTime';

/**
 * The destination list.
 *
 * **No "New destination" button, and no delete control anywhere.** The four
 * destinations are seeded once and edit-only; the routes that would create or
 * delete one do not exist rather than existing and refusing.
 *
 * That is not tidiness. Deleting a destination would orphan every trip and
 * activity beneath it — their refs would point at nothing, `.populate()` would
 * return null, and trip pages would throw on `destination.slug` at build time,
 * months later, on pages that had been fine.
 */
export const metadata: Metadata = {
  title: 'Destinations',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminDestinationsPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/destinations');

  const destinations = await getDestinationsForAdmin();

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Destinations"
        description="Four fixed records, edit only. They cannot be created or deleted here — every trip and activity hangs off one of them."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {destinations.map((destination) => (
          <Link
            key={String(destination._id)}
            href={`/admin/destinations/${String(destination._id)}`}
            className="rounded-lg border border-hairline bg-white p-5 transition-colors hover:border-ink"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-lg font-extrabold tracking-display">
                {destination.name}
              </span>
              <span className="font-mono text-xs text-muted">
                /{destination.slug}
              </span>
            </div>

            <p className="mt-2 line-clamp-2 text-sm text-muted">
              {destination.description}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              {/*
                The asymmetry, stated on the card. It decides the URL shape and
                the trip editor's behaviour, so it is the most useful single
                fact about a destination.
              */}
              <span
                className={`rounded-full border px-2.5 py-0.5 font-semibold ${
                  destination.hasActivities
                    ? 'border-ink/20 bg-ink/5 text-ink'
                    : 'border-hairline bg-paper'
                }`}
              >
                {destination.hasActivities ? 'Has activities' : 'No activity layer'}
              </span>

              <span className="font-mono tabular">
                {formatDateTime(destination.updatedAt)}
              </span>

              {destination.noIndex && (
                <span className="font-semibold text-error">noindex</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <p className="max-w-prose text-sm text-muted">
        The set is closed by design. Adding a fifth destination is a schema and
        content decision rather than a form submission — it needs seed data, a
        cover image, comparison labels and a decision about whether it has an
        activity layer, and that last one cannot be changed afterwards without
        migrating every trip beneath it.
      </p>
    </div>
  );
}
