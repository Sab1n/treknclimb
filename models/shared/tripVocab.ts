/**
 * Trip vocabularies — months and difficulty grades.
 *
 * Split out of `models/Trip.ts` per the client-boundary rule: the trip editor
 * renders a month multi-select and a difficulty dropdown, and both are Client
 * Components. Importing these from the model would pull in Mongoose, then the
 * MongoDB driver, then `net` and `tls`, and the build would fail naming `tls`.
 *
 * Constants and types have no runtime dependencies, so they can live on both
 * sides of that boundary. The schema cannot. Same pattern as `status.ts` and
 * `bookingStatus.ts`.
 *
 * `as const` freezes each array into a readonly tuple of string literals rather
 * than widening to `string[]`; `(typeof X)[number]` then reads the union back
 * out. One list serves as both the runtime `enum:` validator and the
 * compile-time type, so they cannot drift.
 */

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type Month = (typeof MONTHS)[number];

export const TRIP_DIFFICULTIES = [
  'Easy',
  'Moderate',
  'Challenging',
  'Extreme',
] as const;

export type TripDifficulty = (typeof TRIP_DIFFICULTIES)[number];
