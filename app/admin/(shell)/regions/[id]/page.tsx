import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';

import RegionEditor from '../../../../../components/admin/RegionEditor';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import {
  getRegionForEdit,
  countTripsForRegion,
  getRegionLivePaths,
} from '../../../../../lib/queries/adminContent';
import { getDestinationOptions } from '../../../../../lib/queries/adminTrips';
import { toRegionValues } from '../../../../../types/contentEditor';

/**
 * Edit one region.
 *
 * A Server Component that reads and hands plain objects to the Client
 * Component doing the editing — so no ObjectId and no Date crosses the
 * boundary, and Mongoose stays on the server.
 *
 * `livePaths` is read here rather than derived in the editor because there is
 * no formula for it: a region's pages are whichever (activity, region) pairs
 * have published trips, which only the database knows.
 */
export const metadata: Metadata = {
  title: 'Edit region',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminRegionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await hasAdminSession())) {
    redirect(`/admin/login?next=/admin/regions/${id}`);
  }

  // Independent reads, so they run together rather than in sequence.
  const [region, destinations, tripCount, livePaths] = await Promise.all([
    getRegionForEdit(id),
    getDestinationOptions(),
    countTripsForRegion(id),
    getRegionLivePaths(id),
  ]);

  /*
   * `notFound()`, not a redirect. Unlike a missing session this is not
   * something signing in would fix — the id is wrong or the record is gone.
   */
  if (!region) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted">
          <Link href="/admin/regions" className="underline underline-offset-4">
            Regions
          </Link>
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-display">
          {region.name}
        </h1>
      </div>

      <RegionEditor
        mode="edit"
        id={String(region._id)}
        initialValues={toRegionValues(region)}
        destinations={destinations}
        updatedAt={new Date(region.updatedAt).toISOString()}
        slugHistory={[...(region.slugHistory ?? [])]}
        tripCount={tripCount}
        livePaths={livePaths}
      />
    </div>
  );
}
