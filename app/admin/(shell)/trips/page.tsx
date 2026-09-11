import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { PageHeading, StatCard, EmptyRow } from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import { getTripsForAdmin } from '../../../../lib/queries/adminTrips';
import { formatDateTime } from '../../../../lib/adminTime';
import { tripPath } from '../../../../lib/urls';

/**
 * The trip list.
 *
 * Drafts and archived trips are included — this reads through
 * `lib/queries/adminTrips.ts`, not the public helpers, which filter to
 * published and would hide the trip an editor is halfway through writing.
 *
 * Ordered by `updatedAt`, not alphabetically. The trip someone is working on is
 * the one they want next, and with a few dozen trips a recency order finds it
 * faster than a name they would have to scan for.
 */
export const metadata: Metadata = {
  title: 'Trips',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminTripsPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/trips');

  const trips = await getTripsForAdmin();

  const published = trips.filter((trip) => trip.status === 'published').length;
  const drafts = trips.filter((trip) => trip.status === 'draft').length;
  const archived = trips.filter((trip) => trip.status === 'archived').length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Trips"
        description="Every trip, newest edit first. Drafts and archived trips are listed here and excluded from the site."
      />

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Published" value={published} note="Live on the site" />
        <StatCard label="Draft" value={drafts} note="Not visible to visitors" />
        <StatCard label="Archived" value={archived} note="Retired, not deleted" />
        <StatCard label="Total" value={trips.length} />
      </dl>

      <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="w-full min-w-3xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-paper">
              <th scope="col" className="px-4 py-3 font-semibold">Trip</th>
              <th scope="col" className="px-4 py-3 font-semibold">Where</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Price</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Days</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Last edited</th>
            </tr>
          </thead>

          <tbody>
            {trips.length === 0 && (
              <EmptyRow colSpan={6}>
                No trips yet. Seeded trips are created by{' '}
                <code className="font-mono">scripts/seed-trips.ts</code>.
              </EmptyRow>
            )}

            {trips.map((trip) => {
              const id = String(trip._id);

              return (
                <tr
                  key={id}
                  className="border-b border-hairline last:border-0 hover:bg-paper/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/trips/${id}`}
                      className="font-semibold underline underline-offset-4"
                    >
                      {trip.title}
                    </Link>
                    <span className="block font-mono text-xs text-muted">
                      /{trip.slug}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-muted">
                    {trip.destination.name}
                    {/* Null for India, Tibet and Bhutan — a real value, not a gap. */}
                    {trip.activity && (
                      <span className="block text-xs">{trip.activity.name}</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {trip.price.toLocaleString('en-US')}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {trip.durationDays}
                  </td>

                  <td className="px-4 py-3">
                    <StatusChip status={trip.status} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular text-muted">
                    {formatDateTime(trip.updatedAt)}
                    {trip.status === 'published' && (
                      <a
                        href={tripPath(trip)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block font-sans underline underline-offset-4"
                      >
                        View live
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        Creating a trip is not built. Said plainly rather than left as a missing
        button, because a "New trip" control that 404s is worse than none.
      */}
      <p className="text-sm text-muted">
        New trips are still created by the seed and migration scripts. A create
        flow needs a different screen from this one — a trip has six required
        fields before it can save at all, so the editor cannot simply open
        against a blank document.
      </p>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: 'border-confirmed/30 bg-confirmed/10 text-confirmed',
    draft: 'border-marigold/40 bg-marigold/10 text-ink',
    archived: 'border-hairline bg-paper text-muted',
  };

  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
        styles[status] ?? styles.draft
      }`}
    >
      {status}
    </span>
  );
}
