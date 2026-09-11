import { connectDB } from '../db';
import Trip, { ITrip, ITripPopulated } from '../../models/Trip';
import Destination, { IDestination } from '../../models/Destination';
import Activity, { IActivity } from '../../models/Activity';

/**
 * Trip reads for the admin.
 *
 * **Separate from `lib/queries/trips.ts` on purpose, not by accident.** Every
 * helper in that file filters `status: 'published'`, because the public site
 * must never render a draft. An admin editor that reused them could not open
 * the draft it exists to edit, and "why can't I find the trip I just created"
 * is the bug that follows. The filter being absent here is the point, so it is
 * stated rather than implied.
 *
 * These return **unpopulated** trips. The editor writes `destination` and
 * `activity` as ids into select controls; a populated document would hand it
 * objects it then has to convert back.
 */

/** Every trip, newest edit first. Drafts and archived included. */
export async function getTripsForAdmin(): Promise<ITripPopulated[]> {
  await connectDB();

  return Trip.find()
    .sort({ updatedAt: -1 })
    .populate('destination', 'name slug hasActivities')
    .populate('activity', 'name slug')
    .lean<ITripPopulated[]>()
    .exec();
}

/**
 * One trip for editing, or null.
 *
 * `findById` throws a CastError on a malformed id rather than returning null,
 * so a hand-typed URL would be an unhandled 500. The catch turns it into the
 * same "not found" a genuinely missing record produces.
 */
export async function getTripForEdit(id: string): Promise<ITrip | null> {
  await connectDB();

  try {
    return await Trip.findById(id).lean<ITrip>().exec();
  } catch {
    return null;
  }
}

/**
 * What a destination select needs.
 *
 * `hasActivities` rides along because it decides whether the activity field
 * appears at all — the Nepal asymmetry, resolved in the editor rather than
 * hardcoded to a destination name.
 */
export interface DestinationOption {
  id: string;
  name: string;
  slug: string;
  hasActivities: boolean;
}

export async function getDestinationOptions(): Promise<DestinationOption[]> {
  await connectDB();

  const destinations = await Destination.find()
    .sort({ displayOrder: 1, name: 1 })
    .select('name slug hasActivities')
    .lean<Pick<IDestination, '_id' | 'name' | 'slug' | 'hasActivities'>[]>()
    .exec();

  return destinations.map((destination) => ({
    id: String(destination._id),
    name: destination.name,
    slug: destination.slug,
    hasActivities: destination.hasActivities,
  }));
}

/** An activity option, carrying its destination so the editor can filter. */
export interface ActivityOption {
  id: string;
  name: string;
  slug: string;
  destinationId: string;
}

/**
 * Every activity, with its destination id.
 *
 * All of them, not just the ones under the currently selected destination:
 * changing the destination select has to repopulate the activity select
 * without a round trip, and there are three activities in total. Fetching per
 * destination would be a network request to save nothing.
 */
export async function getActivityOptions(): Promise<ActivityOption[]> {
  await connectDB();

  const activities = await Activity.find()
    .sort({ displayOrder: 1, name: 1 })
    .select('name slug destination')
    .lean<Pick<IActivity, '_id' | 'name' | 'slug' | 'destination'>[]>()
    .exec();

  return activities.map((activity) => ({
    id: String(activity._id),
    name: activity.name,
    slug: activity.slug,
    destinationId: String(activity.destination),
  }));
}

/**
 * Is this slug already taken by a different trip?
 *
 * The schema's `unique: true` builds an index, and a collision there surfaces
 * as a MongoServerError with code 11000 — not a ValidationError, so it carries
 * no field path and the editor cannot attach it to the slug input. Checking
 * first turns it into an ordinary field error.
 *
 * This is a check, not a lock: two admins saving the same slug in the same
 * instant both pass it. The unique index is still the thing that guarantees
 * correctness, and the save route handles 11000 as a fallback. With one
 * operator the race is theoretical; the index means it stays that way.
 */
export async function isSlugTaken(
  slug: string,
  exceptTripId: string
): Promise<boolean> {
  await connectDB();

  const existing = await Trip.findOne({ slug: slug.toLowerCase().trim() })
    .select('_id')
    .lean<{ _id: unknown }>()
    .exec();

  return !!existing && String(existing._id) !== exceptTripId;
}
