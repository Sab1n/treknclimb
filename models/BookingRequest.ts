import mongoose, { Schema, Model, Types } from 'mongoose';
import { ITrip } from './Trip';
import {
  BOOKING_STATUSES,
  CONTACT_CHANNELS,
  type BookingStatus,
  type ContactChannel,
} from './shared/bookingStatus';
import {
  DEPARTURE_CHECKS,
  TRIP_TYPES,
  type DepartureCheck,
  type TripType,
} from './shared/departures';

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

/**
 * The departure the visitor chose, **as it was when they submitted**.
 *
 * The same reasoning as `tripTitle`. `departureId` is a reference —
 * `<season id>:<date>` — and a reference can stop resolving: the season is
 * deleted, or its range or pattern is edited so the date is no longer
 * generated, or its price is changed. The inquiry must still say which dates
 * and what price the customer asked about, so those are copied here at
 * submission and never recomputed.
 *
 * Computed **on the server from the trip's own seasons**, never taken from the
 * payload — the form sends only the id. A price the visitor could edit on the
 * way in is not a record of the price they were shown.
 */
export interface IDepartureSnapshot {
  startDate: Date;
  /** The trip's last day: start plus `durationDays - 1`, as it was then. */
  endDate: Date;
  /**
   * Null when the departure was already `gone` at submission — there is no
   * price to record for a departure that no longer existed.
   */
  pricePerPerson: number | null;
  /**
   * What the departure was when the inquiry arrived. Anything but
   * `available` is the flag: the inquiry is saved regardless — never lose a
   * lead — and the office knows to offer another date.
   */
  statusAtSubmission: DepartureCheck;
}

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
  /**
   * Group departure or private trip — **the visitor's choice** on the form,
   * not inferred from whether a date is present.
   *
   * `| null`, not `?`: the key is always written, and null is a real value —
   * a general inquiry that names no trip has no trip type. Inquiries from
   * before this field existed were given null by
   * `scripts/migrate-booking-departures.ts`, which is also true: nobody was
   * asked.
   */
  tripType: TripType | null;
  /**
   * `<season id>:<YYYY-MM-DD>` — the identity `departureId()` in
   * `lib/departures.ts` builds. Set only for a group inquiry. The admin looks
   * it up again to say whether the departure is still available *now*.
   */
  departureId: string | null;
  /** Set whenever `departureId` is; see `IDepartureSnapshot`. */
  departureSnapshot: IDepartureSnapshot | null;
  /**
   * The start date they asked for. For a group inquiry, the departure's date —
   * so the list's date column and its sort mean the same thing for both kinds.
   */
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

/*
 * `_id: false`: the snapshot is a value, not a thing with an identity of its
 * own. There is one per inquiry and nothing will ever point at it.
 *
 * No noMojibake plugin here or on the parent — BookingRequest records what
 * arrived, and is deliberately unguarded (see CLAUDE.md).
 */
const DepartureSnapshotSchema = new Schema<IDepartureSnapshot>(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    pricePerPerson: { type: Number, min: 0, default: null },
    statusAtSubmission: { type: String, required: true, enum: [...DEPARTURE_CHECKS] },
  },
  { _id: false }
);

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
    tripType: {
      type: String,
      // `null` in the enum: the enum validator only skips `undefined`.
      enum: [...TRIP_TYPES, null],
      default: null,
      index: true,
    },
    departureId: {
      type: String,
      default: null,
      match: /^[0-9a-f]{24}:\d{4}-\d{2}-\d{2}$/,
    },
    departureSnapshot: { type: DepartureSnapshotSchema, default: null },
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

/*
 * The pairing rules, as a document hook so a script writing through Mongoose
 * cannot store a half-formed departure. A departure belongs to a group
 * inquiry, and an id without its snapshot is a reference with nothing to fall
 * back on — the exact failure the snapshot exists to prevent.
 */
BookingRequestSchema.pre('validate', function () {
  if (this.departureId && this.tripType !== 'group') {
    this.invalidate('departureId', 'Only a group inquiry has a departure.');
  }

  if (!!this.departureId !== !!this.departureSnapshot) {
    this.invalidate(
      'departureSnapshot',
      'A departure id and its snapshot are stored together or not at all.'
    );
  }
});

/*
 * The second line of defence CLAUDE.md asks for beside every validate hook.
 * Query middleware has no document, so it cannot re-check the pairing — but
 * these three fields are a record of what was submitted and nothing edits them
 * afterwards (the admin PATCH accepts status and notes only). So a query
 * update touching any of them is refused outright. A plain Error, not a
 * ValidationError: there is no document to key a field error to.
 */
const SUBMISSION_RECORD = ['tripType', 'departureId', 'departureSnapshot'];

BookingRequestSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
  const update = (this.getUpdate() ?? {}) as Record<string, unknown>;

  const touched = [update, update.$set, update.$unset]
    .filter((part): part is Record<string, unknown> => typeof part === 'object' && part !== null)
    .flatMap((part) => Object.keys(part))
    .some((key) => SUBMISSION_RECORD.some((field) => key === field || key.startsWith(`${field}.`)));

  if (touched) {
    throw new Error(
      'tripType, departureId and departureSnapshot record what was submitted and are not updated by query. Use findById + save() in a migration.'
    );
  }
});

// The admin inquiry list is "newest first, filtered by status".
BookingRequestSchema.index({ status: 1, createdAt: -1 });

const BookingRequest: Model<IBookingRequest> =
  mongoose.models.BookingRequest ||
  mongoose.model<IBookingRequest>('BookingRequest', BookingRequestSchema);

export default BookingRequest;
