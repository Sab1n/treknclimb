import mongoose, { Schema, Model, Types } from 'mongoose';
import Destination, { IDestination } from './Destination';
import { IActivity } from './Activity';

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
}

export interface IItineraryDay {
  _id?: Types.ObjectId;
  day: number;
  title: string;
  description: string;
  distanceKm?: number;
  durationHours?: number;
  maxAltitudeM?: number;
  accommodation?: string;
  meals?: string;
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

/* ------------------------------------------------------------------ *
 * Union types for the enum fields.
 *
 * `TripDifficulty` is a union of string literals, not `string`. The compiler
 * rejects `difficulty = 'hard'` as a typo, and a switch over the value can be
 * checked for completeness. The `enum:` array in the schema enforces the same
 * rule at runtime — both are needed, because TypeScript is gone by the time a
 * request actually arrives.
 * ------------------------------------------------------------------ */

export type TripDifficulty =
  | 'easy'
  | 'moderate'
  | 'challenging'
  | 'strenuous'
  | 'extreme';

export type TripStatus = 'draft' | 'published' | 'archived';

export interface ITrip {
  _id: Types.ObjectId;

  // --- basic info ---
  title: string;
  slug: string;
  /** Every slug this trip has ever had, for the 301 catch-all. */
  slugHistory: string[];
  destination: Types.ObjectId;
  /**
   * Nullable, never optional. Nepal trips carry an Activity; India, Tibet and
   * Bhutan trips are null. `Types.ObjectId | null` says the key is always
   * present and null is a real, meaningful value. `activity?:` would say the
   * key might be absent, which is a different — and wrong — claim.
   */
  activity: Types.ObjectId | null;
  summary: string;
  description: string;
  coverImage: string;
  coverImageAlt: string;

  // --- trip facts (these feed the answer block and TouristTrip JSON-LD) ---
  durationDays: number;
  maxAltitudeM?: number;
  difficulty: TripDifficulty;
  minGroupSize: number;
  maxGroupSize: number;
  bestMonths: string[];
  startPoint: string;
  endPoint: string;
  accommodation?: string;
  meals?: string;
  transportation?: string;

  // --- pricing (USD is the stored base, always) ---
  price: number;
  groupPricing: IGroupPriceTier[];

  // --- content ---
  itinerary: IItineraryDay[];
  includes: string[];
  excludes: string[];
  gallery: IGalleryImage[];
  faqs: ITripFaq[];

  // --- SEO ---
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  schemaType?: string;
  noIndex: boolean;

  // --- publishing ---
  status: TripStatus;
  featured: boolean;
  displayOrder: number;
}

/**
 * The same trip after `.populate('destination activity')`.
 *
 * `Omit<ITrip, 'destination' | 'activity'>` means "every field of ITrip except
 * those two". Intersecting that (`&`) with new definitions swaps the two
 * reference fields for the full documents while every other field stays tied
 * to ITrip — add a field above and it appears here automatically.
 *
 * `activity` stays nullable: populating a null reference leaves it null.
 */
export type ITripPopulated = Omit<ITrip, 'destination' | 'activity'> & {
  destination: IDestination;
  activity: IActivity | null;
};

/* ------------------------------------------------------------------ *
 * Subdocument schemas
 * ------------------------------------------------------------------ */

const GroupPriceTierSchema = new Schema<IGroupPriceTier>({
  minPeople: { type: Number, required: true, min: 1 },
  maxPeople: { type: Number, required: true, min: 1 },
  pricePerPerson: { type: Number, required: true, min: 0 },
});

const ItineraryDaySchema = new Schema<IItineraryDay>({
  day: { type: Number, required: true, min: 1 },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  distanceKm: { type: Number, min: 0 },
  durationHours: { type: Number, min: 0 },
  maxAltitudeM: { type: Number, min: 0 },
  accommodation: { type: String, trim: true },
  meals: { type: String, trim: true },
});

const GalleryImageSchema = new Schema<IGalleryImage>({
  url: { type: String, required: true },
  // Required by the brief: alt text before save, not optional.
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

const TripSchema = new Schema<ITrip>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    slugHistory: { type: [String], default: [] },
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
    summary: { type: String, required: true },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    coverImageAlt: { type: String, required: true },

    durationDays: { type: Number, required: true, min: 1 },
    maxAltitudeM: { type: Number, min: 0 },
    difficulty: {
      type: String,
      required: true,
      enum: ['easy', 'moderate', 'challenging', 'strenuous', 'extreme'],
    },
    minGroupSize: { type: Number, default: 1, min: 1 },
    maxGroupSize: { type: Number, default: 12, min: 1 },
    bestMonths: { type: [String], default: [] },
    startPoint: { type: String, required: true, trim: true },
    endPoint: { type: String, required: true, trim: true },
    accommodation: { type: String, trim: true },
    meals: { type: String, trim: true },
    transportation: { type: String, trim: true },

    price: { type: Number, required: true, min: 0 },
    groupPricing: { type: [GroupPriceTierSchema], default: [] },

    itinerary: { type: [ItineraryDaySchema], default: [] },
    includes: { type: [String], default: [] },
    excludes: { type: [String], default: [] },
    gallery: { type: [GalleryImageSchema], default: [] },
    faqs: { type: [TripFaqSchema], default: [] },

    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    canonicalUrl: { type: String, trim: true },
    ogTitle: { type: String, trim: true },
    ogDescription: { type: String, trim: true },
    ogImage: { type: String, trim: true },
    schemaType: { type: String, trim: true },
    noIndex: { type: Boolean, default: false },

    status: {
      type: String,
      required: true,
      enum: ['draft', 'published', 'archived'],
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
 * Enforces the Nepal asymmetry against the destination document rather than a
 * hardcoded name: a destination with `hasActivities` requires an activity, one
 * without requires null.
 *
 * `pre('validate')` runs before Mongoose validates the document, so
 * `this.invalidate()` collects errors alongside the ordinary `required:`
 * failures and they all surface together in one ValidationError. Non-arrow
 * function, because `this` has to be the document being saved.
 */
TripSchema.pre('validate', async function () {
  if (!this.destination) return;

  const destination = await Destination.findById(this.destination)
    .select('name hasActivities')
    .lean();

  if (!destination) {
    this.invalidate('destination', 'Destination does not exist.');
    return;
  }

  if (destination.hasActivities && !this.activity) {
    this.invalidate(
      'activity',
      `${destination.name} trips must belong to an activity.`
    );
  }

  if (!destination.hasActivities && this.activity) {
    this.invalidate(
      'activity',
      `${destination.name} has no activity layer — activity must be null.`
    );
  }
});

/**
 * Group pricing tiers must not overlap (CLAUDE.md, "Two pricing structures").
 * A path validator rather than a hook, so the error attaches to the field the
 * admin editor renders.
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

const Trip: Model<ITrip> =
  mongoose.models.Trip || mongoose.model<ITrip>('Trip', TripSchema);

export default Trip;
