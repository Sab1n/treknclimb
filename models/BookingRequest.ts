import mongoose, { Schema, Model, Types } from 'mongoose';
import { ITrip } from './Trip';
import {
  BOOKING_STATUSES,
  CONTACT_CHANNELS,
  type BookingStatus,
  type ContactChannel,
} from './shared/bookingStatus';

/**
 * A guest-submitted inquiry. The single conversion event on the site.
 *
 * The field list is SRS §11 and nothing beyond it. The v2 prototype's extra
 * questions (date flexibility, trekking experience) are mockup inventions and
 * are deliberately absent — per the precedence rule, v2 shows what the site
 * looks like, not what it stores.
 *
 * No pageview, session or funnel data lives here either — conversion rates and
 * drop-off come from GA4. This document holds what staff need to answer the
 * inquiry and what the admin list needs to sort and filter it.
 */

/*
 * The vocabularies live in `shared/bookingStatus.ts` and are re-exported here
 * so every existing `from './BookingRequest'` import keeps working. They had to
 * move: the admin status dropdown is a Client Component, and importing them
 * from this file dragged Mongoose — and through it the MongoDB driver's `net`
 * and `tls` requires — into the browser bundle.
 */
export {
  BOOKING_STATUSES,
  CONTACT_CHANNELS,
  type BookingStatus,
  type ContactChannel,
} from './shared/bookingStatus';

export interface IBookingRequest {
  _id: Types.ObjectId;
  /**
   * Human-readable reference. Format `TNC-{year}-{4-digit sequence}`, e.g.
   * TNC-2026-0417.
   *
   * Required and unique, but deliberately NOT generated here — the booking
   * route handler allocates it, because a model hook is the wrong place for a
   * sequence. The allocation must not collide under concurrent submissions:
   * two inquiries arriving in the same tick must not claim the same number.
   * The unique index below is the last line of defence, not the mechanism.
   */
  reference: string;

  // --- customer ---
  /** One field, per SRS §11. Splitting names on a space is wrong for most of the world. */
  name: string;
  email: string;
  phone?: string;

  /**
   * Country name, required. A deliberate amendment to SRS §11 — see CLAUDE.md.
   *
   * Nepal's trekking permit fees and visa rules differ by nationality, so a
   * quote cannot be accurate without it. Stored as the name rather than an ISO
   * code so it reads correctly in the admin list, the notification email and
   * any export, and constrained to `lib/countries.ts` by the validator so it
   * stays filterable.
   */
  nationality: string;

  // --- request ---
  /**
   * Nullable, not optional: a general inquiry that names no trip is a real and
   * expected case, not missing data.
   */
  trip: Types.ObjectId | null;
  /**
   * The trip's title **as it was when the inquiry was submitted**.
   *
   * A snapshot, not a convenience. `trip` is a reference, and a reference can
   * stop resolving: a draft trip that is deleted leaves `populate('trip')`
   * returning null, and every admin screen then shows the inquiry as a
   * "General inquiry" — an inquiry that says nothing about what was asked. The
   * customer is still waiting for an answer about a specific trek.
   *
   * It also survives a rename honestly. If the trip is retitled next season,
   * this still records what the visitor actually clicked, which is what an
   * inquiry thread six months old needs to say.
   *
   * Optional because a general inquiry names no trip, and because inquiries
   * taken before this field existed have none — the admin falls back through
   * `trip?.title` → `tripTitle` → "General inquiry".
   */
  tripTitle?: string;
  preferredDate?: Date;
  travellers: number;
  message?: string;
  preferredChannel: ContactChannel;

  /**
   * When the visitor ticked the consent box, set by the route handler at
   * submission.
   *
   * Required, and stored explicitly rather than left implied by the record
   * existing at all. A year later, "they must have consented, the row is here"
   * is an inference; a timestamp is evidence. It also pins *which* wording was
   * agreed to — `lib/consent.ts` carries the statement and the date it took
   * effect, so a `consentedAt` maps to a version rather than to whatever the
   * form happens to say today.
   */
  consentedAt: Date;

  // --- admin ---
  status: BookingStatus;
  /** Null until the status first moves off Pending. */
  statusUpdatedAt: Date | null;
  internalNotes?: string;
  /** The page the form was submitted from, e.g. /nepal/trekking/everest-base-camp. */
  sourcePage?: string;

  /** `createdAt` is the submitted-at timestamp. */
  createdAt: Date;
  updatedAt: Date;
}

/** After `.populate('trip')`. */
export interface IBookingRequestPopulated
  extends Omit<IBookingRequest, 'trip'> {
  trip: ITrip | null;
}

const BookingRequestSchema = new Schema<IBookingRequest>(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    name: { type: String, required: true, trim: true },
    // Indexed because the rate limiter and the admin search both key on it.
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: { type: String, trim: true },
    // Indexed: "which markets are inquiring" is a question the admin list will
    // be asked, and it is the reason this is a closed list rather than free
    // text.
    nationality: { type: String, required: true, trim: true, index: true },

    trip: { type: Schema.Types.ObjectId, ref: 'Trip', default: null, index: true },
    tripTitle: { type: String, trim: true },
    preferredDate: { type: Date },
    travellers: { type: Number, required: true, min: 1 },
    message: { type: String },
    preferredChannel: {
      type: String,
      required: true,
      enum: [...CONTACT_CHANNELS],
      default: 'email',
    },
    // No default: consent has to be an act, not something the schema fills in.
    consentedAt: { type: Date, required: true },

    status: {
      type: String,
      required: true,
      enum: [...BOOKING_STATUSES],
      default: 'Pending',
      index: true,
    },
    statusUpdatedAt: { type: Date, default: null },
    internalNotes: { type: String },
    sourcePage: { type: String, trim: true },
  },
  { timestamps: true }
);

// The admin inquiry list is "newest first, filtered by status".
BookingRequestSchema.index({ status: 1, createdAt: -1 });

const BookingRequest: Model<IBookingRequest> =
  mongoose.models.BookingRequest ||
  mongoose.model<IBookingRequest>('BookingRequest', BookingRequestSchema);

export default BookingRequest;
