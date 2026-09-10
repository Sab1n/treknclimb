import mongoose, { Schema, Model, Types } from 'mongoose';
import { ISeoFields, seoFields } from './shared/seo';
import { reservedSlugValidator } from './shared/reservedSlugs';
import { IBlogCategory } from './BlogCategory';
/*
 * Type-only, so it is erased at compile time and does NOT register the Trip
 * model with Mongoose. Any query module that populates `relatedTrips` still
 * needs its own bare `import '../../models/Trip'` — see the convention in
 * CLAUDE.md.
 */
import type { ITripPopulated } from './Trip';
import { PublishStatus, PUBLISH_STATUSES } from './shared/status';

export interface IBlogPost extends ISeoFields {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  slugHistory: string[];
  excerpt: string;
  /** Rich text or Markdown. Sanitise on save — this is the stored-XSS surface. */
  body: string;
  featuredImage: string;
  featuredImageAlt: string;
  category: Types.ObjectId;
  /** Author name as displayed. Not a ref — there is no author collection. */
  author?: string;
  /**
   * The author's credentials, for the byline box.
   *
   * E-E-A-T is the reason these exist rather than vanity: a post about altitude
   * sickness is judged partly on whether the person writing it plausibly knows,
   * and "Operations lead, Pokhara — twenty-two seasons in the Khumbu" is the
   * difference between a page that ranks for that question and one that does
   * not. It is also simply true here, which is the company's advantage over
   * the content farms it competes with.
   *
   * Stored per post rather than in an author collection, matching `author`
   * above. The cost is that changing someone's role means editing every post
   * they wrote; with a handful of guides writing occasionally that is cheaper
   * than a collection, and promoting it later is additive.
   */
  authorRole?: string;
  authorBio?: string;
  readTimeMinutes?: number;

  /**
   * Trips this post should point at, chosen by the admin.
   *
   * **This is the conversion mechanism for the whole blog.** Blog traffic
   * arrives top-of-funnel from a search like "how bad is altitude sickness on
   * EBC" — it is not looking to buy, and a generic CTA converts it badly. A
   * hand-picked link from the answer to the trips that address it is what
   * turns a reader into an inquiry.
   *
   * **Admin-selected, never inferred.** The obvious shortcut is matching on
   * category or keywords, and it produces confidently wrong pairings — a post
   * about Lukla flight cancellations "matching" a Bhutan trek. The editorial
   * judgement is the value; guessing it away would leave the mechanism
   * technically present and useless.
   *
   * Empty array, not null: a post with no trips attached is ordinary, and the
   * section simply does not render.
   */
  relatedTrips: Types.ObjectId[];
  /**
   * Null until the post is first published. Distinct from `createdAt`, which is
   * when the draft was made, and from `updatedAt`, which moves on every edit.
   * Answer engines read published and updated dates to judge freshness, so all
   * three are worth keeping apart.
   */
  publishedAt: Date | null;
  status: PublishStatus;

  createdAt: Date;
  updatedAt: Date;
}

/** After `.populate('category')`. */
export interface IBlogPostPopulated extends Omit<IBlogPost, 'category'> {
  category: IBlogCategory;
}

/**
 * After `.populate('category')` **and** a two-level populate of
 * `relatedTrips` — each trip with its own destination and activity populated,
 * because building a trip URL needs those slugs and an unpopulated `ITrip`
 * only carries their ObjectIds.
 *
 * A separate interface rather than making `IBlogPostPopulated` carry it: the
 * index and archive pages populate the category only, and claiming trips they
 * never fetched is how `.lean<T>()` assertions turn into runtime crashes.
 */
export interface IBlogPostWithTrips
  extends Omit<IBlogPostPopulated, 'relatedTrips'> {
  relatedTrips: ITripPopulated[];
}

const BlogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // /blog/[slug] shares its segment with /blog/category.
      validate: reservedSlugValidator('/blog'),
    },
    slugHistory: { type: [String], default: [] },
    excerpt: { type: String, required: true },
    body: { type: String, required: true },
    featuredImage: { type: String, required: true },
    featuredImageAlt: { type: String, required: true, trim: true },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'BlogCategory',
      required: true,
      index: true,
    },
    author: { type: String, trim: true },
    authorRole: { type: String, trim: true },
    authorBio: { type: String, trim: true },
    readTimeMinutes: { type: Number, min: 1 },
    relatedTrips: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Trip' }],
      default: [],
    },
    publishedAt: { type: Date, default: null },
    status: {
      type: String,
      required: true,
      enum: [...PUBLISH_STATUSES],
      default: 'draft',
      index: true,
    },
    ...seoFields,
  },
  { timestamps: true }
);

BlogPostSchema.index({ slugHistory: 1 });
// The blog index and category archives both sort published posts by date.
BlogPostSchema.index({ status: 1, publishedAt: -1 });

const BlogPost: Model<IBlogPost> =
  mongoose.models.BlogPost ||
  mongoose.model<IBlogPost>('BlogPost', BlogPostSchema);

export default BlogPost;
