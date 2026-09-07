import mongoose, { Schema, Model, Types } from 'mongoose';

/**
 * The database-backed half of the redirect strategy. Static 301s from the
 * WordPress crawl live in `next.config.js`; this collection is the catch-all
 * that also absorbs slug history, and it is editable in the admin without a
 * deploy.
 *
 * `hitCount` and `lastHitAt` exist so the admin screen can show which legacy
 * URLs are actually being requested — that report is how missed redirects get
 * found in the two weeks after cutover.
 */

export const REDIRECT_TYPES = [301, 302, 307, 308] as const;
export type RedirectType = (typeof REDIRECT_TYPES)[number];

export interface IRedirect {
  _id: Types.ObjectId;
  /** Path only, leading slash, no domain — e.g. /trekking/everest-base-camp-trek. */
  oldUrl: string;
  newUrl: string;
  type: RedirectType;
  hitCount: number;
  lastHitAt: Date | null;
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const RedirectSchema = new Schema<IRedirect>(
  {
    // Unique and indexed: this is looked up on every 404, so it is the hottest
    // read in the migration path.
    oldUrl: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    newUrl: { type: String, required: true, trim: true },
    type: {
      type: Number,
      required: true,
      enum: [...REDIRECT_TYPES],
      default: 301,
    },
    hitCount: { type: Number, default: 0, min: 0 },
    lastHitAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const Redirect: Model<IRedirect> =
  mongoose.models.Redirect ||
  mongoose.model<IRedirect>('Redirect', RedirectSchema);

export default Redirect;
