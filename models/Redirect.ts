import mongoose, { Schema, Model, Types } from 'mongoose';

import { noMojibakePlugin } from './shared/noMojibake';
import { REDIRECT_TYPES, type RedirectType } from './shared/redirectTypes';

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

/*
 * The status vocabulary lives in `shared/redirectTypes.ts` and is re-exported
 * here so every existing `from './Redirect'` import keeps working. It moved
 * because the redirects admin's select is a Client Component, and importing it
 * from this file would drag Mongoose — and through it the MongoDB driver's
 * `net` and `tls` requires — into the browser bundle.
 */
export { REDIRECT_TYPES } from './shared/redirectTypes';
export type { RedirectType } from './shared/redirectTypes';

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

/*
 * Rejects U+FFFD on every string path, including the embedded
 * subdocuments. See models/shared/noMojibake.ts — the character only ever
 * means a decode failed upstream, so there is no legitimate value to lose.
 */
RedirectSchema.plugin(noMojibakePlugin);

const Redirect: Model<IRedirect> =
  mongoose.models.Redirect ||
  mongoose.model<IRedirect>('Redirect', RedirectSchema);

export default Redirect;
