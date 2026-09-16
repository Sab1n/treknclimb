/**
 * How much permit paperwork a region involves. Editorial, set by the admin —
 * nothing in the trip data implies it.
 *
 * Split out of `models/Destination.ts` per the client-boundary rule: the
 * destination editor renders this as a select, and that is a Client Component.
 * Importing the constant from the model would pull in Mongoose, then the
 * MongoDB driver, then `net` and `tls`, and the build would fail naming `tls`
 * rather than anything you wrote.
 *
 * `as const` freezes the array into a readonly tuple of string literals;
 * `(typeof X)[number]` reads the union back out. One list serves as both the
 * runtime `enum:` validator and the compile-time type, so they cannot drift.
 */
export const PERMIT_COMPLEXITIES = ['Low', 'Medium', 'High'] as const;

export type PermitComplexity = (typeof PERMIT_COMPLEXITIES)[number];
