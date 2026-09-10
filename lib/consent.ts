/**
 * The consent wording, in one place.
 *
 * `BookingRequest.consentedAt` records *when* someone agreed. That timestamp
 * only answers "what did they agree to?" if the wording is dated too —
 * otherwise a policy rewrite silently reinterprets every consent already
 * stored. So the statement lives here with the date it took effect, the form
 * renders it from here, and the Privacy Policy quotes it from here.
 *
 * **When the wording changes:** update both constants together in the same
 * commit. If a record of the superseded wording is ever needed, this becomes a
 * dated array with the current entry last, and `consentedAt` selects the entry
 * in force at that moment. One constant is enough until there is a second
 * version to keep.
 */

export const CONSENT_STATEMENT =
  'I agree to Trek & Climb Adventure using these details to respond to my inquiry.';

/** ISO date this wording took effect. Update it whenever the wording changes. */
export const CONSENT_STATEMENT_SINCE = '2026-09-10';
