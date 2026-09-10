import { cache } from 'react';
import { connectDB } from '../db';
import Trip, { ITripPopulated } from '../../models/Trip';
import Destination from '../../models/Destination';

/*
 * Side-effect import. `.populate('activity')` resolves the ref by model *name*
 * at query time, so the Activity model has to have been registered with
 * Mongoose by then — and a model registers when its module is first imported.
 * Nothing here uses the Activity binding, so importing it bare is the whole
 * point: without this line, populate throws
 * "MissingSchemaError: Schema hasn't been registered for model Activity"
 * only on the pages that happen not to import it some other way.
 */
import '../../models/Activity';

/**
 * Typed helpers for populated trip reads.
 *
 * `.lean<ITripPopulated>()` is an assertion, not a check — nothing verifies
 * that `.populate()` was actually called, so a forgotten populate compiles
 * cleanly and then blows up at runtime on `trip.destination.name`. Keeping the
 * assertion in here means there is exactly one place where the populate call
 * and the type claim can disagree, instead of one per page.
 *
 * These run inside server components, so each connects first. There is no
 * route handler in front of them to do it.
 *
 * Published-only: draft and archived content stays off the site and out of the
 * sitemap. Admin previews will need their own helpers.
 */

/** One trip by slug, with its destination and activity populated. */
export async function getTripBySlug(
  slug: string
): Promise<ITripPopulated | null> {
  await connectDB();

  return Trip.findOne({ slug, status: 'published' })
    .populate('destination')
    .populate('activity')
    .lean<ITripPopulated>()
    .exec();
}

/**
 * Every published trip in a destination, ordered by `displayOrder` then title.
 *
 * Takes the destination *slug*, because that is what the route params give you
 * — `/nepal` and `/india/[trip]` both carry a slug, never an id.
 *
 * Returns `[]` for an unknown slug rather than throwing: an empty listing is a
 * page that renders an empty state. Check the destination itself if you need
 * to tell "no trips yet" apart from "no such destination".
 */
export async function getTripsByDestination(
  destinationSlug: string,
  options: { limit?: number } = {}
): Promise<ITripPopulated[]> {
  await connectDB();

  const destination = await Destination.findOne({ slug: destinationSlug })
    .select('_id')
    .lean();

  if (!destination) return [];

  // Featured first, then the admin's manual order. A destination page shows a
  // shortlist; the full listing passes no limit.
  const query = Trip.find({ destination: destination._id, status: 'published' })
    .sort({ featured: -1, displayOrder: 1, title: 1 })
    .populate('destination')
    .populate('activity');

  if (options.limit) query.limit(options.limit);

  return query.lean<ITripPopulated[]>().exec();
}

/**
 * One published trip by slug, with destination and activity populated.
 *
 * `cache()` because `generateMetadata` and the page body both need it and
 * Mongoose queries are not deduplicated by Next the way `fetch` is.
 */
export const getTripBySlugCached = cache(
  async (slug: string): Promise<ITripPopulated | null> => {
    await connectDB();

    return Trip.findOne({ slug, status: 'published' })
      .populate('destination')
      .populate('activity')
      .lean<ITripPopulated>()
      .exec();
  }
);

/**
 * Every published trip's route parts, for `generateStaticParams` on both trip
 * route shapes.
 *
 * `activitySlug` is null for India, Tibet and Bhutan — the caller filters on it
 * to decide which of the two routes a trip belongs to.
 */
export async function getPublishedTripRoutes(): Promise<
  { destinationSlug: string; activitySlug: string | null; tripSlug: string }[]
> {
  await connectDB();

  const trips = await Trip.find({ status: 'published' })
    .select('slug destination activity')
    .populate('destination', 'slug')
    .populate('activity', 'slug')
    .lean<ITripPopulated[]>()
    .exec();

  return trips.map((trip) => ({
    destinationSlug: trip.destination.slug,
    activitySlug: trip.activity ? trip.activity.slug : null,
    tripSlug: trip.slug,
  }));
}

/**
 * Related trips for the detail page.
 *
 * Uses the admin's hand-picked `relatedTrips` when there are any. Otherwise
 * falls back to SRS §5.6's rule — same activity, else same destination —
 * excluding the trip itself.
 */
export async function getRelatedTrips(
  trip: ITripPopulated,
  limit = 3
): Promise<ITripPopulated[]> {
  await connectDB();

  if (trip.relatedTrips.length > 0) {
    return Trip.find({ _id: { $in: trip.relatedTrips }, status: 'published' })
      .populate('destination')
      .populate('activity')
      .lean<ITripPopulated[]>()
      .exec();
  }

  const scope = trip.activity
    ? { activity: trip.activity._id }
    : { destination: trip.destination._id };

  return Trip.find({ ...scope, status: 'published', _id: { $ne: trip._id } })
    .sort({ featured: -1, displayOrder: 1 })
    .limit(limit)
    .populate('destination')
    .populate('activity')
    .lean<ITripPopulated[]>()
    .exec();
}

/**
 * Every published trip, populated, for the /trips listing.
 *
 * The whole catalogue in one query: the page is statically generated and does
 * the filtering in the browser, so there is no per-request work to spread out.
 */
export async function getAllPublishedTrips(): Promise<ITripPopulated[]> {
  await connectDB();

  return Trip.find({ status: 'published' })
    .sort({ featured: -1, displayOrder: 1, title: 1 })
    .populate('destination')
    .populate('activity')
    .lean<ITripPopulated[]>()
    .exec();
}

/**
 * The trips flagged `featured`, for the homepage.
 *
 * Editorially chosen, not derived — `featured` is a boolean the admin sets, so
 * the client decides what leads the homepage rather than a popularity
 * heuristic inventing an answer. Returns `[]` when nothing is flagged, and the
 * homepage falls back to the top of the ordinary listing order rather than
 * dropping the section.
 */
export async function getFeaturedTrips(limit = 3): Promise<ITripPopulated[]> {
  await connectDB();

  return Trip.find({ status: 'published', featured: true })
    .sort({ displayOrder: 1, title: 1 })
    .limit(limit)
    .populate('destination')
    .populate('activity')
    .lean<ITripPopulated[]>()
    .exec();
}
