import mongoose, { Schema, Model, Types } from 'mongoose';

/**
 * Every booking submission the server threw away, kept for 30 days.
 *
 * The spam checks on `POST /api/bookings` are deliberately opaque to the
 * sender — a bot that learns which check caught it can tune around it. The
 * cost of that opacity is that a false positive discards a real inquiry
 * silently. This collection is the receipt: when a customer says "I submitted
 * and heard nothing", the answer is a query rather than a guess.
 *
 * Nothing here is shown to the visitor, and none of it counts as a booking.
 * Infrastructure, not content.
 *
 * ## The TTL index
 *
 * `expires` on a Date path creates a MongoDB TTL index, and a background
 * thread deletes expired documents roughly once a minute. Two things follow:
 * deletion is approximate rather than instant, and the index only exists once
 * Mongoose has built it — which it does on first use, since `autoIndex`
 * defaults to on.
 *
 * The 30 days are the point, not a convenience. These payloads hold a real
 * person's name, email, phone and message, collected without them ever being
 * told it was kept. A window long enough to answer "did my inquiry arrive?"
 * and short enough not to become a shadow customer database is the whole
 * design.
 */

export const REJECTION_REASONS = [
  /** Hidden field was filled in. A certain bot, in practice. */
  'honeypot',
  /** Completed faster than a person can read the form. */
  'time-trap',
  /** Cloudflare said the token was not valid. */
  'turnstile',
  /** Too many submissions from this IP or this email address. */
  'rate-limit',
] as const;

/**
 * `as const` freezes the array into a tuple of literal types, and
 * `(typeof X)[number]` reads the union of its elements back out. So
 * `RejectionReason` is `'honeypot' | 'time-trap' | 'turnstile' | 'rate-limit'`
 * — one list, used as both the runtime enum and the compile-time type, with no
 * way for the two to drift apart.
 */
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/**
 * Which form the rejection came from.
 *
 * Without this the log is unreadable the moment a second form exists — a row
 * holding `{ email }` could be a newsletter signup or a booking that failed
 * before the other fields mattered, and "did my inquiry arrive?" needs to know
 * which one it was.
 */
export const REJECTED_FORMS = ['booking', 'newsletter'] as const;

export type RejectedForm = (typeof REJECTED_FORMS)[number];

export interface IRejectedSubmission {
  _id: Types.ObjectId;
  form: RejectedForm;
  reason: RejectionReason;
  /** Which limit, how many milliseconds, which Turnstile error code. */
  detail?: string;
  ip: string;
  userAgent?: string;
  /** The `referer` header — which page the form was submitted from. */
  sourcePage?: string;
  /**
   * Lifted out of the payload and indexed, because "did this person submit?"
   * is the question the collection exists to answer.
   */
  email?: string;
  /**
   * The whole submission as received, minus the Turnstile token. `Mixed`
   * because a rejected payload has no guaranteed shape — that is often why it
   * was rejected. Typed `Record<string, unknown>` rather than `any`: reading a
   * field forces a narrowing check instead of silently compiling.
   */
  payload: Record<string, unknown>;
  /** Write-once, and the field the TTL index is built on. */
  createdAt: Date;
}

const RejectedSubmissionSchema = new Schema<IRejectedSubmission>(
  {
    reason: {
      type: String,
      required: true,
      enum: [...REJECTION_REASONS],
      index: true,
    },
    detail: { type: String, trim: true },
    ip: { type: String, required: true, index: true },
    userAgent: { type: String, trim: true },
    sourcePage: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },

    createdAt: {
      type: Date,
      default: Date.now,
      // 30 days, in seconds. Self-purging: nothing has to remember to clean up.
      expires: 60 * 60 * 24 * 30,
    },
  },
  // No `timestamps`: these are written once and never updated, and `createdAt`
  // is declared by hand above because the TTL index hangs off it.
  { timestamps: false, versionKey: false }
);

// The review query is "what got thrown away recently", newest first.
RejectedSubmissionSchema.index({ createdAt: -1 });

const RejectedSubmission: Model<IRejectedSubmission> =
  mongoose.models.RejectedSubmission ||
  mongoose.model<IRejectedSubmission>(
    'RejectedSubmission',
    RejectedSubmissionSchema
  );

export default RejectedSubmission;
