import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import CreateTripForm from '../../../../../components/admin/trip/CreateTripForm';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import {
  getDestinationOptions,
  getActivityOptions,
} from '../../../../../lib/queries/adminTrips';

/**
 * The create-a-trip screen.
 *
 * ## `new` is a static segment beside `[id]`
 *
 * `app/admin/(shell)/trips/new/` sits next to `trips/[id]/`, and Next resolves
 * static segments before dynamic ones — the same arrangement as
 * `/blog/category` beside `/blog/[slug]`. That normally comes with the risk of
 * permanently shadowing a real record, which is why `category` is on the
 * reserved slug list. It does not apply here: `[id]` matches a MongoDB
 * ObjectId, which is always 24 hex characters, and `new` is not one. No trip
 * can ever be unreachable because of this route.
 *
 * A Server Component that reads and hands plain objects to the Client
 * Component that does the typing — so no ObjectId crosses the boundary, and
 * Mongoose stays on the server.
 */
export const metadata: Metadata = {
  title: 'New trip',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewTripPage() {
  // Checked here, independently of the layout — a layout cannot guard its
  // pages, and this is where tokenVersion revocation is enforced.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/trips/new');

  // Independent reads, so they run together rather than in sequence.
  const [destinations, activities] = await Promise.all([
    getDestinationOptions(),
    getActivityOptions(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-muted">
          <Link href="/admin/trips" className="underline underline-offset-4">
            Trips
          </Link>
        </p>

        <div className="mt-1">
          <PageHeading
            title="New trip"
            description="Just enough to save a valid draft. Everything else — description, itinerary, images, pricing tiers — is filled in afterwards in the full editor."
          />
        </div>
      </div>

      <CreateTripForm destinations={destinations} activities={activities} />
    </div>
  );
}
