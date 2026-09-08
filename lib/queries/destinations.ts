import { cache } from 'react';
import { connectDB } from '../db';
import Destination, { IDestination } from '../../models/Destination';
import Activity, { IActivity } from '../../models/Activity';
import Trip from '../../models/Trip';

/**
 * Destination reads.
 *
 * Destination has no reference fields, so there is nothing to populate — these
 * are plain reads that still live here so every page fetches through one place.
 */

/** An activity plus the number of published trips under it. */
export interface IActivityWithTripCount extends IActivity {
  tripCount: number;
}

/**
 * Wrapped in React's `cache()`, which memoises the result for the duration of
 * a single server render.
 *
 * This matters because `generateMetadata` and the page component both need the
 * same destination. Next.js deduplicates repeated `fetch()` calls on its own,
 * but it has no idea what a Mongoose query is — without `cache()` this would be
 * two round trips to Atlas for one page. The cache is per-request, so different
 * slugs and later renders are unaffected.
 */
export const getDestinationBySlug = cache(
  async (slug: string): Promise<IDestination | null> => {
    await connectDB();

    return Destination.findOne({ slug }).lean<IDestination>().exec();
  }
);

/**
 * All four destinations in display order, for the overview page.
 *
 * `cache()` again: the page body and its JSON-LD both need this list, and
 * without it that is two identical round trips to Atlas per render.
 */
export const getAllDestinations = cache(
  async (): Promise<IDestination[]> => {
    await connectDB();

    return Destination.find()
      .sort({ displayOrder: 1, name: 1 })
      .lean<IDestination[]>()
      .exec();
  }
);

/**
 * Published trip counts for every destination at once, keyed by destination id.
 *
 * Derived, never stored — a counter column on Destination would be one more
 * thing to keep in sync on every publish, unpublish and delete. One `$group`
 * covers all four destinations, so the overview page pays for one query rather
 * than one per card.
 *
 * The keys are stringified ObjectIds, because two ObjectId instances holding
 * the same value are different object references and would never match as Map
 * keys.
 */
export const getTripCountsByDestination = cache(
  async (): Promise<Map<string, number>> => {
    await connectDB();

    const rows = await Trip.aggregate<{
      _id: IDestination['_id'];
      count: number;
    }>([
      { $match: { status: 'published' } },
      { $group: { _id: '$destination', count: { $sum: 1 } } },
    ]);

    return new Map(rows.map((row) => [String(row._id), row.count]));
  }
);

/** The four slugs, for `generateStaticParams`. */
export async function getAllDestinationSlugs(): Promise<string[]> {
  await connectDB();

  const destinations = await Destination.find()
    .select('slug')
    .sort({ displayOrder: 1 })
    .lean<{ slug: string }[]>()
    .exec();

  return destinations.map((d) => d.slug);
}

/**
 * Activities under a destination, each with its published-trip count.
 *
 * Returns `[]` for destinations without an activity layer — India, Tibet and
 * Bhutan simply have no activity documents, so this needs no special case.
 *
 * The counts come from one aggregation rather than one query per activity: a
 * `$match` narrows to this destination's published trips, `$group` counts them
 * by activity id. Four activities would otherwise be four extra round trips.
 */
export async function getActivitiesForDestination(
  destinationId: IDestination['_id']
): Promise<IActivityWithTripCount[]> {
  await connectDB();

  const [activities, counts] = await Promise.all([
    Activity.find({ destination: destinationId })
      .sort({ displayOrder: 1, name: 1 })
      .lean<IActivity[]>()
      .exec(),
    Trip.aggregate<{ _id: IActivity['_id'] | null; count: number }>([
      { $match: { destination: destinationId, status: 'published' } },
      { $group: { _id: '$activity', count: { $sum: 1 } } },
    ]),
  ]);

  const countByActivity = new Map(
    counts.map((row) => [String(row._id), row.count])
  );

  return activities.map((activity) => ({
    ...activity,
    tripCount: countByActivity.get(String(activity._id)) ?? 0,
  }));
}

/** Published trips in a destination, for the "N trips" counter. */
export async function getPublishedTripCount(
  destinationId: IDestination['_id']
): Promise<number> {
  await connectDB();

  return Trip.countDocuments({
    destination: destinationId,
    status: 'published',
  }).exec();
}
