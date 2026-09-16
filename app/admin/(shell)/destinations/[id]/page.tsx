import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';

import DestinationEditor from '../../../../../components/admin/DestinationEditor';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import {
  getDestinationForEdit,
  countTripsForDestination,
  countActivitiesForDestination,
} from '../../../../../lib/queries/adminContent';
import { toDestinationValues } from '../../../../../types/contentEditor';

/**
 * Edit one destination.
 *
 * A Server Component that reads and hands plain objects to the Client Component
 * that does the editing — so no ObjectId and no Date crosses the boundary, and
 * Mongoose stays on the server.
 *
 * The trip and activity counts are read here so the editor can say what a
 * rename will move. That is the most consequential edit on the screen and the
 * one whose blast radius is least obvious from the form.
 */
export const metadata: Metadata = {
  title: 'Edit destination',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminDestinationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await hasAdminSession())) {
    redirect(`/admin/login?next=/admin/destinations/${id}`);
  }

  /*
   * Independent reads, so they run together. Each handles a malformed id on its
   * own — otherwise a rejected count would take the page down with a 500 while
   * the lookup beside it was heading for a clean 404.
   */
  const [destination, tripCount, activityCount] = await Promise.all([
    getDestinationForEdit(id),
    countTripsForDestination(id),
    countActivitiesForDestination(id),
  ]);

  /*
   * `notFound()`, not a redirect. Unlike a missing session this is not
   * something signing in would fix — the id is wrong — and bouncing to the list
   * would make the click look like it did nothing.
   */
  if (!destination) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted">
          <Link href="/admin/destinations" className="underline underline-offset-4">
            Destinations
          </Link>
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-display">
          {destination.name}
        </h1>
        <p className="mt-2 text-sm text-muted">
          <a
            href={`/${destination.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            View live
          </a>
        </p>
      </div>

      <DestinationEditor
        id={String(destination._id)}
        initialValues={toDestinationValues(destination)}
        hasActivities={destination.hasActivities}
        updatedAt={new Date(destination.updatedAt).toISOString()}
        slugHistory={[...(destination.slugHistory ?? [])]}
        tripCount={tripCount}
        activityCount={activityCount}
      />
    </div>
  );
}
