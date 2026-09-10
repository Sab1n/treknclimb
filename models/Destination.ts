import mongoose, { Schema, Model, Types } from 'mongoose';
import { ISeoFields, seoFields } from './shared/seo';
import { reservedSlugValidator } from './shared/reservedSlugs';

/**
 * How much permit paperwork a region involves. Editorial, set by the admin —
 * nothing in the trip data implies it.
 */
export const PERMIT_COMPLEXITIES = ['Low', 'Medium', 'High'] as const;

export type PermitComplexity = (typeof PERMIT_COMPLEXITIES)[number];

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

  /*
   * The "how they compare" row on /destinations.
   *
   * Free-text labels rather than numbers, and authored rather than derived,
   * because they describe the *region* — not whichever trips happen to be
   * published. Deriving "typical length" from trip durations would make Nepal
   * read "3–18 days" the day a short hike is published, which is true of the
   * catalogue and misleading about the country.
   *
   * All optional: the table renders only for destinations that have them.
   */
  typicalLengthLabel?: string;
  maxAltitudeLabel?: string;
  bestMonthsLabel?: string;
  permitComplexity?: PermitComplexity;

  // Added at runtime by `timestamps: true`. Declared so the sitemap can read
  // `lastmod` and pages can surface a last-updated date for AI crawlers.
  createdAt: Date;
  updatedAt: Date;
}

const DestinationSchema = new Schema<IDestination>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // A destination slug becomes a top-level URL, so it must not collide
      // with a static route.
      validate: reservedSlugValidator(),
    },
    slugHistory: { type: [String], default: [] },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    coverImageAlt: { type: String, required: true },
    hasActivities: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },

    typicalLengthLabel: { type: String, trim: true },
    maxAltitudeLabel: { type: String, trim: true },
    bestMonthsLabel: { type: String, trim: true },
    permitComplexity: { type: String, enum: [...PERMIT_COMPLEXITIES] },

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
