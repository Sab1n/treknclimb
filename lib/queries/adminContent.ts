import { connectDB } from '../db';
import Destination, { IDestination } from '../../models/Destination';
import Activity, { IActivity, IActivityPopulated } from '../../models/Activity';
import Trip from '../../models/Trip';
import Testimonial, {
  ITestimonial,
  ITestimonialPopulated,
} from '../../models/Testimonial';
import Faq, { IFaq, IFaqPopulated } from '../../models/Faq';

/*
 * Side-effect import: `.populate('destination')` resolves the ref by model
 * *name* at query time, and a model only registers when its module is first
 * imported. Activity is imported as a value above, Destination likewise — this
 * line exists for the day one of them stops being used directly and someone
 * removes the import that was quietly holding the populate together.
 */
import '../../models/Destination';

/**
 * Admin reads for destinations and activities.
 *
 * Separate from the public helpers in `lib/queries/destinations.ts` and
 * `lib/queries/activities.ts`, which shape their results for rendering — trip
 * counts, published-only filters, cached wrappers. An editor needs the raw
 * document with its unpopulated refs, because that is what it writes back.
 */

/** Every destination, in display order. There are four and there always will be. */
export async function getDestinationsForAdmin(): Promise<IDestination[]> {
  await connectDB();

  return Destination.find()
    .sort({ displayOrder: 1, name: 1 })
    .lean<IDestination[]>()
    .exec();
}

/**
 * One destination for editing, or null.
 *
 * `findById` throws a CastError on a malformed id rather than returning null,
 * so a hand-typed URL would be an unhandled 500 without the catch.
 */
export async function getDestinationForEdit(
  id: string
): Promise<IDestination | null> {
  await connectDB();

  try {
    return await Destination.findById(id).lean<IDestination>().exec();
  } catch {
    return null;
  }
}

/** Activities with their destination, newest edit first. */
export async function getActivitiesForAdmin(): Promise<IActivityPopulated[]> {
  await connectDB();

  return Activity.find()
    .sort({ displayOrder: 1, name: 1 })
    .populate('destination', 'name slug hasActivities')
    .lean<IActivityPopulated[]>()
    .exec();
}

export async function getActivityForEdit(id: string): Promise<IActivity | null> {
  await connectDB();

  try {
    return await Activity.findById(id).lean<IActivity>().exec();
  } catch {
    return null;
  }
}

/**
 * How many trips reference a record.
 *
 * The delete guard. Deleting an activity that still has trips would leave every
 * one of them pointing at an ObjectId with nothing behind it — `.populate()`
 * returns null, the Nepal validate hook then rejects the trip on its next save,
 * and the trip page throws on `activity.slug`. The failure surfaces nowhere
 * near the deletion that caused it, so the deletion is refused instead.
 */
/*
 * Every count below catches. A malformed id — a hand-typed URL, or the literal
 * string `new` hitting the `[id]` route — makes Mongoose throw a CastError
 * rather than matching nothing, and these run inside a `Promise.all` beside a
 * lookup that already handles its own. Without the catch the rejected count
 * takes the whole page down with a 500, on a URL anyone can type, while the
 * lookup beside it was quietly returning null and heading for a clean 404.
 *
 * Zero is the right answer for an id that cannot exist: nothing references it.
 */
export async function countTripsForActivity(activityId: string): Promise<number> {
  await connectDB();

  try {
    return await Trip.countDocuments({ activity: activityId });
  } catch {
    return 0;
  }
}

export async function countTripsForDestination(
  destinationId: string
): Promise<number> {
  await connectDB();

  try {
    return await Trip.countDocuments({ destination: destinationId });
  } catch {
    return 0;
  }
}

export async function countActivitiesForDestination(
  destinationId: string
): Promise<number> {
  await connectDB();

  try {
    return await Activity.countDocuments({ destination: destinationId });
  } catch {
    return 0;
  }
}

/**
 * Is this slug taken by a different record in the same collection?
 *
 * Slugs are unique per collection, not globally — a destination and an activity
 * may both be `trekking` without colliding, because they sit at different
 * depths. So this checks one collection at a time.
 *
 * A check, not a lock: two saves in the same instant both pass it. The unique
 * index is what guarantees correctness, and the save routes handle the
 * resulting 11000. With one operator the race is theoretical; the index means
 * it stays that way.
 */
export async function isDestinationSlugTaken(
  slug: string,
  exceptId: string
): Promise<boolean> {
  await connectDB();

  const existing = await Destination.findOne({ slug: slug.toLowerCase().trim() })
    .select('_id')
    .lean<{ _id: unknown }>()
    .exec();

  return !!existing && String(existing._id) !== exceptId;
}

export async function isActivitySlugTaken(
  slug: string,
  exceptId: string
): Promise<boolean> {
  await connectDB();

  const existing = await Activity.findOne({ slug: slug.toLowerCase().trim() })
    .select('_id')
    .lean<{ _id: unknown }>()
    .exec();

  return !!existing && String(existing._id) !== exceptId;
}

/* ---------------------------------------------------------------- *
 *  Testimonials and FAQs
 * ---------------------------------------------------------------- */

/**
 * Every trip, as an option for the association selects.
 *
 * Drafts included. A FAQ or a testimonial is written alongside the trip it
 * belongs to, often before that trip is published, and offering only published
 * trips would mean the association cannot be set until afterwards — at which
 * point nobody remembers to go back and set it.
 *
 * The label carries the destination because trip titles repeat across them:
 * "Everest Base Camp Trek" is unambiguous, "Base Camp Trek" is not.
 */
export interface TripOption {
  id: string;
  title: string;
  status: string;
  destinationName: string;
}

export async function getTripOptions(): Promise<TripOption[]> {
  await connectDB();

  const trips = await Trip.find()
    .sort({ title: 1 })
    .select('title status destination')
    .populate('destination', 'name')
    .lean<
      {
        _id: unknown;
        title: string;
        status: string;
        destination: { name: string } | null;
      }[]
    >()
    .exec();

  return trips.map((trip) => ({
    id: String(trip._id),
    title: trip.title,
    status: trip.status,
    destinationName: trip.destination?.name ?? 'Unknown',
  }));
}

/** Every testimonial, in the order the homepage would show them. */
export async function getTestimonialsForAdmin(): Promise<
  ITestimonialPopulated[]
> {
  await connectDB();

  return Testimonial.find()
    .sort({ displayOrder: 1, createdAt: -1 })
    .populate('trip', 'title')
    .lean<ITestimonialPopulated[]>()
    .exec();
}

export async function getTestimonialForEdit(
  id: string
): Promise<ITestimonial | null> {
  await connectDB();

  try {
    return await Testimonial.findById(id).lean<ITestimonial>().exec();
  } catch {
    // A malformed id throws a CastError rather than returning null.
    return null;
  }
}

/**
 * Every FAQ, with both associations populated.
 *
 * Sorted by `displayOrder` and then by question, but the list screen groups
 * them by association before rendering — ordering a trip's FAQs against the
 * sitewide ones is meaningless, because the two never appear on the same page.
 */
export async function getFaqsForAdmin(): Promise<IFaqPopulated[]> {
  await connectDB();

  return Faq.find()
    .sort({ displayOrder: 1, question: 1 })
    .populate('destination', 'name')
    .lean<IFaqPopulated[]>()
    .exec();
}

export async function getFaqForEdit(id: string): Promise<IFaq | null> {
  await connectDB();

  try {
    return await Faq.findById(id).lean<IFaq>().exec();
  } catch {
    return null;
  }
}
