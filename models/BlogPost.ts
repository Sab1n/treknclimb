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

/**
 * Required only once the post is live.
 *
 * ## Why these four are gated
 *
 * They were unconditionally required, and that made a draft impossible to
 * save: a post is started with a title and a category and written over the
 * following week, so demanding the finished body before the record can exist
 * is the same deadlock `Trip.coverImage` had. Verified rather than reasoned —
 * creating a minimal draft through the admin route failed with
 * `Path \`body\` is required` on all four at once.
 *
 * Loosening them outright would be wrong in the other direction: a post with no
 * body must never reach the site. So `status` is the gate, exactly as it is on
 * Trip. A draft is by definition unfinished; publishing is the act that claims
 * it is not, and that is where the check belongs.
 *
 * `archived` is deliberately ungated. Archiving is how a post is retired, and
 * refusing to archive an incomplete one would trap it as a draft forever.
 *
 * A normal function, not an arrow: Mongoose calls `required` with `this` bound
 * to the document, and an arrow would capture the module scope instead.
 */
function requiredToPublish(this: { status?: PublishStatus }): boolean {
  return this.status === 'published';
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
    /*
     * Required to publish, not required to exist — see the note above.
     * `lib/validators/adminBlog.ts` mirrors this so the failure arrives keyed
     * to a field rather than as a Mongoose ValidationError after a round trip,
     * but the model is the guarantee: a migration script can walk straight past
     * the schema layer and cannot walk past this.
     */
    excerpt: { type: String, required: requiredToPublish },
    body: { type: String, required: requiredToPublish },
    featuredImage: { type: String, required: requiredToPublish },
    /*
     * Alt text is required whenever there *is* an image, published or not —
     * CLAUDE.md makes that unconditional, so this is a different rule from the
     * three above and deliberately not `requiredToPublish`.
     */
    featuredImageAlt: {
      type: String,
      trim: true,
      required: function (this: IBlogPost) {
        return !!this.featuredImage;
      },
    },
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

/**
 * The alt-text rule again, for query middleware.
 *
 * `featuredImageAlt`'s conditional `required` protects `save()` and
 * `insertMany`. It does **nothing** for `findOneAndUpdate`, even with
 * `runValidators: true`: there is no document, so `this.featuredImage` is
 * `undefined`, the condition returns false, and the field is simply not
 * required. CLAUDE.md records that verified on `Testimonial`, where an update
 * stored a photo with no alt text.
 *
 * The admin routes all use `findById` → assign → `save()`, so nothing today
 * reaches this. It is here for the import script that has not been written.
 *
 * The update is merged onto the stored document before testing, because either
 * half can create the violation: adding an image to a post with no alt, or
 * clearing the alt on a post that has one.
 */
BlogPostSchema.pre('findOneAndUpdate', async function () {
  const update = (this.getUpdate() ?? {}) as Record<string, unknown> & {
    $set?: Record<string, unknown>;
    $unset?: Record<string, unknown>;
  };

  const set = { ...update, ...(update.$set ?? {}) };
  const unset = update.$unset ?? {};

  const touchesImage =
    'featuredImage' in set ||
    'featuredImageAlt' in set ||
    'featuredImage' in unset ||
    'featuredImageAlt' in unset;

  if (!touchesImage) return;

  const current = await this.model
    .findOne(this.getQuery())
    .select('featuredImage featuredImageAlt')
    .lean<{ featuredImage?: string; featuredImageAlt?: string }>()
    .exec();

  function resolve(field: 'featuredImage' | 'featuredImageAlt'): string {
    if (field in unset) return '';
    if (field in set) return String(set[field] ?? '').trim();
    return (current?.[field] ?? '').trim();
  }

  if (resolve('featuredImage') && !resolve('featuredImageAlt')) {
    /*
     * A thrown Error, not a ValidationError. Query middleware has no document
     * to attach field errors to, so this surfaces as a plain message with no
     * field mapping — which CLAUDE.md warns admin error handling has to cope
     * with.
     */
    throw new Error(
      'A featured image requires alt text. Set featuredImageAlt in the same update, or use findById + save().'
    );
  }
});

const BlogPost: Model<IBlogPost> =
  mongoose.models.BlogPost ||
  mongoose.model<IBlogPost>('BlogPost', BlogPostSchema);

export default BlogPost;
