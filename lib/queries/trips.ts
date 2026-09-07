import { connectDB } from '../db';
import Trip, { ITripPopulated } from '../../models/Trip';
import Destination from '../../models/Destination';

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
  destinationSlug: string
): Promise<ITripPopulated[]> {
  await connectDB();

  const destination = await Destination.findOne({ slug: destinationSlug })
    .select('_id')
    .lean();

  if (!destination) return [];

  return Trip.find({ destination: destination._id, status: 'published' })
    .sort({ displayOrder: 1, title: 1 })
    .populate('destination')
    .populate('activity')
    .lean<ITripPopulated[]>()
    .exec();
}
