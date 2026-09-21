import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import {
  PageHeading,
  ButtonLink,
  EmptyRow,
} from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import { getRegionsForAdmin } from '../../../../lib/queries/adminContent';
import { formatDateTime } from '../../../../lib/adminTime';
import { connectDB } from '../../../../lib/db';
import Trip from '../../../../models/Trip';

export const metadata: Metadata = {
  title: 'Regions',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The region list.
 *
 * Shows **which activities** each region renders under, not a single URL. A
 * region has one page per activity with published trips in it, and that set is
 * the thing an admin actually needs to see: it is how "Everest has a trekking
 * page and a peak-climbing page" becomes visible without opening anything.
 *
 * Both counts come from one aggregation. Each separate `countDocuments` would
 * be its own round trip to Atlas in Mumbai, and this page is `force-dynamic` —
 * it pays them on every load.
 */
export default async function AdminRegionsPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/regions');

  const regions = await getRegionsForAdmin();

  await connectDB();

  const rows = await Trip.aggregate<{
    _id: { region: unknown; activity: unknown };
    total: number;
    published: number;
  }>([
    { $match: { region: { $ne: null } } },
    {
      $group: {
        _id: { region: '$region', activity: '$activity' },
        total: { $sum: 1 },
        published: {
          $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] },
        },
      },
    },
  ]);

  // Activity names, for the "renders under" column.
  const Activity = (await import('../../../../models/Activity')).default;

  const activities = await Activity.find()
    .select('_id name')
    .lean<{ _id: unknown; name: string }[]>();

  const activityNames = new Map(
    activities.map((activity) => [String(activity._id), activity.name])
  );

  /** Total trips per region, and the activities with published ones. */
  const tripTotals = new Map<string, number>();
  const activitiesByRegion = new Map<string, string[]>();

  for (const row of rows) {
    const regionId = String(row._id.region);

    tripTotals.set(regionId, (tripTotals.get(regionId) ?? 0) + row.total);

    if (row.published > 0 && row._id.activity) {
      const name = activityNames.get(String(row._id.activity));
      if (!name) continue;

      activitiesByRegion.set(regionId, [
        ...(activitiesByRegion.get(regionId) ?? []),
        name,
      ]);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Regions"
        description="The geography a trekker searches by — Everest, Annapurna, Langtang, Manaslu. A region belongs to a destination, but its pages render under an activity, so it has one page per activity that has trips in it."
        actions={<ButtonLink href="/admin/regions/new">New region</ButtonLink>}
      />

      <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="w-full min-w-3xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-paper">
              <th scope="col" className="px-4 py-3 font-semibold">
                Region
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Destination
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Pages under
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
            {regions.length === 0 && (
              <EmptyRow colSpan={6}>
                No regions yet.{' '}
                <Link
                  href="/admin/regions/new"
                  className="underline underline-offset-4"
                >
                  Create the first one
                </Link>
                .
              </EmptyRow>
            )}

            {regions.map((region) => {
              const id = String(region._id);
              const trips = tripTotals.get(id) ?? 0;
              const under = activitiesByRegion.get(id) ?? [];

              return (
                <tr
                  key={id}
                  className="border-b border-hairline last:border-0 hover:bg-paper/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/regions/${id}`}
                      className="font-semibold underline underline-offset-4"
                    >
                      {region.name}
                    </Link>
                    <span className="block font-mono text-xs text-muted">
                      /{region.destination.slug}/&lt;activity&gt;/region/
                      {region.slug}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-muted">
                    {region.destination.name}
                  </td>

                  <td className="px-4 py-3 text-muted">
                    {under.length > 0 ? (
                      under.join(', ')
                    ) : (
                      <span className="text-xs">no live page</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {trips}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {region.displayOrder}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular text-muted">
                    {formatDateTime(region.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="max-w-prose text-sm text-muted">
        A region appears on a page only once a trip is filed under it, and it
        appears under whichever activity that trip belongs to. Nothing is
        limited to trekking — set the region on a peak climb and a
        peak-climbing region page appears.
      </p>
    </div>
  );
}
