import { z } from 'zod';

import { BOOKING_STATUSES } from '../../models/shared/bookingStatus';

/**
 * What an admin is allowed to change on an inquiry.
 *
 * Two fields. **Everything the visitor submitted is immutable from the admin**
 * — name, email, nationality, message, and above all `consentedAt`. A screen
 * that can edit the customer's own words turns the record from evidence into
 * an account of what staff remember, and a `consentedAt` that an operator can
 * set is not a consent record at all.
 *
 * `.partial()` because the two controls save independently: the status dropdown
 * sends only a status, the notes box sends only notes. Sending both every time
 * would mean the notes box silently reverting a status change made in another
 * tab.
 */
export const adminBookingUpdateSchema = z
  .object({
    status: z.enum(BOOKING_STATUSES),
    /*
     * Empty string is meaningful here and must not be normalised to undefined
     * the way an optional *form* field is: clearing the notes box is a real
     * edit, and mapping it to undefined would make "delete this note"
     * indistinguishable from "do not touch the notes".
     *
     * The cap is not a validation rule so much as a limit on what one admin
     * request can push into the database.
     */
    internalNotes: z.string().max(10_000),
  })
  .partial()
  /*
   * `{}` parses cleanly against a fully partial object, which would mean a
   * request that changes nothing returning 200 as if it had worked. This makes
   * the empty case an error the caller can see.
   */
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
  });

export type AdminBookingUpdate = z.infer<typeof adminBookingUpdateSchema>;
