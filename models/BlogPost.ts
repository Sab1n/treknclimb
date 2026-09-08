import mongoose, { Schema, Model, Types } from 'mongoose';
import { ISeoFields, seoFields } from './shared/seo';
import { reservedSlugValidator } from './shared/reservedSlugs';
import { IBlogCategory } from './BlogCategory';
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
  readTimeMinutes?: number;
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
      validate: reservedSlugValidator,
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
    readTimeMinutes: { type: Number, min: 1 },
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
