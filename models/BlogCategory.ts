import mongoose, { Schema, Model, Types } from 'mongoose';

import { noMojibakePlugin } from './shared/noMojibake';
import { ISeoFields, seoFields } from './shared/seo';
import { reservedSlugValidator } from './shared/reservedSlugs';

/**
 * A small curated taxonomy — destination guides, travel tips, trekking guides,
 * culture and food. Each has an archive page at /blog/category/[slug], so it is
 * an indexable content type and carries the full SEO field set and slug history.
 */
export interface IBlogCategory extends ISeoFields {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  slugHistory: string[];
  description?: string;
  displayOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

const BlogCategorySchema = new Schema<IBlogCategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // /blog/category/[slug].
      validate: reservedSlugValidator('/blog/category'),
    },
    slugHistory: { type: [String], default: [] },
    description: { type: String },
    displayOrder: { type: Number, default: 0 },
    ...seoFields,
  },
  { timestamps: true }
);

BlogCategorySchema.index({ slugHistory: 1 });

/*
 * Rejects U+FFFD on every string path, including the embedded
 * subdocuments. See models/shared/noMojibake.ts — the character only ever
 * means a decode failed upstream, so there is no legitimate value to lose.
 */
BlogCategorySchema.plugin(noMojibakePlugin);

const BlogCategory: Model<IBlogCategory> =
  mongoose.models.BlogCategory ||
  mongoose.model<IBlogCategory>('BlogCategory', BlogCategorySchema);

export default BlogCategory;
