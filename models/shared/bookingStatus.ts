/**
 * The inquiry vocabulary — status and contact channel.
 *
 * Split out of `models/BookingRequest.ts` for one concrete reason: **the admin
 * status dropdown is a Client Component**, and importing these from the model
 * pulls the model in, which pulls in Mongoose, which pulls in the MongoDB
 * driver — which imports `net` and `tls`. Those do not exist in a browser, and
 * the build fails with a module-not-found that names `tls` rather than anything
 * you wrote.
 *
 * This is the client-component boundary CLAUDE.md said to wait for. Constants
 * and types have no runtime dependencies, so they can sit on both sides of it;
 * the schema cannot. Same pattern as `status.ts`.
 *
 * `as const` freezes the array into a tuple of literals and `(typeof X)[number]`
 * reads the union back out, so the runtime enum and the compile-time type are
 * the same single list and cannot drift.
 */

export const BOOKING_STATUSES = [
  'Pending',
  'Contacted',
  'Confirmed',
  'Closed',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const CONTACT_CHANNELS = ['email', 'whatsapp', 'either'] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
