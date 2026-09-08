import { cache } from 'react';
import { connectDB } from '../db';
import Activity, { IActivityPopulated } from '../../models/Activity';
import Trip, { ITripPopulated } from '../../models/Trip';

/*
 * Side-effect import: `.populate('destination')` below resolves the ref by
 * model name at query time, and a model only registers with Mongoose when its
 * module is first imported. Without this line the populate works or throws
 * MissingSchemaError depending on what else the render happened to import.
 */
import '../../models/Destination';

/**
 * One activity by slug, with its destination populated.
 *
 * The activity page at `/nepal/[activity]` needs `activity.destination.slug`
 * to build its breadcrumb and to confirm the URL's destination segment matches
 * the activity's actual parent — so this read is always populated.
 *
 * `cache()` because `generateMetadata` and the page body both call it.
 */
export const getActivityBySlug = cache(
  async (slug: string): Promise<IActivityPopulated | null> => {
    await connectDB();

    return Activity.findOne({ slug })
      .populate('destination')
      .lean<IActivityPopulated>()
      .exec();
  }
);

/** Published trips under one activity, in the admin's order. */
export async function getTripsByActivity(
  activityId: IActivityPopulated['_id']
): Promise<ITripPopulated[]> {
  await connectDB();

  return Trip.find({ activity: activityId, status: 'published' })
    .sort({ featured: -1, displayOrder: 1, title: 1 })
    .populate('destination')
    .populate('activity')
    .lean<ITripPopulated[]>()
    .exec();
}

/** Destination and activity slug pairs, for `generateStaticParams`. */
export async function getActivityRoutes(): Promise<
  { destinationSlug: string; activitySlug: string }[]
> {
  await connectDB();

  const activities = await Activity.find()
    .select('slug destination')
    .populate('destination', 'slug')
    .lean<IActivityPopulated[]>()
    .exec();

  return activities.map((activity) => ({
    destinationSlug: activity.destination.slug,
    activitySlug: activity.slug,
  }));
}
