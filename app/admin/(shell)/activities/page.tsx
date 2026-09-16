import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import {
  PageHeading,
  ButtonLink,
  EmptyRow,
} from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import { getActivitiesForAdmin } from '../../../../lib/queries/adminContent';
import { formatDateTime } from '../../../../lib/adminTime';
import { connectDB } from '../../../../lib/db';
import Trip from '../../../../models/Trip';

export const metadata: Metadata = {
  title: 'Activities',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The activity list.
 *
 * Trip counts are read here rather than only on the edit screen, because they
 * are what makes the list useful: an activity with no trips renders an empty
 * page, and an activity with several cannot be deleted.
 */
export default async function AdminActivitiesPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/activities');

  const activities = await getActivitiesForAdmin();

  await connectDB();

  /*
   * One aggregation rather than a count per activity. Each of those is a
   * separate round trip to Atlas in Mumbai, and this page is `force-dynamic` —
   * it pays them on every single load.
   */
  const counts = await Trip.aggregate<{ _id: unknown; count: number }>([
    { $match: { activity: { $ne: null } } },
    { $group: { _id: '$activity', count: { $sum: 1 } } },
  ]);

  const tripCounts = new Map(counts.map((row) => [String(row._id), row.count]));

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Activities"
        description="The layer between a destination and its trips. Only destinations with an activity layer can hold them — today that is Nepal alone."
        actions={<ButtonLink href="/admin/activities/new">New activity</ButtonLink>}
      />

      <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="w-full min-w-3xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-paper">
              <th scope="col" className="px-4 py-3 font-semibold">
                Activity
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Destination
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Trips
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Order
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Last edited
              </th>
            </tr>
          </thead>

          <tbody>
            {activities.length === 0 && (
              <EmptyRow colSpan={5}>
                No activities yet.{' '}
                <Link
                  href="/admin/activities/new"
                  className="underline underline-offset-4"
                >
                  Create the first one
                </Link>
                .
              </EmptyRow>
            )}

            {activities.map((activity) => {
              const id = String(activity._id);
              const trips = tripCounts.get(id) ?? 0;

              return (
                <tr
                  key={id}
                  className="border-b border-hairline last:border-0 hover:bg-paper/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/activities/${id}`}
                      className="font-semibold underline underline-offset-4"
                    >
                      {activity.name}
                    </Link>
                    <span className="block font-mono text-xs text-muted">
                      /{activity.destination.slug}/{activity.slug}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-muted">
                    {activity.destination.name}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {trips}
                    {trips === 0 && (
                      <span className="ml-2 font-sans text-xs text-muted">
                        empty page
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {activity.displayOrder}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular text-muted">
                    {formatDateTime(activity.updatedAt)}
                    <a
                      href={`/${activity.destination.slug}/${activity.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block font-sans underline underline-offset-4"
                    >
                      View live
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="max-w-prose text-sm text-muted">
        Activities have no draft state — creating one publishes it immediately.
        Deleting one is refused while any trip still belongs to it.
      </p>
    </div>
  );
}
