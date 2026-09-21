import { cache } from 'react';
import { connectDB } from '../db';
import BlogPost, {
  IBlogPostPopulated,
  IBlogPostWithTrips,
} from '../../models/BlogPost';
import BlogCategory, { IBlogCategory } from '../../models/BlogCategory';

/*
 * Side-effect imports. `.populate()` resolves a ref by model *name* at query
 * time, and a model only registers with Mongoose when its module is first
 * imported. `BlogPost`'s type-only import of `ITripPopulated` is erased at
 * compile time and registers nothing, so both of these are load-bearing even
 * though neither binding is used here.
 *
 * Trip populates its own destination and activity two levels down, so those
 * have to be registered too.
 */
import '../../models/Trip';
import '../../models/Destination';
import '../../models/Activity';

/**
 * Blog reads.
 *
 * Published-only throughout, and "published" here means two things: the status
 * is `published` **and** `publishedAt` is set. A post can be flipped to
 * published with no date — nothing in the schema prevents it — and a
 * `BlogPosting` with no `datePublished` is a real SEO defect. Filtering on
 * both means such a post stays off the site rather than shipping broken
 * structured data.
 */

/**
 * Exported so `lib/queries/sitemap.ts` filters on the same two conditions the
 * pages do. A sitemap listing a post the page refuses to render is a 404 a
 * crawler was invited to.
 */
export const PUBLISHED = { status: 'published', publishedAt: { $ne: null } } as const;

/**
 * One post by slug, with its category and its related trips fully populated.
 *
 * `relatedTrips` needs a **two-level populate**: each trip, and inside it that
 * trip's destination and activity — because `tripPath()` builds the URL from
 * those slugs and an unpopulated `ITrip` only carries their ObjectIds. The
 * nested form of `populate()` is how you ask for that in one query.
 *
 * `cache()` because `generateMetadata` and the page body both call it.
 */
export const getBlogPostBySlug = cache(
  async (slug: string): Promise<IBlogPostWithTrips | null> => {
    await connectDB();

    return BlogPost.findOne({ slug, ...PUBLISHED })
      .populate('category')
      .populate({
        path: 'relatedTrips',
        match: { status: 'published' },
        populate: [{ path: 'destination' }, { path: 'activity' }],
      })
      .lean<IBlogPostWithTrips>()
      .exec();
  }
);

/**
 * Published posts, newest first.
 *
 * Category is populated because every card shows its category name and links
 * to the archive. Trips are not — a listing does not need them, and asking for
 * a two-level populate per card would be a lot of work for content nobody sees.
 */
export async function getPublishedPosts(
  options: { limit?: number; categoryId?: IBlogCategory['_id'] } = {}
): Promise<IBlogPostPopulated[]> {
  await connectDB();

  const filter = options.categoryId
    ? { ...PUBLISHED, category: options.categoryId }
    : PUBLISHED;

  const query = BlogPost.find(filter)
    .sort({ publishedAt: -1 })
    .populate('category');

  if (options.limit) query.limit(options.limit);

  return query.lean<IBlogPostPopulated[]>().exec();
}

/** Every blog category in display order, for the filter pills and the footer. */
export const getBlogCategories = cache(async (): Promise<IBlogCategory[]> => {
  await connectDB();

  return BlogCategory.find()
    .sort({ displayOrder: 1, name: 1 })
    .lean<IBlogCategory[]>()
    .exec();
});

/** One category by slug. Returns null so the page can call `notFound()`. */
export const getBlogCategoryBySlug = cache(
  async (slug: string): Promise<IBlogCategory | null> => {
    await connectDB();

    return BlogCategory.findOne({ slug }).lean<IBlogCategory>().exec();
  }
);

/**
 * Published post counts per category, keyed by stringified category id.
 *
 * One `$group` rather than one `countDocuments` per pill. Keys are strings
 * because two ObjectId instances holding the same value are different object
 * references and would never match as Map keys.
 */
export const getPostCountsByCategory = cache(
  async (): Promise<Map<string, number>> => {
    await connectDB();

    const rows = await BlogPost.aggregate<{
      _id: IBlogCategory['_id'];
      count: number;
    }>([
      { $match: { status: 'published', publishedAt: { $ne: null } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    return new Map(rows.map((row) => [String(row._id), row.count]));
  }
);

/**
 * Posts to read next.
 *
 * Same category first, then anything else recent, always excluding the post
 * being read. Two queries rather than one clever aggregation: the second only
 * runs when the first did not fill the row, which for a small blog is most of
 * the time early on and never once there are a few posts per category.
 */
export async function getRelatedPosts(
  post: IBlogPostPopulated | IBlogPostWithTrips,
  limit = 3
): Promise<IBlogPostPopulated[]> {
  await connectDB();

  const sameCategory = await BlogPost.find({
    ...PUBLISHED,
    category: post.category._id,
    _id: { $ne: post._id },
  })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .populate('category')
    .lean<IBlogPostPopulated[]>()
    .exec();

  if (sameCategory.length >= limit) return sameCategory;

  const seen = [post._id, ...sameCategory.map((related) => related._id)];

  const fillers = await BlogPost.find({ ...PUBLISHED, _id: { $nin: seen } })
    .sort({ publishedAt: -1 })
    .limit(limit - sameCategory.length)
    .populate('category')
    .lean<IBlogPostPopulated[]>()
    .exec();

  return [...sameCategory, ...fillers];
}

/** Published post slugs, for `generateStaticParams`. */
export async function getPublishedPostSlugs(): Promise<string[]> {
  await connectDB();

  const posts = await BlogPost.find(PUBLISHED)
    .select('slug')
    .lean<{ slug: string }[]>()
    .exec();

  return posts.map((post) => post.slug);
}

/**
 * Category slugs, for `generateStaticParams`.
 *
 * Every category, not only the ones with posts. An empty archive is a real
 * page with a real empty state — the alternative is a 404 on a URL that is
 * linked from the filter pills on /blog.
 */
export async function getBlogCategorySlugs(): Promise<string[]> {
  await connectDB();

  const categories = await BlogCategory.find()
    .select('slug')
    .lean<{ slug: string }[]>()
    .exec();

  return categories.map((category) => category.slug);
}
