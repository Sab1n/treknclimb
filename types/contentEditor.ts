import type { IDestination } from '../models/Destination';
import type { IActivity } from '../models/Activity';
import type { IRegion } from '../models/Region';
import type { IBlogCategory } from '../models/BlogCategory';
import type { ITestimonial } from '../models/Testimonial';
import type { IFaq } from '../models/Faq';
import type { ITeamMember } from '../models/TeamMember';


/**
 * Serialized shapes for the destination and activity editors.
 *
 * Only plain objects cross into a Client Component: a lean Mongoose document
 * still carries `Types.ObjectId` values, which are class instances rather than
 * plain objects, and React refuses to serialize them.
 *
 * Every field is a string or a boolean, because that is what an input holds.
 * Numbers are parsed **once**, on the server, by the Zod schema — which is also
 * the only place that can be trusted to do it. The empty string means "not set"
 * throughout, and the server maps it back to `undefined` before Mongoose sees
 * it.
 *
 * This file imports **only types**, so it is safe on both sides of the client
 * boundary — `import type` is erased at compile time and pulls no Mongoose into
 * the browser bundle.
 *
 * ## Why these are hand-written rather than `z.input<typeof schema>`
 *
 * An optional field's Zod input type is `string | undefined`, and a form input
 * never holds `undefined` — it holds `''`. Deriving the form type from the
 * schema would therefore describe a shape the form cannot produce, and every
 * assignment would need a non-null assertion to compile. The schema's job is to
 * turn `''` into `undefined` on the way *out*; the form's job is to hold
 * strings. Two shapes, stated separately. Same reasoning as `TripEditorValues`.
 */

/** The eight shared SEO fields, as the form holds them. */
interface SeoEditorValues {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  schemaType: string;
  noIndex: boolean;
}

export interface DestinationEditorValues extends SeoEditorValues {
  name: string;
  slug: string;
  description: string;
  coverImage: string;
  coverImageAlt: string;
  displayOrder: string;
  typicalLengthLabel: string;
  maxAltitudeLabel: string;
  bestMonthsLabel: string;
  permitComplexity: string;
  activitiesIntro: string;
}

export interface ActivityEditorValues extends SeoEditorValues {
  name: string;
  slug: string;
  destination: string;
  description: string;
  suitability: string;
  coverImage: string;
  coverImageAlt: string;
  displayOrder: string;
}

/** `undefined` and `null` both become `''` — one empty value, not two. */
function text(value: string | null | undefined): string {
  return value ?? '';
}

function numeric(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function toDestinationValues(
  destination: IDestination
): DestinationEditorValues {
  return {
    name: text(destination.name),
    slug: text(destination.slug),
    description: text(destination.description),
    coverImage: text(destination.coverImage),
    coverImageAlt: text(destination.coverImageAlt),
    displayOrder: numeric(destination.displayOrder),

    typicalLengthLabel: text(destination.typicalLengthLabel),
    maxAltitudeLabel: text(destination.maxAltitudeLabel),
    bestMonthsLabel: text(destination.bestMonthsLabel),
    permitComplexity: text(destination.permitComplexity),
    activitiesIntro: text(destination.activitiesIntro),

    metaTitle: text(destination.metaTitle),
    metaDescription: text(destination.metaDescription),
    canonicalUrl: text(destination.canonicalUrl),
    ogTitle: text(destination.ogTitle),
    ogDescription: text(destination.ogDescription),
    ogImage: text(destination.ogImage),
    schemaType: text(destination.schemaType),
    noIndex: !!destination.noIndex,
  };
}

export function toActivityValues(activity: IActivity): ActivityEditorValues {
  return {
    name: text(activity.name),
    slug: text(activity.slug),
    destination: String(activity.destination),
    description: text(activity.description),
    suitability: text(activity.suitability),
    coverImage: text(activity.coverImage),
    coverImageAlt: text(activity.coverImageAlt),
    displayOrder: numeric(activity.displayOrder),

    metaTitle: text(activity.metaTitle),
    metaDescription: text(activity.metaDescription),
    canonicalUrl: text(activity.canonicalUrl),
    ogTitle: text(activity.ogTitle),
    ogDescription: text(activity.ogDescription),
    ogImage: text(activity.ogImage),
    schemaType: text(activity.schemaType),
    noIndex: !!activity.noIndex,
  };
}

/**
 * A region, as the editor holds it.
 *
 * Every value is a string because that is what an input holds — `displayOrder`
 * included. The form is the source of truth for its own state, and converting
 * on the way in and out of it is where "0" and 0 and "" start disagreeing.
 */
export interface RegionEditorValues extends SeoEditorValues {
  name: string;
  slug: string;
  destination: string;
  description: string;
  coverImage: string;
  coverImageAlt: string;
  displayOrder: string;
}

export function toRegionValues(region: IRegion): RegionEditorValues {
  return {
    name: text(region.name),
    slug: text(region.slug),
    destination: String(region.destination),
    description: text(region.description),
    coverImage: text(region.coverImage),
    coverImageAlt: text(region.coverImageAlt),
    displayOrder: numeric(region.displayOrder),

    metaTitle: text(region.metaTitle),
    metaDescription: text(region.metaDescription),
    canonicalUrl: text(region.canonicalUrl),
    ogTitle: text(region.ogTitle),
    ogDescription: text(region.ogDescription),
    ogImage: text(region.ogImage),
    schemaType: text(region.schemaType),
    noIndex: !!region.noIndex,
  };
}

/** A blank region, for the create form. */
export const emptyRegion: RegionEditorValues = {
  name: '',
  slug: '',
  destination: '',
  description: '',
  coverImage: '',
  coverImageAlt: '',
  displayOrder: '0',

  metaTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  schemaType: '',
  noIndex: false,
};

/**
 * A blog category, as the editor holds it.
 *
 * No image and no publish status. A category is a **taxonomy record**, not a
 * page of content: its archive is generated from the posts filed under it, so
 * there is nothing to draft and nothing to illustrate. `description` is the
 * one piece of copy, and it is optional — most archives read perfectly well
 * as a heading and a list.
 */
export interface BlogCategoryEditorValues extends SeoEditorValues {
  name: string;
  slug: string;
  description: string;
  displayOrder: string;
}

export function toBlogCategoryValues(
  category: IBlogCategory
): BlogCategoryEditorValues {
  return {
    name: text(category.name),
    slug: text(category.slug),
    description: text(category.description),
    displayOrder: numeric(category.displayOrder),

    metaTitle: text(category.metaTitle),
    metaDescription: text(category.metaDescription),
    canonicalUrl: text(category.canonicalUrl),
    ogTitle: text(category.ogTitle),
    ogDescription: text(category.ogDescription),
    ogImage: text(category.ogImage),
    schemaType: text(category.schemaType),
    noIndex: !!category.noIndex,
  };
}

/** A blank category, for the create form. */
export const emptyBlogCategory: BlogCategoryEditorValues = {
  name: '',
  slug: '',
  description: '',
  displayOrder: '0',

  metaTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  schemaType: '',
  noIndex: false,
};

/** A blank activity, for the create form. */
export const emptyActivity: ActivityEditorValues = {
  name: '',
  slug: '',
  destination: '',
  description: '',
  suitability: '',
  coverImage: '',
  coverImageAlt: '',
  displayOrder: '0',
  metaTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  schemaType: '',
  noIndex: false,
};

/**
 * The testimonial editor's form shape.
 *
 * `trip` is a string here and `Types.ObjectId | null` on the model. The empty
 * string is how a select spells "none", and the schema turns it back into
 * `null` — not `undefined`, because clearing an association has to actually
 * clear it.
 */
export interface TestimonialEditorValues {
  name: string;
  quote: string;
  photo: string;
  photoAlt: string;
  trip: string;
  country: string;
  displayOrder: string;
  status: string;
}

export interface FaqEditorValues {
  question: string;
  answer: string;
  category: string;
  destination: string;
  displayOrder: string;
  status: string;
}

/** `null` and `undefined` both become `''` — one empty value for the select. */
function ref(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export function toTestimonialValues(
  testimonial: ITestimonial
): TestimonialEditorValues {
  return {
    name: text(testimonial.name),
    quote: text(testimonial.quote),
    photo: text(testimonial.photo),
    photoAlt: text(testimonial.photoAlt),
    trip: ref(testimonial.trip),
    country: text(testimonial.country),
    displayOrder: numeric(testimonial.displayOrder),
    status: testimonial.status,
  };
}

export const emptyTestimonial: TestimonialEditorValues = {
  name: '',
  quote: '',
  photo: '',
  photoAlt: '',
  trip: '',
  country: '',
  displayOrder: '0',
  status: 'draft',
};

export function toFaqValues(faq: IFaq): FaqEditorValues {
  return {
    question: text(faq.question),
    answer: text(faq.answer),
    category: text(faq.category),
    destination: ref(faq.destination),
    displayOrder: numeric(faq.displayOrder),
    status: faq.status,
  };
}

export const emptyFaq: FaqEditorValues = {
  question: '',
  answer: '',
  category: '',
  destination: '',
  displayOrder: '0',
  status: 'draft',
};

/**
 * The team-member editor's form shape.
 *
 * `credentials` and `languages` are string arrays here and on the model, so
 * they pass through unchanged — but they are edited as repeatable rows, and a
 * row needs a stable identity for React and the drag list. The editor wraps
 * them in `{ key, value }` locally and unwraps before sending; keeping the
 * stored shape a plain `string[]` means nothing on the public side has to know
 * about that.
 */
export interface TeamMemberEditorValues {
  name: string;
  role: string;
  photo: string;
  photoAlt: string;
  bio: string;
  credentials: string[];
  languages: string[];
  yearsExperience: string;
  displayOrder: string;
  status: string;
}

export function toTeamMemberValues(
  member: ITeamMember
): TeamMemberEditorValues {
  return {
    name: text(member.name),
    role: text(member.role),
    photo: text(member.photo),
    photoAlt: text(member.photoAlt),
    bio: text(member.bio),
    credentials: member.credentials ?? [],
    languages: member.languages ?? [],
    yearsExperience: numeric(member.yearsExperience),
    displayOrder: numeric(member.displayOrder),
    status: member.status,
  };
}

export const emptyTeamMember: TeamMemberEditorValues = {
  name: '',
  role: '',
  photo: '',
  photoAlt: '',
  bio: '',
  credentials: [],
  languages: [],
  yearsExperience: '',
  displayOrder: '0',
  status: 'draft',
};
