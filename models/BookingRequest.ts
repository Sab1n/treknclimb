import mongoose, { Schema, Model, Types } from 'mongoose';
import { ITrip } from './Trip';

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

export const BOOKING_STATUSES = [
  'Pending',
  'Contacted',
  'Confirmed',
  'Closed',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const CONTACT_CHANNELS = ['email', 'whatsapp', 'either'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

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

  // --- request ---
  /**
   * Nullable, not optional: a general inquiry that names no trip is a real and
   * expected case, not missing data.
   */
  trip: Types.ObjectId | null;
  preferredDate?: Date;
  travellers: number;
  message?: string;
  preferredChannel: ContactChannel;

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

    trip: { type: Schema.Types.ObjectId, ref: 'Trip', default: null, index: true },
    preferredDate: { type: Date },
    travellers: { type: Number, required: true, min: 1 },
    message: { type: String },
    preferredChannel: {
      type: String,
      required: true,
      enum: [...CONTACT_CHANNELS],
      default: 'email',
    },

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
