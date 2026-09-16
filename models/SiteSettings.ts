import mongoose, { Schema, Model, Types } from 'mongoose';

/**
 * Everything the client should be able to change without a code deploy:
 * organisation details and NAP, the response-time promise, headline stats,
 * hero copy, value propositions, policy copy, the named contact person and
 * social links.
 *
 * This is a **singleton** — exactly one document, forever. See the `key` field
 * below for how that is enforced.
 *
 * Almost every field is optional. The record is created empty by the seed and
 * filled in through the admin UI, so a half-completed settings document has to
 * be savable. Pages must therefore treat any of these as possibly missing.
 */

export interface IHeadlineStat {
  _id?: Types.ObjectId;
  /** "Registered and trading since", "Trekkers taken to date" */
  label: string;
  value: string;
  displayOrder: number;
}

export interface IValueProposition {
  _id?: Types.ObjectId;
  title: string;
  body: string;
  displayOrder: number;
}

/**
 * One line of the About page’s commitments list.
 *
 * Separate from `valuePropositions`, which is homepage conversion copy — a
 * reason to choose this operator, written to persuade. A commitment is a
 * statement of practice, and half of them are things the company **will not**
 * do. Rendering the two from one array would mean the homepage either leaks
 * the refusals or has to filter by a field it does not care about.
 *
 * `kind` carries the half rather than two arrays, because the pair reads as a
 * contrast and the page lays them out side by side. A single array also keeps
 * `displayOrder` meaningful across both columns.
 */
export interface ICommitment {
  _id?: Types.ObjectId;
  title: string;
  body: string;
  /** `will` — something the company does. `wont` — something it refuses. */
  kind: 'will' | 'wont';
  displayOrder: number;
}

/**
 * One block of the safety and responsibility section.
 *
 * v1 names three: insurance and evacuation, guide certification, porter
 * welfare. Stored as a repeatable block rather than three fixed fields so the
 * client can add a fourth without a schema change — the list is a claim about
 * practice, and practice grows.
 */
export interface ISafetyPolicy {
  _id?: Types.ObjectId;
  title: string;
  body: string;
  displayOrder: number;
}

export interface ISocialLink {
  _id?: Types.ObjectId;
  /** Facebook, Instagram, TripAdvisor, YouTube — feeds Organization `sameAs`. */
  platform: string;
  url: string;
  displayOrder: number;
}

export interface ISiteSettings {
  _id: Types.ObjectId;
  /**
   * The singleton guard. Always the literal string 'site'.
   * `unique` + `immutable` + a one-value `enum` together mean a second document
   * cannot be created and this one cannot be renamed out of the way.
   */
  key: 'site';

  // --- organisation and NAP ---
  // NAP has to be byte-identical everywhere it appears, so it is stored once
  // here and read from here — never retyped into a component.
  legalName?: string;
  tradingName?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
  phone?: string;
  email?: string;
  whatsappNumber?: string;
  foundingYear?: number;
  registrationNumber?: string;

  /** The canonical company descriptions, reused verbatim off-site. */
  shortDescription?: string;
  /**
   * The company story, in full. Rendered on the About page through the
   * Markdown-subset parser, so blank lines are paragraph breaks.
   */
  longDescription?: string;

  // --- conversion copy ---
  responseTimePromise?: string;
  officeHours?: string;
  heroHeadline?: string;
  heroSubheading?: string;
  heroCtaLabel?: string;
  /** "No payment now. Deposit only after you approve the plan." */
  riskReversalText?: string;
  depositPolicyText?: string;
  cancellationPolicyText?: string;

  // --- the named human beside the CTA ---
  contactPersonName?: string;
  contactPersonRole?: string;
  contactPersonPhoto?: string;
  contactPersonPhotoAlt?: string;

  // --- repeating blocks ---
  headlineStats: IHeadlineStat[];
  valuePropositions: IValueProposition[];
  /** About page — what the company will and will not do. */
  commitments: ICommitment[];
  /** About page — insurance, guide certification, porter welfare. */
  safetyPolicies: ISafetyPolicy[];
  socialLinks: ISocialLink[];

  createdAt: Date;
  updatedAt: Date;
}

const HeadlineStatSchema = new Schema<IHeadlineStat>({
  label: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true },
  displayOrder: { type: Number, default: 0 },
});

const ValuePropositionSchema = new Schema<IValueProposition>({
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  displayOrder: { type: Number, default: 0 },
});

const CommitmentSchema = new Schema<ICommitment>({
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  kind: { type: String, required: true, enum: ['will', 'wont'], default: 'will' },
  displayOrder: { type: Number, default: 0 },
});

const SafetyPolicySchema = new Schema<ISafetyPolicy>({
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  displayOrder: { type: Number, default: 0 },
});

const SocialLinkSchema = new Schema<ISocialLink>({
  platform: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  displayOrder: { type: Number, default: 0 },
});

const SiteSettingsSchema = new Schema<ISiteSettings>(
  {
    key: {
      type: String,
      default: 'site',
      enum: ['site'],
      unique: true,
      immutable: true,
    },

    legalName: { type: String, trim: true },
    tradingName: { type: String, trim: true },
    streetAddress: { type: String, trim: true },
    addressLocality: { type: String, trim: true },
    addressRegion: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    addressCountry: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    whatsappNumber: { type: String, trim: true },
    foundingYear: { type: Number, min: 1900 },
    registrationNumber: { type: String, trim: true },

    shortDescription: { type: String, trim: true },
    longDescription: { type: String },

    responseTimePromise: { type: String, trim: true },
    officeHours: { type: String, trim: true },
    heroHeadline: { type: String, trim: true },
    heroSubheading: { type: String, trim: true },
    heroCtaLabel: { type: String, trim: true },
    riskReversalText: { type: String, trim: true },
    depositPolicyText: { type: String },
    cancellationPolicyText: { type: String },

    contactPersonName: { type: String, trim: true },
    contactPersonRole: { type: String, trim: true },
    contactPersonPhoto: { type: String, trim: true },
    // Alt text is required whenever there is an image to describe.
    contactPersonPhotoAlt: {
      type: String,
      trim: true,
      required: function (this: ISiteSettings) {
        return !!this.contactPersonPhoto;
      },
    },

    headlineStats: { type: [HeadlineStatSchema], default: [] },
    valuePropositions: { type: [ValuePropositionSchema], default: [] },
    commitments: { type: [CommitmentSchema], default: [] },
    safetyPolicies: { type: [SafetyPolicySchema], default: [] },
    socialLinks: { type: [SocialLinkSchema], default: [] },
  },
  { timestamps: true }
);

const SiteSettings: Model<ISiteSettings> =
  mongoose.models.SiteSettings ||
  mongoose.model<ISiteSettings>('SiteSettings', SiteSettingsSchema);

export default SiteSettings;
