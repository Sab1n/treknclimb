import { z } from 'zod';

import { REDIRECT_TYPES } from '../../models/shared/redirectTypes';

/**
 * The redirect editor's schema.
 *
 * Both fields are paths, not URLs. A redirect map imported from a crawl arrives
 * full of absolute URLs (`https://treknclimb.com/old-page`), and storing one
 * would mean the lookup never matches — the resolver compares against a request
 * path. Rejecting them with a message that says so is more useful than
 * silently storing something that cannot fire.
 */
const pathSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(500)
    .toLowerCase()
    .refine(
      (value) => value.startsWith('/'),
      `${label} must be a path beginning with "/" — not a full URL`
    )
    .refine(
      (value) => !value.includes('://'),
      `${label} must be a path, not a full URL. Drop the https://treknclimb.com part.`
    )
    .refine(
      (value) => !value.includes(' '),
      `${label} cannot contain spaces. Use the encoded form if the original URL had one.`
    );

export const adminRedirectSchema = z
  .object({
    oldUrl: pathSchema('The old path'),
    newUrl: pathSchema('The new path'),
    /*
     * A string on the way in because it comes from a select, coerced once here.
     * `z.coerce.number()` would accept `"abc"` as NaN and then fail the enum
     * check with a confusing message, so the parse is explicit.
     */
    type: z
      .string()
      .trim()
      .transform(Number)
      .refine(
        (value) => (REDIRECT_TYPES as readonly number[]).includes(value),
        'Choose one of the listed redirect types'
      ),
    isActive: z.boolean(),
  })
  /*
   * A row pointing at itself is an infinite redirect the browser refuses. The
   * resolver's cycle detection would catch it, but catching it at write time
   * means it never reaches the table at all.
   */
  .refine((data) => data.oldUrl !== data.newUrl, {
    message: 'A path cannot redirect to itself',
    path: ['newUrl'],
  });

export type AdminRedirectInput = z.input<typeof adminRedirectSchema>;
