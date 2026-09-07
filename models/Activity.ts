import mongoose, { Schema, Model, Types } from 'mongoose';

/**
 * An Activity sits between a Destination and a Trip:
 *   Nepal → Trekking → Everest Base Camp
 *
 * Only Nepal uses this layer today, but nothing in this file knows that. The
 * destination reference is generic; `Destination.hasActivities` is the single
 * flag that decides whether a destination uses activities at all.
 */
export interface IActivity {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  coverImage: string;
  coverImageAlt: string;
  destination: Types.ObjectId;
  displayOrder: number;
  metaTitle?: string;
  metaDescription?: string;
}

const ActivitySchema = new Schema<IActivity>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    coverImageAlt: { type: String, required: true },
    destination: {
      type: Schema.Types.ObjectId,
      ref: 'Destination',
      required: true,
      index: true,
    },
    displayOrder: { type: Number, default: 0 },
    metaTitle: { type: String },
    metaDescription: { type: String },
  },
  { timestamps: true }
);

const Activity: Model<IActivity> =
  mongoose.models.Activity ||
  mongoose.model<IActivity>('Activity', ActivitySchema);

export default Activity;
