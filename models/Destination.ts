import mongoose, { Schema, Model, Types } from 'mongoose';
import { ISeoFields, seoFields } from './shared/seo';

/**
 * One of four fixed destinations: Nepal, India, Tibet, Bhutan. Seeded once and
 * edit-only in the CMS — never created or deleted through the UI.
 *
 * `hasActivities` is the source of truth for the Nepal asymmetry. Trip's
 * validate hook reads this field rather than checking the destination by name.
 *
 * `extends ISeoFields` folds in the eight shared SEO fields, so this interface
 * lists only what is specific to a destination.
 */
export interface IDestination extends ISeoFields {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  /** Every slug this destination has ever had, for the 301 catch-all. */
  slugHistory: string[];
  description: string;
  coverImage: string;
  coverImageAlt: string;
  hasActivities: boolean;
  displayOrder: number;

  // Added at runtime by `timestamps: true`. Declared so the sitemap can read
  // `lastmod` and pages can surface a last-updated date for AI crawlers.
  createdAt: Date;
  updatedAt: Date;
}

const DestinationSchema = new Schema<IDestination>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    slugHistory: { type: [String], default: [] },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    coverImageAlt: { type: String, required: true },
    hasActivities: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    ...seoFields,
  },
  { timestamps: true }
);

// The 301 catch-all looks up retired slugs.
DestinationSchema.index({ slugHistory: 1 });

const Destination: Model<IDestination> =
  mongoose.models.Destination ||
  mongoose.model<IDestination>('Destination', DestinationSchema);

export default Destination;
