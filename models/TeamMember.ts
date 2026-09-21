import mongoose, { Schema, Model, Types } from 'mongoose';

import { noMojibakePlugin } from './shared/noMojibake';
import { PublishStatus, PUBLISH_STATUSES } from './shared/status';

/**
 * The people on the About page.
 *
 * ## Why this is a collection and not SiteSettings fields
 *
 * Guides come and go, and the client has to be able to add one without a
 * deploy. Three fixed `guideOneName` / `guideTwoName` fields would cap the team
 * at three and make removing the second one a data-shuffling exercise. A
 * collection is also the only shape that lets `displayOrder` mean anything.
 *
 * ## What it is for
 *
 * This is the trust surface. Someone in Berlin about to send $2,000 to a
 * company in Pokhara is checking that real, qualified people work there, and
 * `credentials` is the field that answers it — "NMA-certified trekking guide,
 * Wilderness First Responder" is a verifiable claim in a way that "experienced
 * team" is not.
 *
 * It is also the E-E-A-T substance behind the blog bylines. `BlogPost.author`
 * is a free-text name today, so the connection between a post's byline and a
 * named guide here is editorial rather than a reference. Making it a real ref
 * is an obvious later move and deliberately not made now — it would mean every
 * post needing a team member before it could save, which is a migration on
 * content that already exists.
 *
 * ## No slug, and no individual pages
 *
 * Every member renders inside the About page. A slug would imply `/team/ang-
 * dorjee` exists, and nothing routes there — so the Cloudinary public ID is
 * filed under the record's id instead, the same choice `Testimonial` makes and
 * for the same reason: a person's name is neither unique nor stable enough to
 * file images under.
 */
export interface ITeamMember {
  _id: Types.ObjectId;
  name: string;
  /** "Founder", "Lead trekking guide", "Operations". */
  role: string;
  photo?: string;
  photoAlt?: string;
  /** A short paragraph. Plain text, rendered through the Markdown subset. */
  bio?: string;
  /**
   * Certifications and licences, one per entry.
   *
   * An array rather than a sentence so each is its own visible chip, and so a
   * lapsed certification is removed rather than edited out of prose.
   */
  credentials: string[];
  /** Spoken languages. A practical concern for a client choosing a guide. */
  languages: string[];
  /**
   * Years guiding, not years at this company.
   *
   * Optional and never invented — an unverified number attached to a named
   * person is the kind of claim this page exists to make checkable.
   */
  yearsExperience?: number;
  displayOrder: number;
  status: PublishStatus;

  createdAt: Date;
  updatedAt: Date;
}

const TeamMemberSchema = new Schema<ITeamMember>(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    photo: { type: String, trim: true },
    /*
     * Required whenever there is an image to describe — the same conditional
     * `required` as `Testimonial.photoAlt`. A non-arrow function, because
     * Mongoose calls it with `this` bound to the document and an arrow would
     * capture the module scope instead.
     */
    photoAlt: {
      type: String,
      trim: true,
      required: function (this: ITeamMember) {
        return !!this.photo;
      },
    },
    bio: { type: String },
    credentials: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    yearsExperience: { type: Number, min: 0, max: 80 },
    displayOrder: { type: Number, default: 0 },
    status: {
      type: String,
      required: true,
      enum: [...PUBLISH_STATUSES],
      default: 'draft',
      index: true,
    },
  },
  { timestamps: true }
);

/**
 * The alt-text rule again, for query middleware.
 *
 * CLAUDE.md: a conditional `required` function is **document** validation — its
 * `this` is the document. Query middleware has no document, so the condition
 * returns false and the rule silently does not apply, even with
 * `runValidators: true`. That was verified on `Testimonial`, where a
 * `findOneAndUpdate` stored a photo with no alt text.
 *
 * So every model with a conditional `required` gets a matching
 * `pre('findOneAndUpdate')`. The update is merged onto the stored document
 * before testing, because either half can create the violation: adding a photo
 * to a record with no alt, or clearing the alt on a record that has a photo.
 */
TeamMemberSchema.pre('findOneAndUpdate', async function () {
  const update = (this.getUpdate() ?? {}) as Record<string, unknown> & {
    $set?: Record<string, unknown>;
    $unset?: Record<string, unknown>;
  };

  const set = { ...update, ...(update.$set ?? {}) };
  const unset = update.$unset ?? {};

  const touchesImage =
    'photo' in set || 'photoAlt' in set || 'photo' in unset || 'photoAlt' in unset;

  if (!touchesImage) return;

  const current = await this.model
    .findOne(this.getQuery())
    .select('photo photoAlt')
    .lean<{ photo?: string; photoAlt?: string }>()
    .exec();

  function resolve(field: 'photo' | 'photoAlt'): string {
    if (field in unset) return '';
    if (field in set) return String(set[field] ?? '').trim();
    return (current?.[field] ?? '').trim();
  }

  if (resolve('photo') && !resolve('photoAlt')) {
    /*
     * A thrown Error, not a ValidationError. Query middleware has no document
     * to attach field errors to, so this surfaces as a plain message with no
     * field mapping — which CLAUDE.md warns admin error handling has to cope
     * with.
     */
    throw new Error(
      'A team member photo requires alt text. Set photoAlt in the same update, or use findById + save().'
    );
  }
});

/*
 * Rejects U+FFFD on every string path, including the embedded
 * subdocuments. See models/shared/noMojibake.ts — the character only ever
 * means a decode failed upstream, so there is no legitimate value to lose.
 */
TeamMemberSchema.plugin(noMojibakePlugin);

const TeamMember: Model<ITeamMember> =
  mongoose.models.TeamMember ||
  mongoose.model<ITeamMember>('TeamMember', TeamMemberSchema);

export default TeamMember;
