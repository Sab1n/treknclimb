import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';

import TripEditor from '../../../../../components/admin/TripEditor';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import {
  getTripForEdit,
  getDestinationOptions,
  getActivityOptions,
  getRegionOptions,
} from '../../../../../lib/queries/adminTrips';
import {
  toTripEditorValues,
  toTripEditorMeta,
} from '../../../../../types/tripEditor';

/**
 * The trip editor page.
 *
 * A Server Component that does the reading and hands plain objects to the
 * Client Component that does the editing. That split is what keeps Mongoose on
 * the server: the editor receives `TripEditorValues`, never an `ITrip`, so no
 * ObjectId and no Date crosses the boundary — React cannot serialize either.
 *
 * Three reads in parallel rather than in sequence. They do not depend on each
 * other, and this page is `force-dynamic`, so it pays the Atlas round trip on
 * every load.
 */
export const metadata: Metadata = {
  title: 'Edit trip',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminTripEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await hasAdminSession())) {
    redirect(`/admin/login?next=/admin/trips/${id}`);
  }

  const [trip, destinations, activities, regions] = await Promise.all([
    getTripForEdit(id),
    getDestinationOptions(),
    getActivityOptions(),
    getRegionOptions(),
  ]);

  /*
   * `notFound()`, not a redirect. Unlike a missing session this is not
   * something signing in would fix — the id is wrong or the trip is gone — and
   * bouncing to the list would make the click look like it did nothing.
   */
  if (!trip) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted">
          <Link href="/admin/trips" className="underline underline-offset-4">
            Trips
          </Link>
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-display">
          {trip.title}
        </h1>
      </div>

      <TripEditor
        initialValues={toTripEditorValues(trip)}
        meta={toTripEditorMeta(trip)}
        destinations={destinations}
        activities={activities}
        regions={regions}
      />
    </div>
  );
}
