/**
 * What trip was this inquiry about?
 *
 * Three sources, in order of how trustworthy they are *right now*:
 *
 * 1. **The populated reference.** Current, and follows a rename — if the trip
 *    was retitled, the admin should see what it is called today when the record
 *    still exists to say so.
 * 2. **`tripTitle`, the snapshot** taken at submission. The reference can stop
 *    resolving: a draft trip that gets deleted leaves `populate('trip')`
 *    returning null, and without this the inquiry reads as a "General inquiry"
 *    — an inquiry that says nothing about what was asked, while a customer waits
 *    for an answer about a specific trek.
 * 3. **Neither**, which is a real and expected case rather than missing data: a
 *    general inquiry naming no trip at all.
 *
 * One helper rather than five copies of `?? ??` because the five call sites —
 * the inquiry list, the inquiry detail, the dashboard and two email templates in
 * `QuickReply` — must agree. A thread where the list says one thing and the
 * reply template says another is worse than either being wrong consistently.
 *
 * **No value imports**, only types, so this is safe in the Client Components
 * that need it. Importing the Mongoose model would drag the driver into the
 * browser bundle and fail the build naming `tls`.
 */

/** Only the two fields this reads, so both populated and lean shapes fit. */
export interface BookingTripSource {
  trip?: { title?: string } | null;
  tripTitle?: string | null;
}

/** The label for a trip that no longer resolves and was never snapshotted. */
export const GENERAL_INQUIRY = 'General inquiry';

/**
 * The trip's name, or null when the inquiry genuinely named none.
 *
 * Null rather than the fallback string, so a caller can tell "no trip" apart
 * from "a trip called General inquiry" and choose its own wording — the detail
 * screen says more than the list does.
 */
export function bookingTripTitle(booking: BookingTripSource): string | null {
  const live = booking.trip?.title?.trim();

  if (live) return live;

  const snapshot = booking.tripTitle?.trim();

  return snapshot ? snapshot : null;
}

/**
 * True when the trip record is gone but the snapshot remembers it.
 *
 * The admin shows this differently: the name is still shown, with a note that
 * the trip no longer exists. Silently rendering a deleted trip's name as though
 * it were live would send staff looking for a page that 404s.
 */
export function bookingTripIsDeleted(booking: BookingTripSource): boolean {
  return !booking.trip?.title?.trim() && !!booking.tripTitle?.trim();
}
