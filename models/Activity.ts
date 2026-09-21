import mongoose, { Schema, Model, Types, UpdateQuery } from 'mongoose';

import { noMojibakePlugin } from './shared/noMojibake';
import Destination, { IDestination } from './Destination';
import { ISeoFields, seoFields } from './shared/seo';
import { reservedSlugValidator } from './shared/reservedSlugs';

/**
 * An Activity sits between a Destination and a Trip:
 *   Nepal → Trekking → Everest Base Camp
 *
 * Only Nepal uses this layer today, but nothing in this file knows that. The
 * destination reference is generic; `Destination.hasActivities` is the single
 * flag that decides whether a destination uses activities at all.
 */
export interface IActivity extends ISeoFields {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  /** Every slug this activity has ever had, for the 301 catch-all. */
  slugHistory: string[];
  description: string;
  /**
   * Authored prose answering "who is this for". Distinct from `description`,
   * which says what the activity *is* — a different question, and one the
   * generic difficulty table cannot answer for a specific activity.
   *
   * Optional: a new activity is savable before this is written.
   */
  suitability?: string;
  coverImage: string;
  coverImageAlt: string;
  destination: Types.ObjectId;
  displayOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * The same activity after `.populate('destination')`.
 *
 * Activity pages need `activity.destination.slug` to build `/nepal/trekking`
 * and its breadcrumb, so this shape is needed one level above Trip for exactly
 * the same reason.
 */
export interface IActivityPopulated extends Omit<IActivity, 'destination'> {
  destination: IDestination;
}

const ActivitySchema = new Schema<IActivity>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // An activity slug becomes the second URL segment (/nepal/trekking).
      validate: reservedSlugValidator('/<destination>'),
    },
    slugHistory: { type: [String], default: [] },
    description: { type: String, required: true },
    suitability: { type: String, trim: true },
    coverImage: { type: String, required: true },
    coverImageAlt: { type: String, required: true },
    destination: {
      type: Schema.Types.ObjectId,
      ref: 'Destination',
      required: true,
      index: true,
    },
    displayOrder: { type: Number, default: 0 },
    ...seoFields,
  },
  { timestamps: true }
);

// The 301 catch-all looks up retired slugs.
ActivitySchema.index({ slugHistory: 1 });

/**
 * An activity may only belong to a destination that has an activity layer.
 *
 * The mirror of Trip's rule, in the same place and the same shape. Trip has had
 * a `pre('validate')` hook for this since the model layer was built; Activity
 * was relying on its two route handlers instead, and two route checks are
 * weaker than one model hook — a migration script, a seed run or a third route
 * added later walks straight past both. CLAUDE.md calls this asymmetry the
 * single most important rule in the codebase, so it is enforced where the rule
 * cannot be avoided rather than where it happens to be convenient.
 *
 * Without it, an activity filed under Bhutan saves cleanly and then renders on
 * no page at all: `/bhutan/activities` does not exist, the destination page
 * lists trips rather than activities, and the trip editor's activity select
 * filters it out. Invisible content, no error anywhere.
 */
async function assertDestinationHasActivities(
  destinationId: Types.ObjectId
): Promise<string | null> {
  const destination = await Destination.findById(destinationId)
    .select('name hasActivities')
    .lean();

  if (!destination) return 'Destination does not exist.';

  if (!destination.hasActivities) {
    return `${destination.name} has no activity layer, so it cannot hold activities.`;
  }

  return null;
}

/*
 * `pre('validate')` runs before Mongoose validates, so `this.invalidate()`
 * collects the error alongside ordinary `required:` failures and they surface
 * together in one ValidationError. A non-arrow function, because `this` has to
 * be the document being saved.
 */
ActivitySchema.pre('validate', async function () {
  if (!this.destination) return;

  const problem = await assertDestinationHasActivities(this.destination);

  if (problem) this.invalidate('destination', problem);
});

/**
 * Second line of defence, per CLAUDE.md: query middleware does **not** run
 * document validation, so `findOneAndUpdate` would skip the hook above
 * entirely — `runValidators: true` runs path validators only, never a
 * `pre('validate')`.
 *
 * Here `this` is the Query rather than the document, so the effective
 * destination has to be reconstructed from the update. Throwing is how query
 * middleware aborts, and note it surfaces as a plain `Error` with no field
 * mapping — the other of the two shapes admin error handling has to cope with.
 */
ActivitySchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate() as UpdateQuery<IActivity> | null;
  if (!update) return;

  const set = (update.$set ?? {}) as Partial<IActivity>;

  if (!('destination' in update) && !('destination' in set)) return;

  const destinationId = (set.destination ??
    update.destination) as Types.ObjectId;

  if (!destinationId) return;

  const problem = await assertDestinationHasActivities(destinationId);

  if (problem) throw new Error(problem);
});

/*
 * Rejects U+FFFD on every string path, including the embedded
 * subdocuments. See models/shared/noMojibake.ts — the character only ever
 * means a decode failed upstream, so there is no legitimate value to lose.
 */
ActivitySchema.plugin(noMojibakePlugin);

const Activity: Model<IActivity> =
  mongoose.models.Activity ||
  mongoose.model<IActivity>('Activity', ActivitySchema);

export default Activity;
