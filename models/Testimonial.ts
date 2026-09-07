import mongoose, { Schema, Model, Types } from 'mongoose';
import { ITrip } from './Trip';
import { PublishStatus, PUBLISH_STATUSES } from './shared/status';

/**
 * Admin-curated, never customer-submitted. These are display content, not a
 * review system — nothing here feeds `aggregateRating` in JSON-LD.
 */
export interface ITestimonial {
  _id: Types.ObjectId;
  name: string;
  photo?: string;
  photoAlt?: string;
  quote: string;
  /**
   * Nullable, not optional — same reasoning as `Trip.activity`. A testimonial
   * either points at a trip or deliberately doesn't; the key is always there.
   */
  trip: Types.ObjectId | null;
  country?: string;
  displayOrder: number;
  status: PublishStatus;

  createdAt: Date;
  updatedAt: Date;
}

/** After `.populate('trip')`. */
export interface ITestimonialPopulated extends Omit<ITestimonial, 'trip'> {
  trip: ITrip | null;
}

const TestimonialSchema = new Schema<ITestimonial>(
  {
    name: { type: String, required: true, trim: true },
    photo: { type: String, trim: true },
    // Alt text is required whenever there is an image to describe.
    photoAlt: {
      type: String,
      trim: true,
      required: function (this: ITestimonial) {
        return !!this.photo;
      },
    },
    quote: { type: String, required: true },
    trip: {
      type: Schema.Types.ObjectId,
      ref: 'Trip',
      default: null,
      index: true,
    },
    country: { type: String, trim: true },
    displayOrder: { type: Number, default: 0 },
    status: {
      type: String,
      required: true,
      enum: [...PUBLISH_STATUSES],
      default: 'draft',
      index: true,
    },
  },
  { timestamps: true }
);

const Testimonial: Model<ITestimonial> =
  mongoose.models.Testimonial ||
  mongoose.model<ITestimonial>('Testimonial', TestimonialSchema);

export default Testimonial;
