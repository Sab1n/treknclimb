import mongoose, { Schema, Model, Types } from 'mongoose';

import { noMojibakePlugin } from './shared/noMojibake';

/**
 * Licensing and membership bodies — Department of Tourism, Nepal Tourism Board,
 * TAAN Pokhara, Nepal Mountaineering Association.
 *
 * Content, not chrome: these are a primary trust asset for a Nepali operator
 * selling to strangers abroad, and they feed `memberOf` in the Organization
 * JSON-LD as well as the row beside the booking CTA.
 */
export interface IAffiliation {
  _id: Types.ObjectId;
  name: string;
  abbreviation: string;
  /**
   * Cloudinary public ID. **Optional, and blank on every record today** — the
   * client has not supplied the logo files. The strip and the About page fall
   * back to `abbreviation` until one is uploaded, which is a real design
   * rather than a broken-image state.
   */
  logo?: string;
  /** Required once `logo` is set, and meaningless before then. */
  logoAlt?: string;
  url: string;
  /** Left blank until the client supplies the real number. Rendered only when
   *  it is filled in — an empty one shows nothing at all. */
  registrationNumber?: string;
  displayOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

const AffiliationSchema = new Schema<IAffiliation>(
  {
    name: { type: String, required: true, trim: true },
    abbreviation: { type: String, required: true, trim: true },
    logo: { type: String, trim: true },
    /*
     * Conditional `required`, the same rule as `Testimonial.photoAlt`: alt
     * text is required on every image before save, and an affiliation with no
     * logo has no image to describe. A non-arrow function so `this` is the
     * document.
     */
    logoAlt: {
      type: String,
      trim: true,
      required: function (this: IAffiliation) {
        return !!this.logo;
      },
    },
    url: { type: String, required: true, trim: true },
    registrationNumber: { type: String, trim: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/*
 * Rejects U+FFFD on every string path, including the embedded
 * subdocuments. See models/shared/noMojibake.ts — the character only ever
 * means a decode failed upstream, so there is no legitimate value to lose.
 */
AffiliationSchema.plugin(noMojibakePlugin);

/*
 * The backstop for the conditional `required` above.
 *
 * A conditional `required` function is document validation — its `this` is the
 * document, and query middleware has no document, so under
 * `findOneAndUpdate` the condition returns false and the rule silently does
 * not apply. That is exactly how a `Testimonial` once stored a photo with no
 * alt text. Nothing writes an affiliation this way today (the settings route
 * uses `findById` → assign → `save()`), which is the point: this is here for
 * the first thing that does.
 */
AffiliationSchema.pre('findOneAndUpdate', async function () {
  const update = (this.getUpdate() ?? {}) as Record<string, unknown> & {
    $set?: Record<string, unknown>;
  };

  const set = { ...update, ...(update.$set ?? {}) };

  if (!('logo' in set)) return;

  if (set.logo && !set.logoAlt) {
    throw new Error('The logo needs alt text.');
  }
});

const Affiliation: Model<IAffiliation> =
  mongoose.models.Affiliation ||
  mongoose.model<IAffiliation>('Affiliation', AffiliationSchema);

export default Affiliation;
