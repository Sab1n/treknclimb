/**
 * Which column the inquiry table is sorted by.
 *
 * Lives in `shared/` rather than in `lib/queries/bookings.ts` for the reason
 * `shared/bookingStatus.ts` and `shared/status.ts` do: **a vocabulary is not a
 * query.** The query module imports `lib/db`, which throws at import time
 * without a `MONGODB_URI` — so anything needing just the list of valid sort
 * fields was dragging a database connection in with it.
 *
 * That was not hypothetical. `lib/adminFilters.ts` parses a query string and
 * touches no database at all, but importing this list from the query module
 * made it impossible to unit-test the parsing without a live Atlas connection.
 *
 * Constants and types have no runtime dependencies, so they can sit on both
 * sides of any boundary. The query module re-exports this, so existing imports
 * keep working.
 */
export const BOOKING_SORT_FIELDS = [
  'createdAt',
  'name',
  'nationality',
  'travellers',
  'preferredDate',
  'status',
] as const;

export type BookingSortField = (typeof BOOKING_SORT_FIELDS)[number];
