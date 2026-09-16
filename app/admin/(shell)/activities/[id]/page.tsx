import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';

import ActivityEditor from '../../../../../components/admin/ActivityEditor';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import {
  getActivityForEdit,
  countTripsForActivity,
} from '../../../../../lib/queries/adminContent';
import { getDestinationOptions } from '../../../../../lib/queries/adminTrips';
import { toActivityValues } from '../../../../../types/contentEditor';

/**
 * Edit one activity.
 *
 * A Server Component that reads and hands plain objects to the Client Component
 * doing the editing — so no ObjectId and no Date crosses the boundary, and
 * Mongoose stays on the server.
 *
 * The trip count is read here because it decides two things the form has to
 * say: how many pages a rename will move, and whether deletion is possible at
 * all.
 */
export const metadata: Metadata = {
  title: 'Edit activity',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await hasAdminSession())) {
    redirect(`/admin/login?next=/admin/activities/${id}`);
  }

  // Independent reads, so they run together rather than in sequence.
  const [activity, destinations, tripCount] = await Promise.all([
    getActivityForEdit(id),
    getDestinationOptions(),
    countTripsForActivity(id),
  ]);

  /*
   * `notFound()`, not a redirect. Unlike a missing session this is not
   * something signing in would fix — the id is wrong or the record is gone.
   */
  if (!activity) notFound();

  const destination = destinations.find(
    (option) => option.id === String(activity.destination)
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted">
          <Link href="/admin/activities" className="underline underline-offset-4">
            Activities
          </Link>
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-display">
          {activity.name}
        </h1>
        {destination && (
          <p className="mt-2 text-sm text-muted">
            <a
              href={`/${destination.slug}/${activity.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              View live
            </a>
          </p>
        )}
      </div>

      <ActivityEditor
        mode="edit"
        id={String(activity._id)}
        initialValues={toActivityValues(activity)}
        destinations={destinations}
        updatedAt={new Date(activity.updatedAt).toISOString()}
        slugHistory={[...(activity.slugHistory ?? [])]}
        tripCount={tripCount}
      />
    </div>
  );
}
