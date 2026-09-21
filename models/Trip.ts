import mongoose, { Schema, Model, Types, UpdateQuery } from 'mongoose';

import { noMojibakePlugin } from './shared/noMojibake';
import Destination, { IDestination } from './Destination';
import { IActivity } from './Activity';
import { ISeoFields, seoFields } from './shared/seo';
import { reservedSlugValidator } from './shared/reservedSlugs';
import { PublishStatus, PUBLISH_STATUSES } from './shared/status';
import {
  MONTHS,
  TRIP_DIFFICULTIES,
  type Month,
  type TripDifficulty,
} from './shared/tripVocab';
import {
  EXCEPTION_STATUSES,
  SEASON_PATTERNS,
  type ExceptionStatus,
  type SeasonPattern,
} from './shared/departures';
import { exceptionProblems, seasonOverlaps, toIsoDate } from '../lib/departures';

/*
 * The month and difficulty vocabularies live in `shared/tripVocab.ts` and are
 * re-exported here so every existing `from './Trip'` import keeps working.
 * They moved because the trip editor's month and difficulty controls are
 * Client Components, and importing them from this file would drag Mongoose —
 * and through it the MongoDB driver's `net` and `tls` requires — into the
 * browser bundle.
 */
export { MONTHS, TRIP_DIFFICULTIES } from './shared/tripVocab';
export type { Month, TripDifficulty } from './shared/tripVocab';
export {
  DEPARTURE_STATUSES,
  DEPARTURE_STATUS_LABELS,
  EXCEPTION_STATUSES,
  SEASON_PATTERNS,
  ISO_WEEKDAYS,
} from './shared/departures';
export type {
  DepartureStatus,
  ExceptionStatus,
  SeasonPattern,
} from './shared/departures';


/* ------------------------------------------------------------------ *
 * Embedded subdocument shapes
 *
 * These live inside a Trip document rather than in their own collection.
 * Each gets its own interface and its own Schema, and the parent declares
 * the field as a plain array — `itinerary: IItineraryDay[]`.
 *
 * `_id` is optional on every one of these. Mongoose gives each subdocument
 * an _id when it saves, but an object built in an admin form before saving
 * does not have one yet, so `_id?:` lets the same interface describe both
 * states.
 * ------------------------------------------------------------------ */

export interface IGroupPriceTier {
  _id?: Types.ObjectId;
  minPeople: number;
  maxPeople: number;
  pricePerPerson: number;
  /** The "what changes" column — "Private guide throughout", "Second guide added". */
  label?: string;
}

/**
 * One date in a season that departs differently from the rest of it.
 *
 * `status` is `ExceptionStatus | null`, not optional. Null is a real value:
 * "this date still runs" — the case where the exception exists only to give
 * the date its own price. `pricePerPerson` is null when the season's price
 * applies. An exception must do at least one of the two; one that does neither
 * is rejected, because it would be a row that looks meaningful and changes
 * nothing.
 *
 * No `_id` is relied on. A departure's identity is the **season's** id plus
 * the date, so an exception can be removed and re-added without changing
 * which departure an inquiry points at.
 */
export interface IDepartureException {
  _id?: Types.ObjectId;
  date: Date;
  status: ExceptionStatus | null;
  pricePerPerson: number | null;
}

/**
 * A departure season: a date range, a pattern, a price per person, and the
 * dates that are exceptions to it.
 *
 * ## Seasons, not departures
 *
 * A trek that leaves daily from October to December is ninety departures.
 * Storing ninety rows would make the office type ninety rows, and a price
 * change ninety edits. So the season is stored, and the departures are
 * **generated** from it by `generateDepartures()` in `lib/departures.ts` —
 * the one generator the page, the rail, the editor and the validators below
 * all use. A season whose start equals its end is a single departure: one
 * model, not two.
 *
 * ## Dates, not instants
 *
 * `startDate`, `endDate` and every exception `date` are **calendar dates**,
 * stored at UTC midnight because MongoDB has no date-only type. They are the
 * range of days a group can **start** on; the trip's own end date is derived
 * from `durationDays`. Nothing may run them through a time zone — see
 * `lib/departures.ts`.
 *
 * ## Identity
 *
 * A generated departure is identified by `<season _id>:<YYYY-MM-DD>`. Part two
 * stores that on an inquiry, so the season's `_id` must survive an edit to its
 * price or exceptions — the save route carries it through (`keptId`) rather
 * than rebuilding the array with fresh ids.
 *
 * ## What is deliberately absent
 *
 * No capacity or places-booked figure, no "guaranteed" flag, no "past"
 * status. A date that has gone is simply not generated any more.
 */
export interface IDepartureSeason {
  _id?: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  pattern: SeasonPattern;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. Used only by `weekdays`. */
  weekdays: number[];
  /** USD, like every stored price. Flat for the season — no tiers. */
  pricePerPerson: number;
  exceptions: IDepartureException[];
}

/**
 * A span when a **private** trip cannot run — a festival, a closure, the
 * office's own leave. Group departures ignore it; they carry their own dates.
 *
 * Inclusive at both ends: a period from 20 to 24 December blocks the 24th.
 * `reason` is optional and shown to the visitor when present, so it is written
 * for them ("Tihar — lodges closed") rather than as an internal note.
 */
export interface IBlackoutPeriod {
  _id?: Types.ObjectId;
  start: Date;
  end: Date;
  reason?: string;
}

export interface IItineraryDay {
  _id?: Types.ObjectId;
  day: number;
  title: string;
  description: string;
  location?: string;
  /**
   * Optional in the type, conditionally required at save time: mandatory when
   * the parent trip has `hasElevationProfile`, ignorable otherwise. A city tour
   * has no meaningful per-day altitude and must still be savable.
   */
  maxAltitudeM?: number;
  distanceKm?: number;
  durationHours?: number;
  accommodation?: string;
  meals?: string;
  image?: string;
  imageAlt?: string;
}

export interface IGalleryImage {
  _id?: Types.ObjectId;
  url: string;
  alt: string;
  caption?: string;
}

export interface ITripFaq {
  _id?: Types.ObjectId;
  question: string;
  answer: string;
}

export interface ITrip extends ISeoFields {
  _id: Types.ObjectId;

  // --- basic info ---
  title: string;
  slug: string;
  /** Every slug this trip has ever had, for the 301 catch-all. */
  slugHistory: string[];
  tripCode?: string;
  destination: Types.ObjectId;
  /**
   * Nullable, never optional. Nepal trips carry an Activity; India, Tibet and
   * Bhutan trips are null. `Types.ObjectId | null` says the key is always
   * present and null is a real, meaningful value. `activity?:` would say the
   * key might be absent, which is a different — and wrong — claim.
   */
  activity: Types.ObjectId | null;

  // --- the three prose fields, each with one job ---
  /** Card and listing teaser. One or two lines. */
  summary: string;
  /**
   * The answer block near the top of the trip page: cost, duration, difficulty
   * and season in plain sentences. Authored, never generated — it is the
   * AI-extraction target and it converts.
   */
  answerBlock: string;
  /** Long-form overview body. */
  description: string;

  coverImage: string;
  coverImageAlt: string;
  gallery: IGalleryImage[];

  // --- trip facts ---
  durationDays: number;
  /**
   * Optional: "Moderate" is meaningless for a city tour or a jungle safari.
   * Cards and filters must handle its absence.
   */
  difficulty?: TripDifficulty;
  /**
   * Whether this trip has a meaningful altitude profile. Treks, hikes and peak
   * climbs do; city tours and safaris do not.
   *
   * Controls two things and nothing else: whether `itinerary[].maxAltitudeM` is
   * required on save, and whether the elevation graph renders. Turning it off
   * never deletes stored altitudes — unticking a box is usually a mistake, and
   * silently destroying data on the strength of one is unforgivable. The values
   * stay put and reappear if it is ticked again.
   */
  hasElevationProfile: boolean;
  /** Optional editorial grade, distinct from the difficulty enum. */
  tripGrade?: string;
  maxAltitudeM?: number;
  /**
   * The geographic region — Everest, Annapurna, Langtang, Manaslu.
   *
   * `Types.ObjectId | null`, never `region?: ...`, for the same reason
   * `activity` is: the key is always present and **null is a real, meaningful
   * value** rather than missing data. Most trips genuinely have no region —
   * India and Bhutan have no region pages, and a city tour is not in a trekking
   * region at all — so `?` would scatter `undefined` checks through code that
   * has to handle "no region" as an ordinary case either way.
   *
   * It was free text (`region?: string`) until regions became a collection. See
   * `scripts/migrate-trip-region-ref.ts`.
   */
  region: Types.ObjectId | null;
  peakName?: string;
  minGroupSize: number;
  maxGroupSize: number;
  bestMonths: Month[];
  startPoint: string;
  endPoint: string;
  accommodation?: string;
  meals?: string;
  transportation?: string;

  // --- pricing (USD is the stored base, always) ---
  price: number;
  discountedPrice?: number;
  /** Display override, e.g. "From USD 1,299 per person". */
  priceLabel?: string;
  groupPricing: IGroupPriceTier[];
  /**
   * Group departure seasons. May be empty — a trip with none is sold as
   * private only — but never `undefined` once migrated: the schema defaults it
   * to `[]`, and scripts/migrate-departures-to-seasons.ts wrote it onto every
   * trip that predated it, because `.lean()` reads skip schema defaults.
   */
  departureSeasons: IDepartureSeason[];
  /** Dates a private trip cannot start. See IBlackoutPeriod. */
  blackoutPeriods: IBlackoutPeriod[];

  // --- content ---
  highlights: string[];
  itinerary: IItineraryDay[];
  includes: string[];
  excludes: string[];
  faqs: ITripFaq[];
  relatedTrips: Types.ObjectId[];

  // --- display and social proof ---
  /** Card badge — "Most booked", "Best for beginners". */
  badge?: string;
  travellersCompleted?: number;
  /**
   * Display-only, always shown with attribution ("4.9 on TripAdvisor from 186
   * reviews"). Never emitted as `aggregateRating` in JSON-LD — the reviews are
   * not collected first-party, and doing so risks a manual action.
   */
  ratingAverage?: number;
  ratingCount?: number;
  ratingSource?: string;

  createdAt: Date;
  updatedAt: Date;

  // --- publishing ---
  status: PublishStatus;
  featured: boolean;
  displayOrder: number;
}

/**
 * The same trip after `.populate('destination activity')`.
 *
 * `Omit<ITrip, 'activity' | 'destination'>` means "every field of ITrip except
 * those two". The interface then redeclares just the two, so every other field
 * stays tied to ITrip — add a field above and it appears here automatically.
 *
 * `activity` stays nullable: populating a null reference leaves it null.
 */
export interface ITripPopulated
  extends Omit<ITrip, 'activity' | 'destination'> {
  activity: IActivity | null;
  destination: IDestination;
}

/* ------------------------------------------------------------------ *
 * Subdocument schemas
 * ------------------------------------------------------------------ */

const GroupPriceTierSchema = new Schema<IGroupPriceTier>({
  minPeople: { type: Number, required: true, min: 1 },
  maxPeople: { type: Number, required: true, min: 1 },
  pricePerPerson: { type: Number, required: true, min: 0 },
  label: { type: String, trim: true },
});

/**
 * Validators that need the rest of the subdocument read it through `this`, so
 * they are `function`, never arrow functions — an arrow function has no
 * `this` of its own.
 *
 * Mongoose types that `this` as **the subdocument or a Query**, and the type
 * is telling the truth: on `save()` it is the subdocument, under
 * `runValidators` on an update it is the Query, which has none of these
 * fields. The `'startDate' in this` test is a **type guard** — inside it,
 * TypeScript narrows the union to the member that has the property. Outside
 * it, the rule returns false and fails *closed*. Admin writes go through
 * `save()` regardless.
 */
const DepartureExceptionSchema = new Schema<IDepartureException>({
  date: { type: Date, required: true },
  /*
   * `null` is listed in the enum because Mongoose's enum validator only skips
   * `undefined`. Without it, "runs as normal at its own price" — status null —
   * would be rejected as not one of the allowed values.
   */
  status: { type: String, enum: [...EXCEPTION_STATUSES, null], default: null },
  pricePerPerson: { type: Number, min: 0, default: null },
});

const DepartureSeasonSchema = new Schema<IDepartureSeason>({
  startDate: { type: Date, required: true },
  /*
   * On or after the start — **not** strictly after, unlike a blackout period.
   * A season whose end equals its start is a single departure, which is how
   * a one-off date is entered.
   */
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function (end: Date) {
        if (!('startDate' in this) || !this.startDate) return false;

        return end.getTime() >= this.startDate.getTime();
      },
      message: 'A season cannot end before it starts.',
    },
  },
  pattern: { type: String, enum: SEASON_PATTERNS, required: true, default: 'daily' },
  weekdays: {
    type: [{ type: Number, min: 1, max: 7 }],
    default: [],
    validate: {
      validator: function (weekdays: number[]) {
        if (!('pattern' in this)) return false;

        return this.pattern !== 'weekdays' || weekdays.length > 0;
      },
      message: 'Choose at least one day of the week.',
    },
  },
  pricePerPerson: { type: Number, required: true, min: 0 },
  exceptions: {
    type: [DepartureExceptionSchema],
    default: [],
    /*
     * The same rule the Zod schema applies, from the same function, so the two
     * cannot disagree about what a valid exception is: on a date the season
     * departs, doing something, and not repeated.
     */
    validate: {
      validator: function (exceptions: IDepartureException[]) {
        if (!('startDate' in this) || !this.startDate || !this.endDate) return false;

        const problems = exceptionProblems(
          {
            startDate: toIsoDate(this.startDate),
            endDate: toIsoDate(this.endDate),
            pattern: this.pattern,
            weekdays: this.weekdays,
          },
          exceptions.map((exception) => ({
            date: toIsoDate(exception.date),
            status: exception.status,
            pricePerPerson: exception.pricePerPerson,
          }))
        );

        return problems.size === 0;
      },
      message:
        'Every exception must fall on a date this season departs, mark it full or closed or give it a price, and appear only once.',
    },
  },
});

/**
 * Strictly after, unlike a season: a blackout whose end equals its start is a
 * typo more often than a one-day closure, and a one-day closure is written as
 * the 25th to the 26th.
 */
const BlackoutPeriodSchema = new Schema<IBlackoutPeriod>({
  start: { type: Date, required: true },
  end: {
    type: Date,
    required: true,
    validate: {
      validator: function (end: Date) {
        if (!('start' in this) || !this.start) return false;

        return end.getTime() > this.start.getTime();
      },
      message: 'A blackout period must end after it starts.',
    },
  },
  reason: { type: String, trim: true },
});

const ItineraryDaySchema = new Schema<IItineraryDay>({
  day: { type: Number, required: true, min: 1 },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  location: { type: String, trim: true },
  /**
   * Conditionally required, and the condition lives on the *parent* document.
   *
   * Inside a subdocument validator `this` is the subdocument, not the Trip — so
   * `this.hasElevationProfile` would always be undefined. Mongoose gives every
   * subdocument a `.parent()` (the document it is embedded in) and an
   * `.ownerDocument()` (the top-level document). `itinerary` hangs directly off
   * Trip, so both return the same thing here; `parent()` is the narrower claim.
   *
   * The `typeof` guard matters: this same function runs against plain objects
   * during some code paths, and those have no `.parent` method at all.
   */
  maxAltitudeM: {
    type: Number,
    min: 0,
    required: function (this: IItineraryDay & { parent?: () => ITrip }) {
      const trip = typeof this.parent === 'function' ? this.parent() : undefined;

      return trip?.hasElevationProfile === true;
    },
  },
  distanceKm: { type: Number, min: 0 },
  durationHours: { type: Number, min: 0 },
  accommodation: { type: String, trim: true },
  meals: { type: String, trim: true },
  image: { type: String, trim: true },
  // Alt text is required on every image before save — so it is required only
  // when there is an image to describe.
  imageAlt: {
    type: String,
    trim: true,
    required: function (this: IItineraryDay) {
      return !!this.image;
    },
  },
});

const GalleryImageSchema = new Schema<IGalleryImage>({
  url: { type: String, required: true },
  alt: { type: String, required: true, trim: true },
  caption: { type: String, trim: true },
});

const TripFaqSchema = new Schema<ITripFaq>({
  question: { type: String, required: true, trim: true },
  answer: { type: String, required: true },
});

/* ------------------------------------------------------------------ *
 * Trip schema
 * ------------------------------------------------------------------ */

/**
 * Required only once the trip is live.
 *
 * Used by the five fields a draft cannot yet have. Written as a named function
 * rather than inline so the rule reads the same on every field it guards, and
 * so there is one place to change what "complete enough to publish" means.
 *
 * A normal function, not an arrow: Mongoose calls `required` with `this` bound
 * to the document, and an arrow would capture the module scope instead.
 */
function requiredToPublish(this: { status?: PublishStatus }): boolean {
  return this.status === 'published';
}

const TripSchema = new Schema<ITrip>(
  {
    title: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // A trip slug is the last URL segment, directly under a destination for
      // non-Nepal trips (/india/markha-valley).
      validate: reservedSlugValidator('/<destination>'),
    },
    slugHistory: { type: [String], default: [] },
    // Sparse, so any number of drafts can exist without one, but any code that
    // is set has to be unique.
    tripCode: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    destination: {
      type: Schema.Types.ObjectId,
      ref: 'Destination',
      required: true,
      index: true,
    },
    activity: {
      type: Schema.Types.ObjectId,
      ref: 'Activity',
      default: null,
      index: true,
    },

    /*
     * The five fields below are **required to publish, not required to exist**.
     *
     * They were unconditionally required, and that made creating a trip
     * impossible. `coverImage` is the proof: the only way to obtain one is a
     * signed Cloudinary upload, and the signing endpoint derives the public ID
     * from an existing trip's slug — so a cover image cannot exist before the
     * trip does, and the trip could not be saved without one. A deadlock, not a
     * missing feature.
     *
     * Loosening them outright would be wrong in the other direction: a trip
     * with no description must never reach the site. So `status` is the gate.
     * A draft is by definition unfinished; publishing is the act that claims it
     * is not, and that is where the check belongs.
     *
     * This is the same conditional-required pattern the model already uses
     * twice — `imageAlt` when there is an image, `maxAltitudeM` when the trip
     * has an elevation profile. Non-arrow functions, because `this` has to be
     * the document being validated.
     *
     * `archived` is deliberately not gated: archiving is how a trip is retired,
     * and refusing to archive an incomplete one would trap it as a draft
     * forever.
     */
    summary: { type: String, required: requiredToPublish },
    answerBlock: { type: String, required: requiredToPublish },
    description: { type: String, required: requiredToPublish },

    coverImage: { type: String, required: requiredToPublish },
    coverImageAlt: { type: String, required: requiredToPublish },
    gallery: { type: [GalleryImageSchema], default: [] },

    durationDays: { type: Number, required: true, min: 1 },
    // Optional — see the interface. A city tour has no difficulty grade.
    difficulty: { type: String, enum: [...TRIP_DIFFICULTIES] },
    hasElevationProfile: { type: Boolean, default: false },
    tripGrade: { type: String, trim: true },
    maxAltitudeM: { type: Number, min: 0 },
    /*
     * `default: null` rather than no default, so the key exists on every
     * document. A ref that is sometimes absent and sometimes null is two shapes
     * for one meaning, and the query `{ region: null }` matches both only by
     * accident of how MongoDB treats missing keys.
     */
    region: {
      type: Schema.Types.ObjectId,
      ref: 'Region',
      default: null,
      index: true,
    },
    peakName: { type: String, trim: true },
    minGroupSize: { type: Number, default: 1, min: 1 },
    maxGroupSize: { type: Number, default: 12, min: 1 },
    bestMonths: { type: [String], enum: [...MONTHS], default: [] },
    startPoint: { type: String, required: true, trim: true },
    endPoint: { type: String, required: true, trim: true },
    accommodation: { type: String, trim: true },
    meals: { type: String, trim: true },
    transportation: { type: String, trim: true },

    price: { type: Number, required: true, min: 0 },
    discountedPrice: { type: Number, min: 0 },
    priceLabel: { type: String, trim: true },
    groupPricing: { type: [GroupPriceTierSchema], default: [] },
    departureSeasons: {
      type: [DepartureSeasonSchema],
      default: [],
      /*
       * No two seasons may depart on the same date — two prices and two
       * identities for one departure is a data-entry mistake, and a different
       * price on part of a season is what an exception is for. Same function
       * as the Zod schema and the editor's live check; see `seasonOverlaps`.
       *
       * On the array, not on a season, because the rule is about pairs. The
       * error arrives keyed `departureSeasons`, which the Departures tab
       * renders above the list.
       */
      validate: {
        validator: function (seasons: IDepartureSeason[]) {
          return (
            seasonOverlaps(
              seasons.map((season) => ({
                // A season missing a date fails its own `required`; here it
                // is skipped rather than allowed to throw.
                startDate: season.startDate ? toIsoDate(season.startDate) : '',
                endDate: season.endDate ? toIsoDate(season.endDate) : '',
                pattern: season.pattern,
                weekdays: season.weekdays,
              }))
            ).size === 0
          );
        },
        message: 'Two seasons depart on the same date. Each date may belong to one season only.',
      },
    },
    blackoutPeriods: { type: [BlackoutPeriodSchema], default: [] },

    highlights: { type: [String], default: [] },
    itinerary: { type: [ItineraryDaySchema], default: [] },
    includes: { type: [String], default: [] },
    excludes: { type: [String], default: [] },
    faqs: { type: [TripFaqSchema], default: [] },
    relatedTrips: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Trip' }],
      default: [],
    },

    badge: { type: String, trim: true },
    travellersCompleted: { type: Number, min: 0 },
    ratingAverage: { type: Number, min: 0, max: 5 },
    ratingCount: { type: Number, min: 0 },
    ratingSource: { type: String, trim: true },

    ...seoFields,

    status: {
      type: String,
      required: true,
      enum: [...PUBLISH_STATUSES],
      default: 'draft',
    },
    featured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Listing queries filter on these three together.
TripSchema.index({ destination: 1, activity: 1, status: 1 });
// The 301 catch-all looks up retired slugs.
TripSchema.index({ slugHistory: 1 });

/**
 * The Nepal asymmetry, checked against the destination document rather than a
 * hardcoded name: a destination with `hasActivities` requires an activity, one
 * without requires null.
 *
 * `pre('validate')` runs before Mongoose validates the document, so
 * `this.invalidate()` collects errors alongside the ordinary `required:`
 * failures and they all surface together in one ValidationError. Non-arrow
 * function, because `this` has to be the document being saved.
 */
async function assertActivityMatchesDestination(
  destinationId: Types.ObjectId,
  activityId: Types.ObjectId | null | undefined
): Promise<string | null> {
  const destination = await Destination.findById(destinationId)
    .select('name hasActivities')
    .lean();

  if (!destination) return 'Destination does not exist.';

  if (destination.hasActivities && !activityId) {
    return `${destination.name} trips must belong to an activity.`;
  }

  if (!destination.hasActivities && activityId) {
    return `${destination.name} has no activity layer — activity must be null.`;
  }

  return null;
}

TripSchema.pre('validate', async function () {
  if (!this.destination) return;

  const problem = await assertActivityMatchesDestination(
    this.destination,
    this.activity
  );

  if (problem) {
    this.invalidate(problem.startsWith('Destination') ? 'destination' : 'activity', problem);
  }
});

/**
 * Second line of defence. Query middleware does NOT run document validation,
 * so `findByIdAndUpdate` would otherwise skip the rule above entirely —
 * `runValidators: true` runs path validators only, never a `pre('validate')`
 * hook. Admin mutations are supposed to use findById → assign → save(); this
 * catches the cases that don't.
 *
 * Here `this` is the Query, not the document, so the effective destination and
 * activity have to be reconstructed from the update plus the stored document.
 */
TripSchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate() as UpdateQuery<ITrip> | null;
  if (!update) return;

  const set = (update.$set ?? {}) as Partial<ITrip>;
  const touchesDestination = 'destination' in update || 'destination' in set;
  const touchesActivity = 'activity' in update || 'activity' in set;

  // Nothing relevant is changing, so the stored pairing still holds.
  if (!touchesDestination && !touchesActivity) return;

  const current = await this.model
    .findOne(this.getFilter())
    .select('destination activity')
    .lean();

  const destinationId = touchesDestination
    ? ((set.destination ?? update.destination) as Types.ObjectId)
    : current?.destination;

  const activityId = touchesActivity
    ? ((set.activity ?? update.activity) as Types.ObjectId | null)
    : current?.activity;

  if (!destinationId) return;

  const problem = await assertActivityMatchesDestination(destinationId, activityId);

  // Throwing is how query middleware aborts. Note this surfaces as a plain
  // Error, not the ValidationError the document hook produces.
  if (problem) throw new Error(problem);
});

/**
 * Group pricing tiers must not overlap. A path validator rather than a hook,
 * so the error attaches to the field the admin editor renders.
 *
 * Flat-price vs lowest-tier reconciliation is deliberately NOT here — it is a
 * warning in the admin editor, not a save-blocking rule.
 */
TripSchema.path('groupPricing').validate(function (tiers: IGroupPriceTier[]) {
  if (!tiers || tiers.length === 0) return true;

  const sorted = [...tiers].sort((a, b) => a.minPeople - b.minPeople);

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].minPeople > sorted[i].maxPeople) return false;
    if (i > 0 && sorted[i].minPeople <= sorted[i - 1].maxPeople) return false;
  }

  return true;
}, 'Group pricing tiers must not overlap, and minPeople cannot exceed maxPeople.');

/*
 * Rejects U+FFFD on every string path, including the embedded
 * subdocuments. See models/shared/noMojibake.ts — the character only ever
 * means a decode failed upstream, so there is no legitimate value to lose.
 */
TripSchema.plugin(noMojibakePlugin);

const Trip: Model<ITrip> =
  mongoose.models.Trip || mongoose.model<ITrip>('Trip', TripSchema);

export default Trip;
