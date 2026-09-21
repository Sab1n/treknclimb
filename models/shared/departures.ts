/**
 * The departure vocabularies.
 *
 * Live here rather than in `models/Trip.ts` because the trip editor and the
 * public booking rail are Client Components, and importing a value from the
 * model file would drag Mongoose — and the MongoDB driver's `net` and `tls`
 * requires — into the browser bundle. The model re-exports them.
 *
 * `as const` makes each array a tuple of **literal** types rather than a
 * `string[]`, and `(typeof X)[number]` reads "the type of any element of that
 * tuple" — so `DepartureStatus` is `'available' | 'full' | 'closed'`, derived
 * from the list rather than typed out a second time beside it.
 *
 * ## Seasons, not departures
 *
 * A trek that leaves every day from October to December is ninety departures,
 * and entering ninety rows is not a workflow. So what is stored is a **season**
 * — a date range, a pattern and a price — and the individual departures are
 * **generated** from it (`lib/departures.ts`). A season whose start and end are
 * the same day is a single departure, so there is one model, not two.
 *
 * Availability is still set by hand and still coarse. There is no capacity and
 * no places-booked count; a generated date is `available` unless an exception
 * on the season says `full` or `closed`. There is also **no "guaranteed"
 * status** — group departures have no minimum to run, so every published one
 * runs.
 */

/** The state of one generated departure, as the calendar shows it. */
export const DEPARTURE_STATUSES = ['available', 'full', 'closed'] as const;

export type DepartureStatus = (typeof DEPARTURE_STATUSES)[number];

export const DEPARTURE_STATUS_LABELS: Record<DepartureStatus, string> = {
  available: 'Available',
  full: 'Full',
  closed: 'Closed',
};

/**
 * What an exception can set a date to.
 *
 * A subset of `DEPARTURE_STATUSES` — `available` is what every generated date
 * already is, so it is not something an exception needs to say.
 */
export const EXCEPTION_STATUSES = ['full', 'closed'] as const;

export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

/**
 * How a season generates its dates.
 *
 * `daily` — every date from start to end. `weekdays` — only the listed days
 * of the week. A one-day season is written as `daily` with start = end.
 */
export const SEASON_PATTERNS = ['daily', 'weekdays'] as const;

export type SeasonPattern = (typeof SEASON_PATTERNS)[number];

/**
 * Days of the week as **ISO numbers: 1 = Monday … 7 = Sunday.**
 *
 * Not JavaScript's `getDay()`, which counts 0 = Sunday. That numbering is a
 * US convention baked into one API, and storing it would make "1" mean Monday
 * in the database and Monday-or-Sunday depending on which function last
 * touched it. ISO is what the calendar grid already uses (Monday first), and
 * `isoWeekday()` in `lib/departures.ts` is the one place the conversion
 * happens.
 */
export const ISO_WEEKDAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 7, short: 'Sun', long: 'Sunday' },
] as const;

/* ------------------------------------------------------------------ *
 * The booking side (part two)
 * ------------------------------------------------------------------ */

/**
 * How the visitor wants to travel. Recorded as the visitor's **choice** on the
 * inquiry form, never inferred from whether a date happens to be present — a
 * private-trip inquiry can carry a date, and a group inquiry whose departure
 * has since been deleted still has to say it was a group inquiry.
 */
export const TRIP_TYPES = ['group', 'private'] as const;

export type TripType = (typeof TRIP_TYPES)[number];

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  group: 'Group departure',
  private: 'Private trip',
};

/**
 * What a chosen departure turned out to be when it was checked.
 *
 * The three `DEPARTURE_STATUSES` plus `gone`: the departure no longer exists
 * at all — its season was deleted, its range or pattern no longer produces
 * that date, or the date has passed. An inquiry is saved in every case; only
 * `available` means the office can simply say yes.
 *
 * Checked twice with the same vocabulary: at submission (stored on the
 * inquiry, so the office knows what the visitor was offered) and again every
 * time the admin looks (computed, never stored, so it cannot go stale).
 */
export const DEPARTURE_CHECKS = ['available', 'full', 'closed', 'gone'] as const;

export type DepartureCheck = (typeof DEPARTURE_CHECKS)[number];

export const DEPARTURE_CHECK_LABELS: Record<DepartureCheck, string> = {
  available: 'Available',
  full: 'Full',
  closed: 'Closed',
  gone: 'No longer offered',
};
