import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import ActivityEditor from '../../../../../components/admin/ActivityEditor';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import { getDestinationOptions } from '../../../../../lib/queries/adminTrips';
import { emptyActivity } from '../../../../../types/contentEditor';

/**
 * Create an activity.
 *
 * `new` is a static segment beside `[id]`, and Next resolves static segments
 * first — the same arrangement as `/blog/category` beside `/blog/[slug]`. That
 * normally risks permanently shadowing a record, which is why `category` is on
 * the reserved slug list. It is safe here for a reason that does not
 * generalise: `[id]` matches a 24-character hex ObjectId, and `new` is not one.
 */
export const metadata: Metadata = {
  title: 'New activity',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewActivityPage() {
  if (!(await hasAdminSession())) {
    redirect('/admin/login?next=/admin/activities/new');
  }

  const destinations = await getDestinationOptions();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-muted">
          <Link href="/admin/activities" className="underline underline-offset-4">
            Activities
          </Link>
        </p>

        <div className="mt-1">
          <PageHeading
            title="New activity"
            description="Everything here is needed up front — an activity has no draft state, so it goes live as soon as it is created."
          />
        </div>
      </div>

      <ActivityEditor
        mode="create"
        initialValues={emptyActivity}
        destinations={destinations}
      />
    </div>
  );
}
