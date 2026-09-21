import type { DepartureCheck, TripType } from '../models/shared/departures';
import {
  addDays,
  findDeparture,
  parseDepartureId,
  toIsoDate,
  toSeasonView,
  type SeasonView,
  type StoredSeason,
} from './departures';

/**
 * A chosen departure, checked — at submission and again in the admin.
 *
 * Two questions with one vocabulary (`DepartureCheck`):
 *
 * - **At submission** (`snapshotDeparture`): what was the departure when the
 *   inquiry arrived? Stored on the inquiry with its dates and price, so the
 *   record says what the customer asked about however the season is edited
 *   later. Anything but `available` is the flag for the office.
 * - **Now** (`departureNow`): is it still available? Computed every time the
 *   admin looks and never stored, so it cannot go stale.
 *
 * No model value imports — `import type` only — so this runs in the route,
 * the admin pages and the CSV export alike, and would run in a Client
 * Component too.
 */

/** The snapshot as plain `YYYY-MM-DD` strings, before the route stores it. */
export interface DepartureSnapshotView {
  startDate: string;
  endDate: string;
  pricePerPerson: number | null;
  statusAtSubmission: DepartureCheck;
}

/**
 * The snapshot for a departure id, taken against the trip's seasons as they
 * are right now.
 *
 * **Never rejects.** A departure that has gone full, closed or away since the
 * visitor opened the page is still a customer who wants that trek on roughly
 * those dates — the inquiry is saved and flagged, never refused. A gone
 * departure has no price to record, so `pricePerPerson` is null; its dates are
 * still known, from the id itself and the trip's length.
 *
 * Returns null only for an id that is not an id at all, which the Zod schema
 * has already refused.
 */
export function snapshotDeparture(
  seasons: SeasonView[],
  durationDays: number,
  departureId: string,
  today: string
): DepartureSnapshotView | null {
  const parsed = parseDepartureId(departureId);

  if (!parsed) return null;

  const departure = findDeparture(seasons, durationDays, departureId, today);

  if (departure) {
    return {
      startDate: departure.date,
      endDate: departure.endDate,
      pricePerPerson: departure.pricePerPerson,
      statusAtSubmission: departure.status,
    };
  }

  return {
    startDate: parsed.date,
    endDate: addDays(parsed.date, Math.max(durationDays, 1) - 1),
    pricePerPerson: null,
    statusAtSubmission: 'gone',
  };
}

/**
 * Where a departure stands now, for the admin.
 *
 * A **discriminated union**: every member has a `state` string, and checking
 * it narrows the type. After `if (now.state === 'bookable')` TypeScript knows
 * `now.pricePerPerson` exists; on the other branches the property is not there
 * to read by mistake. That is what an interface with an optional
 * `pricePerPerson?` could not express — it would allow a price on a departure
 * that has none.
 */
export type DepartureNow =
  | { state: 'bookable'; check: 'available'; pricePerPerson: number }
  | { state: 'unavailable'; check: 'full' | 'closed'; pricePerPerson: number }
  | { state: 'departed' }
  | { state: 'gone' }
  | { state: 'trip-deleted' };

export function departureNow(
  departureId: string,
  trip: { durationDays: number; seasons: SeasonView[] } | null,
  today: string
): DepartureNow {
  if (!trip) return { state: 'trip-deleted' };

  const parsed = parseDepartureId(departureId);

  if (!parsed) return { state: 'gone' };

  /*
   * Before `findDeparture`, which also returns null for a past date — but
   * "it left on the 13th" and "it was deleted" are different answers to the
   * office, and only one of them means anything went wrong.
   */
  if (parsed.date < today) return { state: 'departed' };

  const departure = findDeparture(trip.seasons, trip.durationDays, departureId, today);

  if (!departure) return { state: 'gone' };

  return departure.status === 'available'
    ? { state: 'bookable', check: 'available', pricePerPerson: departure.pricePerPerson }
    : { state: 'unavailable', check: departure.status, pricePerPerson: departure.pricePerPerson };
}

/** The admin's words for `DepartureNow`. */
export function departureNowLabel(now: DepartureNow): string {
  switch (now.state) {
    case 'bookable':
      return 'Still available';
    case 'unavailable':
      return now.check === 'full' ? 'Now full' : 'Now closed';
    case 'departed':
      return 'Departed';
    case 'gone':
      return 'No longer offered — the season was changed or deleted';
    case 'trip-deleted':
      return 'Trip deleted';
  }
}

/* ------------------------------------------------------------------ *
 * Reading what an inquiry stored
 * ------------------------------------------------------------------ */

/**
 * The departure fields as an inquiry holds them. Structural, and every field
 * optional-or-null, because inquiries read with `.lean()` skip schema defaults
 * — an inquiry from before part two may lack the keys entirely even after the
 * migration, if one arrives from a backup.
 */
export interface BookingDepartureSource {
  tripType?: TripType | null;
  departureId?: string | null;
  departureSnapshot?: {
    startDate: Date | string;
    endDate: Date | string;
    pricePerPerson?: number | null;
    statusAtSubmission: DepartureCheck;
  } | null;
}

/** The snapshot with its dates back as `YYYY-MM-DD`, or null. */
export function storedSnapshot(booking: BookingDepartureSource): DepartureSnapshotView | null {
  const snapshot = booking.departureSnapshot;

  if (!booking.departureId || !snapshot) return null;

  return {
    startDate: toIsoDate(new Date(snapshot.startDate)),
    endDate: toIsoDate(new Date(snapshot.endDate)),
    pricePerPerson: snapshot.pricePerPerson ?? null,
    statusAtSubmission: snapshot.statusAtSubmission,
  };
}

const rangeDay = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/**
 * "Tue 13 Oct – Mon 26 Oct 2026". UTC throughout — these are calendar dates
 * stored as UTC midnights, and read back in any other zone they shift a day.
 * The year is appended once rather than formatted, so the two ends match (see
 * the rail).
 */
export function formatDepartureRange(startDate: string, endDate: string): string {
  const day = (value: string) => rangeDay.format(new Date(`${value}T00:00:00.000Z`));

  return `${day(startDate)} – ${day(endDate)} ${endDate.slice(0, 4)}`;
}

/** Whole days, inclusive: 13 to 26 October is 14 days. */
export function departureLengthDays(startDate: string, endDate: string): number {
  const ms = new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime();

  return Math.round(ms / 86_400_000) + 1;
}

/* ------------------------------------------------------------------ *
 * For the admin: the snapshot and where it stands now, together
 * ------------------------------------------------------------------ */

/**
 * The trip as the admin queries populate it — only what the departure check
 * reads. Structural, so the populated `ITrip` fits without this file importing
 * the model.
 */
export interface DepartureTripSource {
  durationDays?: number;
  departureSeasons?: StoredSeason[];
}

export interface BookingDepartureView {
  snapshot: DepartureSnapshotView;
  now: DepartureNow;
}

/**
 * Everything the admin shows about an inquiry's departure, or null for one
 * that has none (a private trip, a general inquiry, or one from before part
 * two).
 *
 * `trip` is the **populated** reference: null when the trip has been deleted,
 * which is itself an answer — the departure cannot be available on a trip
 * that no longer exists.
 */
export function bookingDepartureView(
  booking: BookingDepartureSource & { trip?: DepartureTripSource | null },
  today: string
): BookingDepartureView | null {
  const snapshot = storedSnapshot(booking);

  if (!snapshot || !booking.departureId) return null;

  const trip = booking.trip
    ? {
        durationDays: booking.trip.durationDays ?? 1,
        seasons: (booking.trip.departureSeasons ?? []).map(toSeasonView),
      }
    : null;

  return { snapshot, now: departureNow(booking.departureId, trip, today) };
}
