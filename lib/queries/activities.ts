import { cache } from 'react';
import { connectDB } from '../db';
import Activity, { IActivityPopulated } from '../../models/Activity';
import Trip, { ITripPopulated, TripDifficulty } from '../../models/Trip';
import Destination from '../../models/Destination';
import { nepalToday, tripFromPrice, type PricedTrip } from '../departures';

/*
 * The `Destination` import above is load-bearing twice over. It is queried
 * directly by `getDestinationSlugsWithActivities`, and it is what registers
 * the model with Mongoose so `.populate('destination')` can resolve the ref by
 * name at query time. It used to be a bare side-effect import for the second
 * reason alone; **if the direct use ever goes away, put the bare import back**
 * rather than deleting the line, or the populate starts working or throwing
 * MissingSchemaError depending on what else the render happened to import.
 */

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

/**
 * Per-activity statistics derived from that activity's published trips.
 *
 * **Everything here is derived, nothing is authored.** One `$group` over the
 * destination's published trips produces all of it, which matters at twelve
 * activities as much as at three: the alternative is one query per activity per
 * dimension.
 *
 * `$min` and `$max` skip missing values in MongoDB, so the optional fields —
 * `maxAltitudeM`, `difficulty` — simply do not contribute rather than
 * poisoning the range with nulls. An activity with no published trips gets no
 * row at all, and the caller renders dashes.
 *
 * **The price range is the exception**, and deliberately not a `$min`/`$max`
 * over `price`. What a visitor is shown for a trip is `tripFromPrice()` — the
 * lower of its cheapest upcoming departure and its cheapest private tier — so
 * an activity range built from the flat price would bracket numbers no card on
 * the site displays. The pricing inputs are pushed out of the group and the
 * range is taken in JS, from the same function every card calls.
 */
export interface ActivityStats {
  tripCount: number;
  minDuration: number | null;
  maxDuration: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  minAltitudeM: number | null;
  maxAltitudeM: number | null;
  /** Every difficulty grade that occurs, unordered. */
  difficulties: TripDifficulty[];
}

/**
 * Stats for every activity under a destination, keyed by stringified activity
 * id.
 *
 * Keys are strings because two ObjectId instances holding the same value are
 * different object references and would never match as Map keys.
 */
export const getActivityStats = cache(
  async (
    destinationId: IActivityPopulated['destination']['_id']
  ): Promise<Map<string, ActivityStats>> => {
    await connectDB();

    const rows = await Trip.aggregate<{
      _id: IActivityPopulated['_id'] | null;
      tripCount: number;
      minDuration: number | null;
      maxDuration: number | null;
      minAltitudeM: number | null;
      maxAltitudeM: number | null;
      difficulties: (TripDifficulty | null)[];
      priced: PricedTrip[];
    }>([
      { $match: { destination: destinationId, status: 'published' } },
      {
        $group: {
          _id: '$activity',
          tripCount: { $sum: 1 },
          minDuration: { $min: '$durationDays' },
          maxDuration: { $max: '$durationDays' },
          priced: {
            $push: {
              price: '$price',
              durationDays: '$durationDays',
              groupPricing: '$groupPricing',
              departureSeasons: '$departureSeasons',
            },
          },
          minAltitudeM: { $min: '$maxAltitudeM' },
          maxAltitudeM: { $max: '$maxAltitudeM' },
          difficulties: { $addToSet: '$difficulty' },
        },
      },
    ]);

    // One Pokhara date for every activity in this listing.
    const today = nepalToday();

    return new Map(
      rows
        .filter((row) => row._id !== null)
        .map((row) => {
          const fromPrices = row.priced.map((trip) => tripFromPrice(trip, today));

          return [
          String(row._id),
          {
            tripCount: row.tripCount,
            minDuration: row.minDuration ?? null,
            maxDuration: row.maxDuration ?? null,
            minPrice: fromPrices.length > 0 ? Math.min(...fromPrices) : null,
            maxPrice: fromPrices.length > 0 ? Math.max(...fromPrices) : null,
            minAltitudeM: row.minAltitudeM ?? null,
            maxAltitudeM: row.maxAltitudeM ?? null,
            // A trip with no difficulty contributes nothing rather than a null
            // that would render as an empty grade.
            difficulties: row.difficulties.filter(
              (grade): grade is TripDifficulty => grade != null
            ),
          },
        ] as const;
        })
    );
  }
);

/** Destination slugs that actually have an activity layer, for the listing. */
export async function getDestinationSlugsWithActivities(): Promise<string[]> {
  await connectDB();

  const destinations = await Destination.find({ hasActivities: true })
    .select('slug')
    .sort({ displayOrder: 1 })
    .lean<{ slug: string }[]>()
    .exec();

  return destinations.map((destination) => destination.slug);
}
