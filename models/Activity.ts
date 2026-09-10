import mongoose, { Schema, Model, Types } from 'mongoose';
import { IDestination } from './Destination';
import { ISeoFields, seoFields } from './shared/seo';
import { reservedSlugValidator } from './shared/reservedSlugs';

/**
 * An Activity sits between a Destination and a Trip:
 *   Nepal → Trekking → Everest Base Camp
 *
 * Only Nepal uses this layer today, but nothing in this file knows that. The
 * destination reference is generic; `Destination.hasActivities` is the single
 * flag that decides whether a destination uses activities at all.
 */
export interface IActivity extends ISeoFields {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  /** Every slug this activity has ever had, for the 301 catch-all. */
  slugHistory: string[];
  description: string;
  /**
   * Authored prose answering "who is this for". Distinct from `description`,
   * which says what the activity *is* — a different question, and one the
   * generic difficulty table cannot answer for a specific activity.
   *
   * Optional: a new activity is savable before this is written.
   */
  suitability?: string;
  coverImage: string;
  coverImageAlt: string;
  destination: Types.ObjectId;
  displayOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * The same activity after `.populate('destination')`.
 *
 * Activity pages need `activity.destination.slug` to build `/nepal/trekking`
 * and its breadcrumb, so this shape is needed one level above Trip for exactly
 * the same reason.
 */
export interface IActivityPopulated extends Omit<IActivity, 'destination'> {
  destination: IDestination;
}

const ActivitySchema = new Schema<IActivity>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // An activity slug becomes the second URL segment (/nepal/trekking).
      validate: reservedSlugValidator('/<destination>'),
    },
    slugHistory: { type: [String], default: [] },
    description: { type: String, required: true },
    suitability: { type: String, trim: true },
    coverImage: { type: String, required: true },
    coverImageAlt: { type: String, required: true },
    destination: {
      type: Schema.Types.ObjectId,
      ref: 'Destination',
      required: true,
      index: true,
    },
    displayOrder: { type: Number, default: 0 },
    ...seoFields,
  },
  { timestamps: true }
);

// The 301 catch-all looks up retired slugs.
ActivitySchema.index({ slugHistory: 1 });

const Activity: Model<IActivity> =
  mongoose.models.Activity ||
  mongoose.model<IActivity>('Activity', ActivitySchema);

export default Activity;
