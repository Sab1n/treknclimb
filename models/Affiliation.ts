import mongoose, { Schema, Model, Types } from 'mongoose';

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
  logo: string;
  logoAlt: string;
  url: string;
  /** Left blank until the client supplies the real number. */
  registrationNumber?: string;
  displayOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

const AffiliationSchema = new Schema<IAffiliation>(
  {
    name: { type: String, required: true, trim: true },
    abbreviation: { type: String, required: true, trim: true },
    logo: { type: String, required: true, trim: true },
    logoAlt: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    registrationNumber: { type: String, trim: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Affiliation: Model<IAffiliation> =
  mongoose.models.Affiliation ||
  mongoose.model<IAffiliation>('Affiliation', AffiliationSchema);

export default Affiliation;
