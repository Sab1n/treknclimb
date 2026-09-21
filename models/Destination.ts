import mongoose, { Schema, Model, Types } from 'mongoose';

import { noMojibakePlugin } from './shared/noMojibake';
import { ISeoFields, seoFields } from './shared/seo';
import { reservedSlugValidator } from './shared/reservedSlugs';
import {
  PERMIT_COMPLEXITIES,
  type PermitComplexity,
} from './shared/permitComplexity';

/*
 * The permit-complexity vocabulary lives in `shared/permitComplexity.ts` and is
 * re-exported here so every existing `from './Destination'` import keeps
 * working. It moved because the destination editor's select is a Client
 * Component, and importing it from this file would drag Mongoose — and through
 * it the MongoDB driver's `net` and `tls` requires — into the browser bundle.
 */
export { PERMIT_COMPLEXITIES } from './shared/permitComplexity';
export type { PermitComplexity } from './shared/permitComplexity';

/**
 * One of four fixed destinations: Nepal, India, Tibet, Bhutan. Seeded once and
 * edit-only in the CMS — never created or deleted through the UI.
 *
 * `hasActivities` is the source of truth for the Nepal asymmetry. Trip's
 * validate hook reads this field rather than checking the destination by name.
 *
 * `extends ISeoFields` folds in the eight shared SEO fields, so this interface
 * lists only what is specific to a destination.
 */
export interface IDestination extends ISeoFields {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  /** Every slug this destination has ever had, for the 301 catch-all. */
  slugHistory: string[];
  description: string;
  coverImage: string;
  coverImageAlt: string;
  hasActivities: boolean;
  displayOrder: number;

  /*
   * The "how they compare" row on /destinations.
   *
   * Free-text labels rather than numbers, and authored rather than derived,
   * because they describe the *region* — not whichever trips happen to be
   * published. Deriving "typical length" from trip durations would make Nepal
   * read "3–18 days" the day a short hike is published, which is true of the
   * catalogue and misleading about the country.
   *
   * All optional: the table renders only for destinations that have them.
   */
  typicalLengthLabel?: string;
  maxAltitudeLabel?: string;
  bestMonthsLabel?: string;
  permitComplexity?: PermitComplexity;

  /**
   * The editorial body of `/<destination>/activities`.
   *
   * **A new field, added because nothing existing fits.** `description` is a
   * one-paragraph card blurb already rendered on /destinations and in the
   * destination hero — reusing it would put the same text on three URLs, which
   * is duplicate content on a page whose entire purpose is to rank. The four
   * labels above are table cells ("9–18 days", "Mar–May, Sep–Nov"), not prose.
   *
   * This is the substance the page needs: what adventure travel in the region
   * actually involves, when the seasons are, what the permit situation is, and
   * how to choose between activity types. Card grids do not rank; this does.
   *
   * **Markdown subset**, rendered through `PostBody` — the same parser the blog
   * uses, so nothing reaches `dangerouslySetInnerHTML` and the client can
   * structure it with `##` headings rather than us fixing the sections in code.
   *
   * One field rather than four (`seasonsInfo`, `permitsInfo`, …) on purpose:
   * separate fields would force a page shape on every destination and render
   * half-built when three of them are blank. Optional, so the page falls back
   * to a shorter treatment until it is written.
   */
  activitiesIntro?: string;

  // Added at runtime by `timestamps: true`. Declared so the sitemap can read
  // `lastmod` and pages can surface a last-updated date for AI crawlers.
  createdAt: Date;
  updatedAt: Date;
}

const DestinationSchema = new Schema<IDestination>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // A destination slug becomes a top-level URL, so it must not collide
      // with a static route.
      validate: reservedSlugValidator(),
    },
    slugHistory: { type: [String], default: [] },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    coverImageAlt: { type: String, required: true },
    hasActivities: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },

    typicalLengthLabel: { type: String, trim: true },
    maxAltitudeLabel: { type: String, trim: true },
    bestMonthsLabel: { type: String, trim: true },
    permitComplexity: { type: String, enum: [...PERMIT_COMPLEXITIES] },
    activitiesIntro: { type: String },

    ...seoFields,
  },
  { timestamps: true }
);

// The 301 catch-all looks up retired slugs.
DestinationSchema.index({ slugHistory: 1 });

/*
 * Rejects U+FFFD on every string path, including the embedded
 * subdocuments. See models/shared/noMojibake.ts — the character only ever
 * means a decode failed upstream, so there is no legitimate value to lose.
 */
DestinationSchema.plugin(noMojibakePlugin);

const Destination: Model<IDestination> =
  mongoose.models.Destination ||
  mongoose.model<IDestination>('Destination', DestinationSchema);

export default Destination;
