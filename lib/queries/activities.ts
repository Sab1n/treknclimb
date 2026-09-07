import { connectDB } from '../db';
import Activity, { IActivityPopulated } from '../../models/Activity';

/**
 * One activity by slug, with its destination populated.
 *
 * The activity page at `/nepal/[activity]` needs `activity.destination.slug`
 * to build its breadcrumb and to confirm the URL's destination segment matches
 * the activity's actual parent — so this read is always populated.
 *
 * Same caveat as the trip helpers: `.lean<IActivityPopulated>()` is an
 * assertion the compiler takes on trust, which is why it lives here and not at
 * the call site.
 */
export async function getActivityBySlug(
  slug: string
): Promise<IActivityPopulated | null> {
  await connectDB();

  return Activity.findOne({ slug })
    .populate('destination')
    .lean<IActivityPopulated>()
    .exec();
}
