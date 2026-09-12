import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import {
  PageHeading,
  StatCard,
  EmptyRow,
  ButtonLink,
} from '../../../../components/admin/ui';
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
        actions={<ButtonLink href="/admin/trips/new">New trip</ButtonLink>}
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
                No trips yet.{' '}
                <Link
                  href="/admin/trips/new"
                  className="underline underline-offset-4"
                >
                  Create the first one
                </Link>
                .
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
        A trip cannot be created from the editor — five of its required fields
        cannot exist yet, the cover image least of all, since an upload
        signature is derived from a trip that already exists. Hence a separate
        create screen rather than the editor opened against a blank document.
      */}
      <p className="text-sm text-muted">
        New trips are created as drafts and are invisible on the site until
        published.
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
