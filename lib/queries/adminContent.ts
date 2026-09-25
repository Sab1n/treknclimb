import { connectDB } from '../db';
import Destination, { IDestination } from '../../models/Destination';
import Activity, { IActivity, IActivityPopulated } from '../../models/Activity';
import Region, { IRegion, IRegionPopulated } from '../../models/Region';
import Trip from '../../models/Trip';
import Testimonial, {
  ITestimonial,
  ITestimonialPopulated,
} from '../../models/Testimonial';
import Faq, { IFaq, IFaqPopulated } from '../../models/Faq';
import TeamMember, { ITeamMember } from '../../models/TeamMember';
import BlogPost, { IBlogPost, IBlogPostPopulated } from '../../models/BlogPost';
import BlogCategory, { IBlogCategory } from '../../models/BlogCategory';

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

/**
 * Every region, with its destination populated, for the admin list.
 *
 * Ordered the way the public pages order them, so the list reads the same way
 * the site does.
 */
export async function getRegionsForAdmin(): Promise<IRegionPopulated[]> {
  await connectDB();

  return Region.find()
    .sort({ displayOrder: 1, name: 1 })
    .populate('destination')
    .lean<IRegionPopulated[]>()
    .exec();
}

export async function getRegionForEdit(id: string): Promise<IRegion | null> {
  await connectDB();

  try {
    return await Region.findById(id).lean<IRegion>().exec();
  } catch {
    // A malformed id is a 404, not a 500.
    return null;
  }
}

/**
 * How many trips are filed under a region.
 *
 * The delete guard, and the "renaming moves N pages" line on the form.
 * Counts **every** trip, not just published ones: a draft still holds the
 * reference, and deleting the region would leave it pointing at nothing the
 * next time someone opens it.
 */
export async function countTripsForRegion(regionId: string): Promise<number> {
  await connectDB();

  try {
    return await Trip.countDocuments({ region: regionId });
  } catch {
    return 0;
  }
}

/**
 * The pages a region currently renders on — one per activity with published
 * trips in it.
 *
 * Read rather than assembled from a list of activity slugs, for the reason
 * stated everywhere else regions are touched: which activities have regions is
 * decided by the trips, and a hardcoded answer stops being true the first time
 * that changes.
 */
export async function getRegionLivePaths(regionId: string): Promise<string[]> {
  await connectDB();

  try {
    const trips = await Trip.find({ region: regionId, status: 'published' })
      .select('destination activity')
      .populate('destination', 'slug')
      .populate('activity', 'slug')
      .lean<
        {
          destination: { slug: string } | null;
          activity: { slug: string } | null;
        }[]
      >()
      .exec();

    const region = await Region.findById(regionId).select('slug').lean<{ slug: string }>();

    if (!region) return [];

    const paths = new Set<string>();

    for (const trip of trips) {
      if (!trip.destination || !trip.activity) continue;

      paths.add(
        `/${trip.destination.slug}/${trip.activity.slug}/region/${region.slug}`
      );
    }

    return [...paths].sort();
  } catch {
    return [];
  }
}

/** Slugs are unique per collection, so a region only collides with a region. */
export async function isRegionSlugTaken(
  slug: string,
  excludeId?: string
): Promise<boolean> {
  await connectDB();

  const existing = await Region.findOne({ slug: slug.toLowerCase().trim() })
    .select('_id')
    .lean<{ _id: unknown }>()
    .exec();

  if (!existing) return false;

  return !excludeId || String(existing._id) !== excludeId;
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

/** Every team member, in the order the About page would show them. */
export async function getTeamForAdmin(): Promise<ITeamMember[]> {
  await connectDB();

  return TeamMember.find()
    .sort({ displayOrder: 1, name: 1 })
    .lean<ITeamMember[]>()
    .exec();
}

export async function getTeamMemberForEdit(
  id: string
): Promise<ITeamMember | null> {
  await connectDB();

  try {
    return await TeamMember.findById(id).lean<ITeamMember>().exec();
  } catch {
    // A malformed id throws a CastError rather than returning null.
    return null;
  }
}

/* ---------------------------------------------------------------- *
 *  Blog
 * ---------------------------------------------------------------- */

/** Every post with its category, newest first. Drafts included. */
export async function getBlogPostsForAdmin(): Promise<IBlogPostPopulated[]> {
  await connectDB();

  return BlogPost.find()
    .sort({ publishedAt: -1, createdAt: -1 })
    .populate('category', 'name slug')
    .lean<IBlogPostPopulated[]>()
    .exec();
}

export async function getBlogPostForEdit(id: string): Promise<IBlogPost | null> {
  await connectDB();

  try {
    return await BlogPost.findById(id).lean<IBlogPost>().exec();
  } catch {
    // A malformed id throws a CastError rather than returning null.
    return null;
  }
}

/** Categories as options, in display order. */
export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

export async function getCategoryOptions(): Promise<CategoryOption[]> {
  await connectDB();

  const categories = await BlogCategory.find()
    .sort({ displayOrder: 1, name: 1 })
    .select('name slug')
    .lean<{ _id: unknown; name: string; slug: string }[]>()
    .exec();

  return categories.map((category) => ({
    id: String(category._id),
    name: category.name,
    slug: category.slug,
  }));
}

/**
 * Is this slug taken by a different post?
 *
 * A check, not a lock — the unique index is what guarantees correctness and the
 * save route handles the resulting 11000. Checking first turns a driver error
 * with no field path into an ordinary field error the editor can render.
 */
export async function isBlogSlugTaken(
  slug: string,
  exceptId: string
): Promise<boolean> {
  await connectDB();

  const existing = await BlogPost.findOne({ slug: slug.toLowerCase().trim() })
    .select('_id')
    .lean<{ _id: unknown }>()
    .exec();

  return !!existing && String(existing._id) !== exceptId;
}

/* ------------------------------------------------------------------ *
 * Blog categories
 * ------------------------------------------------------------------ */

/**
 * Every category, in display order then name.
 *
 * Two sort keys rather than one: `displayOrder` defaults to 0, so a list
 * where nobody has set it is entirely ties, and a tie-break MongoDB does not
 * specify means the order changes between loads for no reason anyone can see.
 */
export async function getBlogCategoriesForAdmin(): Promise<IBlogCategory[]> {
  await connectDB();

  return BlogCategory.find()
    .sort({ displayOrder: 1, name: 1 })
    .lean<IBlogCategory[]>()
    .exec();
}

export async function getBlogCategoryForEdit(
  id: string
): Promise<IBlogCategory | null> {
  await connectDB();

  try {
    return await BlogCategory.findById(id).lean<IBlogCategory>().exec();
  } catch {
    // A malformed id throws a CastError rather than returning null.
    return null;
  }
}

/** Slugs are unique per collection, so a category only collides with one. */
export async function isBlogCategorySlugTaken(
  slug: string,
  excludeId?: string
): Promise<boolean> {
  await connectDB();

  const existing = await BlogCategory.findOne({ slug: slug.toLowerCase().trim() })
    .select('_id')
    .lean<{ _id: unknown }>()
    .exec();

  if (!existing) return false;

  return !excludeId || String(existing._id) !== excludeId;
}

/**
 * How many posts are filed under a category, and how many of those are live.
 *
 * **Every post, not only the published ones.** `BlogPost.category` is
 * required and not nullable, so deleting a category a draft points at leaves
 * that draft unopenable — `populate('category')` returns null and the editor
 * has nothing to put in its select. A draft is exactly the post nobody would
 * think to check, which is why the delete guard counts it.
 *
 * The published figure is carried alongside for the list, where "4 posts, 3
 * live" is the useful line.
 */
export async function countPostsForCategory(
  categoryId: string
): Promise<{ total: number; published: number }> {
  await connectDB();

  try {
    const [total, published] = await Promise.all([
      BlogPost.countDocuments({ category: categoryId }),
      BlogPost.countDocuments({ category: categoryId, status: 'published' }),
    ]);

    return { total, published };
  } catch {
    // A malformed id throws a CastError. No category, no posts.
    return { total: 0, published: 0 };
  }
}

/**
 * Post counts for every category in one aggregation.
 *
 * The list screen would otherwise pay two `countDocuments` round trips per
 * row to Atlas in Mumbai, on a page that is `force-dynamic` and so pays them
 * on every load.
 */
export async function getPostCountsForAdmin(): Promise<
  Map<string, { total: number; published: number }>
> {
  await connectDB();

  const rows = await BlogPost.aggregate<{
    _id: unknown;
    total: number;
    published: number;
  }>([
    {
      $group: {
        _id: '$category',
        total: { $sum: 1 },
        published: {
          $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] },
        },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      { total: row.total, published: row.published },
    ])
  );
}
