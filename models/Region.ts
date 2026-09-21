import mongoose, { Schema, Model, Types } from 'mongoose';

import { noMojibakePlugin } from './shared/noMojibake';
import { IDestination } from './Destination';
import { ISeoFields, seoFields } from './shared/seo';
import { reservedSlugValidator } from './shared/reservedSlugs';

/**
 * A geographic region within a destination — Everest, Annapurna, Langtang,
 * Manaslu.
 *
 * ## Why it belongs to the destination, not the activity
 *
 * A region is a **place**, and a place does not stop existing when you climb in
 * it rather than walk through it. Everest is one region whether the trip going
 * there is a trek or a peak climb, and hanging it off `Activity` would mean two
 * Everest records that could drift apart — different descriptions, different
 * cover images, two pages competing for the same search term.
 *
 * The activity decides the **URL a region page renders under**, not what the
 * region is. That is why this model looks exactly like `Activity` — both are a
 * layer under a destination — but the route is
 * `/<destination>/<activity>/region/<region>`.
 *
 * ## Trekking-only today, deliberately not enforced
 *
 * Every region seeded so far carries trekking trips, and nothing here knows
 * that. **Nothing may branch on `activity.slug === 'trekking'`** — a name test
 * looks correct and fails silently on the second activity that gets regions,
 * with no error anywhere to explain why a page did not appear.
 *
 * Which region pages exist is therefore **derived from the trips**: a region
 * page under an activity exists when a published trip has both that region and
 * that activity. Give a peak-climbing trip a region and its page appears, with
 * no code change and no flag to remember to set.
 */
export interface IRegion extends ISeoFields {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  /** Every slug this region has ever had, for the 301 catch-all. */
  slugHistory: string[];
  description: string;
  coverImage: string;
  coverImageAlt: string;
  destination: Types.ObjectId;
  displayOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * The same region after `.populate('destination')`.
 *
 * The region page needs `region.destination.slug` to build its URL and its
 * breadcrumb, and to confirm the region actually belongs to the destination in
 * the path — without that check, `/india/trekking/region/annapurna` would
 * render Nepal's Annapurna page under India.
 */
export interface IRegionPopulated extends Omit<IRegion, 'destination'> {
  destination: IDestination;
}

const RegionSchema = new Schema<IRegion>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      /*
       * A region slug is the last segment of
       * `/<destination>/<activity>/region/<slug>`, so it is not itself exposed
       * to a top-level static route. It still gets the reserved validator: the
       * list is about slugs that shadow a route *somewhere*, every other
       * slugged model attaches it, and a region slugged `admin` or `api` is
       * confusing even where it happens to be harmless.
       */
      validate: reservedSlugValidator('/<destination>/<activity>/region'),
    },
    slugHistory: { type: [String], default: [] },
    description: { type: String, required: true },
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
RegionSchema.index({ slugHistory: 1 });

/*
 * No `hasActivities` guard, unlike Activity.
 *
 * A region is a place and a destination without an activity layer can still
 * have them — Ladakh is a real region of India. What such a region does *not*
 * have today is a URL, because the only region route sits under an activity
 * segment. That is a gap in the routing, not a reason to forbid the record, and
 * forbidding it here would have to be undone the moment the route is added.
 */

/*
 * Rejects U+FFFD on every string path. See models/shared/noMojibake.ts — the
 * character only ever means a decode failed upstream, so there is no
 * legitimate value to lose.
 */
RegionSchema.plugin(noMojibakePlugin);

const Region: Model<IRegion> =
  mongoose.models.Region || mongoose.model<IRegion>('Region', RegionSchema);

export default Region;
