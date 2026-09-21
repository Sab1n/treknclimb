/**
 * The trip editor's tabs, and which one holds each field.
 *
 * Out of `TripEditor.tsx` so it can be tested without rendering the editor:
 * "a server error on a nested path opens the tab that holds it" is a rule about
 * these two functions, and it is the rule that decides whether an error is
 * visible at all. An error on a tab that is not open is the same as no error —
 * the save button just stops working.
 */

export const TABS = [
  'Basic',
  'Facts',
  'Pricing',
  'Departures',
  'Itinerary',
  'Includes',
  'Gallery',
  'FAQs',
  'SEO',
] as const;

/**
 * `(typeof TABS)[number]` — "the type of any element of TABS". Because TABS is
 * declared `as const`, its elements are the literal types `'Basic'`,
 * `'Facts'`… rather than `string`, so this is the union of the nine names and a
 * typo in a tab name is a compile error.
 */
export type TabName = (typeof TABS)[number];

/**
 * Keyed by the **top-level** field. Errors arrive with their full path —
 * Mongoose and Zod both report `departureSeasons.0.exceptions.0.status` — and
 * `tabForField` takes the first segment.
 */
const TAB_FOR_FIELD: Record<string, TabName> = {
  title: 'Basic',
  slug: 'Basic',
  destination: 'Basic',
  activity: 'Basic',
  summary: 'Basic',
  answerBlock: 'Basic',
  description: 'Basic',
  status: 'Basic',
  featured: 'Basic',

  durationDays: 'Facts',
  difficulty: 'Facts',
  bestMonths: 'Facts',
  region: 'Facts',
  maxAltitudeM: 'Facts',
  peakName: 'Facts',
  tripGrade: 'Facts',
  minGroupSize: 'Facts',
  maxGroupSize: 'Facts',
  hasElevationProfile: 'Facts',
  startPoint: 'Facts',
  endPoint: 'Facts',

  price: 'Pricing',
  discountedPrice: 'Pricing',
  priceLabel: 'Pricing',
  groupPricing: 'Pricing',

  departureSeasons: 'Departures',
  blackoutPeriods: 'Departures',

  itinerary: 'Itinerary',
  includes: 'Includes',
  excludes: 'Includes',
  gallery: 'Gallery',
  coverImage: 'Gallery',
  coverImageAlt: 'Gallery',
  faqs: 'FAQs',

  metaTitle: 'SEO',
  metaDescription: 'SEO',
  canonicalUrl: 'SEO',
  ogTitle: 'SEO',
  ogDescription: 'SEO',
  ogImage: 'SEO',
  schemaType: 'SEO',
  noIndex: 'SEO',
};

/**
 * The tab holding a field path, or undefined for a path no tab owns.
 *
 * Returns `TabName | undefined` rather than falling back to 'Basic': a path
 * nobody mapped is a bug to notice, and quietly opening the first tab would
 * show the admin a tab with no error on it.
 */
export function tabForField(path: string): TabName | undefined {
  return TAB_FOR_FIELD[path.split('.')[0]];
}

/** The first tab, in tab order, holding any of these errors. */
export function firstTabWithError(fieldErrors: Record<string, string>): TabName | undefined {
  const paths = Object.keys(fieldErrors);

  return TABS.find((tab) => paths.some((path) => tabForField(path) === tab));
}

/**
 * Removes every error at or below `field`.
 *
 * Editing a field clears its error, so the admin does not see a fixed value
 * still flagged. For a list field that has to include the nested paths: the
 * seasons are edited as one value, `departureSeasons`, but their errors are
 * keyed `departureSeasons.0.exceptions.0.status`, and deleting only the exact
 * key left those on screen after the fix.
 */
export function withoutErrorsFor(
  errors: Record<string, string>,
  field: string
): Record<string, string> {
  const prefix = `${field}.`;
  const kept = Object.entries(errors).filter(
    ([path]) => path !== field && !path.startsWith(prefix)
  );

  return kept.length === Object.keys(errors).length ? errors : Object.fromEntries(kept);
}
