import type { ITrip } from '../models/Trip';

/**
 * The serialized trip shape the editor works in.
 *
 * ## Why a DTO at all
 *
 * Only plain objects cross into a Client Component. A lean Mongoose document
 * still carries `Types.ObjectId` values — class instances, not plain objects —
 * and React refuses to serialize them. `Date` crosses, but comparing dates for
 * a dirty check is needless work when the editor never edits one.
 *
 * ## Why every field is a string
 *
 * Because that is what an `input` holds. A number input with nothing typed in
 * it has `value === ''`, not `undefined` and not `NaN`, and a form library that
 * pretends otherwise spends its life converting back and forth. Numbers are
 * parsed **once**, on the server, by the Zod schema — which is also the only
 * place that can be trusted to do it, since the browser's copy is advisory.
 *
 * The empty string therefore means "not set" throughout this file, and the
 * server maps it to `undefined` before it reaches Mongoose. That is the same
 * `''`-to-`undefined` rule the booking form needed, for the same reason.
 *
 * This file imports **only a type** from the model, so it is safe on both
 * sides of the client boundary: `import type` is erased at compile time and
 * pulls no Mongoose into the browser bundle.
 */

/**
 * A row in a repeatable editor.
 *
 * Every one of these carries a `key`, and it is not the database `_id`.
 * New rows have no `_id` until they are saved, so React would need a fallback
 * for them — and the array index is the one thing it must never be, because
 * reordering or deleting a row re-associates every input below it with a
 * different row's state. A client-generated key is stable across a drag, a
 * delete and a save, and it is stripped before the payload reaches the server.
 */
export interface EditorRow {
  key: string;
}

export interface TierRow extends EditorRow {
  minPeople: string;
  maxPeople: string;
  pricePerPerson: string;
  label: string;
}

export interface ItineraryRow extends EditorRow {
  title: string;
  description: string;
  location: string;
  maxAltitudeM: string;
  distanceKm: string;
  durationHours: string;
  accommodation: string;
  meals: string;
  image: string;
  imageAlt: string;
}

export interface GalleryRow extends EditorRow {
  url: string;
  alt: string;
  caption: string;
}

export interface FaqRow extends EditorRow {
  question: string;
  answer: string;
}

/** The fields the editor can write. */
export interface TripEditorValues {
  // --- basic ---
  title: string;
  slug: string;
  destination: string;
  /** Empty string for a destination with no activity layer. */
  activity: string;
  summary: string;
  answerBlock: string;
  description: string;
  status: string;
  featured: boolean;

  // --- facts ---
  durationDays: string;
  difficulty: string;
  bestMonths: string[];
  region: string;
  maxAltitudeM: string;
  peakName: string;
  tripGrade: string;
  minGroupSize: string;
  maxGroupSize: string;
  hasElevationProfile: boolean;
  startPoint: string;
  endPoint: string;

  // --- pricing ---
  price: string;
  discountedPrice: string;
  priceLabel: string;
  groupPricing: TierRow[];

  // --- content ---
  /*
   * `day` is not stored on an itinerary row. It is the array position, and
   * keeping a separate editable number would mean two sources of truth for the
   * same fact — with drag-reorder, they would disagree the first time anyone
   * dragged anything. The server renumbers from the array order on save.
   */
  itinerary: ItineraryRow[];
  includes: string[];
  excludes: string[];
  faqs: FaqRow[];

  // --- images ---
  coverImage: string;
  coverImageAlt: string;
  gallery: GalleryRow[];

  // --- seo ---
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  schemaType: string;
  noIndex: boolean;
}

/** Read-only context the editor renders around the form. */
export interface TripEditorMeta {
  id: string;
  /** Counts for the tabs whose editors are not built yet. */
  itineraryDays: number;
  galleryImages: number;
  faqs: number;
  includes: number;
  excludes: number;
  groupTiers: number;
  /** Lowest per-person price across the tiers, for the reconciliation warning. */
  lowestTierPrice: number | null;
  updatedAt: string;
  /** Retired slugs, so an admin can see what already 301s here. */
  slugHistory: string[];
}

/** `undefined` and `null` both become `''` — the editor has one empty value. */
function text(value: string | null | undefined): string {
  return value ?? '';
}

/** A number becomes its digits, or `''` when unset. Never "undefined" or "NaN". */
function numeric(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * A stable key for a repeatable row.
 *
 * Not `crypto.randomUUID()`: this runs on the server when mapping a stored trip
 * and in the browser when adding a row, and a value that differs between the
 * two would make the server-rendered markup disagree with the first client
 * render — a hydration mismatch on every row. A counter seeded per call is
 * deterministic on the server and unique in the browser, which is all a React
 * key has to be.
 */
let keyCounter = 0;

export function newRowKey(prefix: string): string {
  keyCounter += 1;

  return `${prefix}-${keyCounter}`;
}

export function toTripEditorValues(trip: ITrip): TripEditorValues {
  return {
    title: text(trip.title),
    slug: text(trip.slug),
    destination: String(trip.destination),
    /*
     * `activity` is nullable, never optional — null is a real value meaning
     * "this destination has no activity layer", not missing data. It flattens
     * to `''` here because a `select` has no null, and the server maps `''`
     * back to null rather than to undefined. Getting that direction wrong would
     * write `undefined` and leave the stored activity in place.
     */
    activity: trip.activity ? String(trip.activity) : '',
    summary: text(trip.summary),
    answerBlock: text(trip.answerBlock),
    description: text(trip.description),
    status: text(trip.status),
    featured: !!trip.featured,

    durationDays: numeric(trip.durationDays),
    difficulty: text(trip.difficulty),
    bestMonths: [...(trip.bestMonths ?? [])],
    // An ObjectId or null, flattened to the id string the <select> holds.
    region: trip.region ? String(trip.region) : '',
    maxAltitudeM: numeric(trip.maxAltitudeM),
    peakName: text(trip.peakName),
    tripGrade: text(trip.tripGrade),
    minGroupSize: numeric(trip.minGroupSize),
    maxGroupSize: numeric(trip.maxGroupSize),
    hasElevationProfile: !!trip.hasElevationProfile,
    startPoint: text(trip.startPoint),
    endPoint: text(trip.endPoint),

    price: numeric(trip.price),
    discountedPrice: numeric(trip.discountedPrice),
    priceLabel: text(trip.priceLabel),
    /*
     * Keys come from the stored `_id` where there is one, so a row's identity
     * survives a save-and-reload rather than being renumbered. Rows added in
     * the browser get a generated key and pick up an `_id` on their first save.
     */
    groupPricing: (trip.groupPricing ?? []).map((tier) => ({
      key: tier._id ? String(tier._id) : newRowKey('tier'),
      minPeople: numeric(tier.minPeople),
      maxPeople: numeric(tier.maxPeople),
      pricePerPerson: numeric(tier.pricePerPerson),
      label: text(tier.label),
    })),

    // Sorted by `day` rather than trusted to be in array order: the stored
    // order and the day numbers could disagree, and the day number is what the
    // site renders, so it decides.
    itinerary: [...(trip.itinerary ?? [])]
      .sort((a, b) => a.day - b.day)
      .map((entry) => ({
        key: entry._id ? String(entry._id) : newRowKey('day'),
        title: text(entry.title),
        description: text(entry.description),
        location: text(entry.location),
        maxAltitudeM: numeric(entry.maxAltitudeM),
        distanceKm: numeric(entry.distanceKm),
        durationHours: numeric(entry.durationHours),
        accommodation: text(entry.accommodation),
        meals: text(entry.meals),
        image: text(entry.image),
        imageAlt: text(entry.imageAlt),
      })),

    includes: [...(trip.includes ?? [])],
    excludes: [...(trip.excludes ?? [])],

    faqs: (trip.faqs ?? []).map((faq) => ({
      key: faq._id ? String(faq._id) : newRowKey('faq'),
      question: text(faq.question),
      answer: text(faq.answer),
    })),

    coverImage: text(trip.coverImage),
    coverImageAlt: text(trip.coverImageAlt),
    gallery: (trip.gallery ?? []).map((image) => ({
      key: image._id ? String(image._id) : newRowKey('img'),
      url: text(image.url),
      alt: text(image.alt),
      caption: text(image.caption),
    })),

    metaTitle: text(trip.metaTitle),
    metaDescription: text(trip.metaDescription),
    canonicalUrl: text(trip.canonicalUrl),
    ogTitle: text(trip.ogTitle),
    ogDescription: text(trip.ogDescription),
    ogImage: text(trip.ogImage),
    schemaType: text(trip.schemaType),
    noIndex: !!trip.noIndex,
  };
}

export function toTripEditorMeta(trip: ITrip): TripEditorMeta {
  const tierPrices = (trip.groupPricing ?? []).map((tier) => tier.pricePerPerson);

  return {
    id: String(trip._id),
    itineraryDays: trip.itinerary?.length ?? 0,
    galleryImages: trip.gallery?.length ?? 0,
    faqs: trip.faqs?.length ?? 0,
    includes: trip.includes?.length ?? 0,
    excludes: trip.excludes?.length ?? 0,
    groupTiers: tierPrices.length,
    // `Math.min()` with no arguments returns Infinity, so the empty case is
    // handled before the spread rather than after it.
    lowestTierPrice: tierPrices.length > 0 ? Math.min(...tierPrices) : null,
    updatedAt: new Date(trip.updatedAt).toISOString(),
    slugHistory: [...(trip.slugHistory ?? [])],
  };
}

/**
 * Turns a title into a URL slug.
 *
 * Runs in the browser as the admin types, and again on the server as the
 * fallback when the slug field is empty — so it lives here rather than in
 * either half, and both sides produce the same string.
 *
 * `NFKD` normalisation splits an accented character into its base letter plus
 * a combining mark, and the following strip removes the marks: "Annapurna
 * Base Camp" is easy, but "Chomolhari" and "Tsergo Ri" arrive with diacritics
 * often enough that dropping them silently would produce "chomolhri".
 */
export function slugifyTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
