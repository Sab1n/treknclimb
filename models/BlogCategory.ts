import mongoose, { Schema, Model, Types } from 'mongoose';
import { ISeoFields, seoFields } from './shared/seo';

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
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    slugHistory: { type: [String], default: [] },
    description: { type: String },
    displayOrder: { type: Number, default: 0 },
    ...seoFields,
  },
  { timestamps: true }
);

BlogCategorySchema.index({ slugHistory: 1 });

const BlogCategory: Model<IBlogCategory> =
  mongoose.models.BlogCategory ||
  mongoose.model<IBlogCategory>('BlogCategory', BlogCategorySchema);

export default BlogCategory;
