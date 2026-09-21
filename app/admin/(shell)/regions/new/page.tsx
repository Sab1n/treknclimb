import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import RegionEditor from '../../../../../components/admin/RegionEditor';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import { getDestinationOptions } from '../../../../../lib/queries/adminTrips';
import { emptyRegion } from '../../../../../types/contentEditor';

/**
 * Create a region.
 *
 * `new` is a static segment beside `[id]`, and Next resolves static segments
 * first. That normally risks permanently shadowing a record — it is why
 * `category` and `region` are on the reserved slug list — but it is safe here
 * for a reason that does not generalise: `[id]` matches a 24-character hex
 * ObjectId, and `new` is not one.
 */
export const metadata: Metadata = {
  title: 'New region',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewRegionPage() {
  if (!(await hasAdminSession())) {
    redirect('/admin/login?next=/admin/regions/new');
  }

  const destinations = await getDestinationOptions();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-muted">
          <Link href="/admin/regions" className="underline underline-offset-4">
            Regions
          </Link>
        </p>

        <div className="mt-1">
          <PageHeading
            title="New region"
            description="Creating a region publishes nothing on its own — it has no page until a trip is filed under it, and then it appears under that trip's activity."
          />
        </div>
      </div>

      <RegionEditor
        mode="create"
        initialValues={emptyRegion}
        destinations={destinations}
      />
    </div>
  );
}
