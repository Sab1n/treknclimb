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

/**
 * The same rule again, for query middleware.
 *
 * `photoAlt`'s conditional `required` above protects `save()` and
 * `insertMany` — both run document validation, and `this` is a real document
 * with a `photo` to test. **It does nothing for `findOneAndUpdate`**, even with
 * `runValidators: true`: there is no document, so `this.photo` is `undefined`,
 * the condition returns false, and the field is simply not required. Verified
 * rather than assumed — an update adding a photo with no alt was accepted and
 * stored, and `Testimonial.collection.findOne` confirmed `photoAlt: undefined`
 * on disk.
 *
 * CLAUDE.md requires alt text on every image before save, and calls for exactly
 * this second line of defence on any model whose rule lives in validation the
 * query path skips. The admin routes all use `findById` → assign → `save()`, so
 * nothing today reaches this — which is the point. It is here for the migration
 * script that has not been written yet.
 *
 * The update is merged onto the stored document before testing, because either
 * half can create the violation: an update that adds a photo to a record with
 * no alt, or one that clears the alt on a record that has a photo.
 */
TestimonialSchema.pre('findOneAndUpdate', async function () {
  const update = (this.getUpdate() ?? {}) as Record<string, unknown> & {
    $set?: Record<string, unknown>;
    $unset?: Record<string, unknown>;
  };

  const set = { ...update, ...(update.$set ?? {}) };
  const unset = update.$unset ?? {};

  const touchesImage =
    'photo' in set || 'photoAlt' in set || 'photo' in unset || 'photoAlt' in unset;

  // Nothing about the image is changing, so nothing here can be broken by it.
  if (!touchesImage) return;

  const current = await this.model
    .findOne(this.getQuery())
    .select('photo photoAlt')
    .lean<{ photo?: string; photoAlt?: string }>()
    .exec();

  function resolve(field: 'photo' | 'photoAlt'): string {
    if (field in unset) return '';
    if (field in set) return String(set[field] ?? '').trim();
    return (current?.[field] ?? '').trim();
  }

  if (resolve('photo') && !resolve('photoAlt')) {
    /*
     * A thrown Error, not a ValidationError. Query middleware has no document
     * to attach field errors to, so this surfaces as a plain message with no
     * field mapping — which CLAUDE.md warns admin error handling has to cope
     * with. Nothing in the admin hits this path; a script will see the message.
     */
    throw new Error(
      'A testimonial photo requires alt text. Set photoAlt in the same update, or use findById + save().'
    );
  }
});

const Testimonial: Model<ITestimonial> =
  mongoose.models.Testimonial ||
  mongoose.model<ITestimonial>('Testimonial', TestimonialSchema);

export default Testimonial;
