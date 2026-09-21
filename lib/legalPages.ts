/**
 * The effective date of each legal document, in one place.
 *
 * The copy for these three pages lives in the page files, so "last modified"
 * is not a database fact — there is no `updatedAt` to read. It is whatever
 * date the author last touched the text, which is why each page already
 * declares one and prints it to the visitor.
 *
 * It is lifted out here because the sitemap needs the same date as a `Date`
 * object. Two independently maintained copies of "when did the privacy policy
 * last change" drift, and the way they drift is the visible line saying
 * September while `<lastmod>` says June — a page that tells a crawler one
 * thing and a reader another.
 *
 * **Update the date here when the text on the page changes, not in the page.**
 */

/**
 * ISO `YYYY-MM-DD`, not a `Date`. A literal is what a person editing this file
 * should see, and it keeps the value free of a timezone until something asks
 * for one.
 *
 * `as const` is the load-bearing part. Without it TypeScript widens this to
 * `{ [k: string]: string }` and the keys stop meaning anything; with it, the
 * object's keys become a literal union, which is what `LegalPath` below reads
 * back out. That is what makes `legalLastUpdatedAt('/prviacy-policy')` a
 * compile error rather than an `undefined` that formats as "Invalid Date".
 */
export const LEGAL_LAST_UPDATED = {
  '/privacy-policy': '2026-09-10',
  '/terms': '2026-09-10',
  '/booking-policy': '2026-09-10',
} as const;

/**
 * `keyof typeof X` — `typeof X` is the *type* of the value above, and `keyof`
 * takes its keys. So this is the union
 * `'/privacy-policy' | '/terms' | '/booking-policy'`, derived rather than
 * typed out, and it stays correct when a fourth document is added.
 */
export type LegalPath = keyof typeof LEGAL_LAST_UPDATED;

export const LEGAL_PATHS = Object.keys(LEGAL_LAST_UPDATED) as LegalPath[];

/**
 * The date as a `Date`, for `<lastmod>`.
 *
 * The `T00:00:00.000Z` is not decoration. `new Date('2026-09-10')` is parsed
 * as UTC midnight by specification, but `new Date('2026-09-10T00:00:00')`
 * without the `Z` is parsed as *local* midnight — two different instants from
 * two strings that look the same. Pinning it to UTC explicitly means the value
 * does not change with the deployment region, the same reason
 * `lib/adminTime.ts` names `Asia/Kathmandu` rather than trusting the host.
 */
export function legalLastUpdatedAt(path: LegalPath): Date {
  return new Date(`${LEGAL_LAST_UPDATED[path]}T00:00:00.000Z`);
}

/**
 * The date as visitors see it — "10 September 2026".
 *
 * `timeZone: 'UTC'` for the same reason: formatted in a zone behind UTC, a
 * UTC-midnight date renders as the day before, so the page would quietly show
 * the 9th on a US host and the 10th in Pokhara.
 */
export function formatLegalDate(path: LegalPath): string {
  return legalLastUpdatedAt(path).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
