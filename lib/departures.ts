import type {
  DepartureStatus,
  ExceptionStatus,
  SeasonPattern,
} from '../models/shared/departures';
import { NEPAL_TIME_ZONE } from './adminTime';

/**
 * Departure seasons, the dates they generate, and the prices on the rail.
 *
 * Shared by the model's validators, the trip page, the booking rail and the
 * admin editor. **No runtime imports from `models/`**, only types: the rail is
 * a Client Component, and a value import of the Trip model would pull Mongoose
 * and the MongoDB driver's `net` and `tls` requires into the browser bundle.
 *
 * ## One generator, everywhere
 *
 * What the office stores is a season — "daily, 1 to 31 October, $1,245". What
 * a visitor picks is a date. `generateDepartures` is the only code that turns
 * one into the other. The calendar, the rail's prices, the editor's counts and
 * the model's "is this exception on a real departure date?" check all go
 * through it, so they cannot disagree about which dates exist.
 *
 * ## A departure's identity is the season's id plus the date
 *
 * `departureId(seasonId, date)` → `"<seasonId>:2026-10-13"`. Part two stores
 * that on an inquiry. It is stable when the season's price or exceptions are
 * edited, because the save route keeps the season's `_id`; it stops resolving
 * only if the date leaves the season (range or pattern changed) or the season
 * is deleted — the cases where the departure genuinely no longer exists.
 *
 * ## Every date here is a `YYYY-MM-DD` string
 *
 * A departure date is a **calendar date**, not an instant. It is stored as a
 * `Date` at UTC midnight because MongoDB has no date-only type, and the one
 * safe thing to do with that `Date` is turn it straight back into the string
 * it stands for. Strings also compare correctly as strings — the format is
 * fixed-width and most-significant first — so the comparisons below never
 * build a `Date` at all.
 */

/* ------------------------------------------------------------------ *
 * Shapes that cross into Client Components — plain data only
 * ------------------------------------------------------------------ */

/**
 * A date on a season that departs differently from the rest of it.
 *
 * `status` is `ExceptionStatus | null` rather than optional: the key is always
 * present, and null is the recorded fact "this date still runs" — which is
 * what an exception that only overrides the price says. `pricePerPerson` is
 * null when the season's price applies.
 */
export interface ExceptionView {
  date: string;
  status: ExceptionStatus | null;
  pricePerPerson: number | null;
}

export interface SeasonView {
  id: string;
  startDate: string;
  endDate: string;
  pattern: SeasonPattern;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. Empty for `daily`. */
  weekdays: number[];
  pricePerPerson: number;
  exceptions: ExceptionView[];
}

/** One generated departure — what the calendar shows and a visitor picks. */
export interface Departure {
  /** `<seasonId>:<date>`. See "A departure's identity" above. */
  id: string;
  seasonId: string;
  date: string;
  /** The trip's last day: `date` plus `durationDays - 1`. */
  endDate: string;
  pricePerPerson: number;
  status: DepartureStatus;
}

/**
 * A blackout period, as it crosses into a Client Component.
 *
 * `reason` is `string | null` rather than optional because the converter
 * always sets the key; an optional key would also admit `undefined`, which
 * JSON drops on its way to the client.
 */
export interface BlackoutView {
  id: string;
  start: string;
  end: string;
  reason: string | null;
}

/* ------------------------------------------------------------------ *
 * Calendar-date helpers
 * ------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True for a well-formed **and real** calendar date. The regex alone accepts
 * `2026-02-31`, which `new Date()` would roll into March; round-tripping
 * catches it.
 */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A stored date-only `Date` → the string it stands for. UTC, never local. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → the `Date` that stores it: UTC midnight on that day. */
export function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` plus a number of days, which may be negative. */
export function addDays(value: string, days: number): string {
  const date = fromIsoDate(value);

  date.setUTCDate(date.getUTCDate() + days);

  return toIsoDate(date);
}

/** 1 = Monday … 7 = Sunday. `getUTCDay()` counts 0 = Sunday, hence the shift. */
export function isoWeekday(value: string): number {
  return ((fromIsoDate(value).getUTCDay() + 6) % 7) + 1;
}

/**
 * Today's date **in Pokhara**, as `YYYY-MM-DD`.
 *
 * "Has this departure gone?" is a question about the company's calendar, not
 * the visitor's. `formatToParts` rather than a locale that happens to print
 * year-month-day, because the parts are labelled and cannot reorder.
 */
export function nepalToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: NEPAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

/* ------------------------------------------------------------------ *
 * Seasons → departures
 * ------------------------------------------------------------------ */

type SeasonShape = Pick<SeasonView, 'startDate' | 'endDate' | 'pattern' | 'weekdays'>;

/**
 * Does this season depart on `date`?
 *
 * Within the range, inclusive at both ends, and on the pattern. A season whose
 * start equals its end is a single departure on that day.
 */
export function runsOn(season: SeasonShape, date: string): boolean {
  if (date < season.startDate || date > season.endDate) return false;

  return season.pattern === 'daily' || season.weekdays.includes(isoWeekday(date));
}

/**
 * Every date a season departs on, from `from` (inclusive) to its end.
 *
 * `from` lets the page skip the past without generating it first — a season
 * running all year is 365 iterations, and there is no reason to build the
 * months that have gone.
 */
export function seasonDates(season: SeasonShape, from?: string): string[] {
  const dates: string[] = [];
  const start = from && from > season.startDate ? from : season.startDate;

  for (let date = start; date <= season.endDate; date = addDays(date, 1)) {
    if (runsOn(season, date)) dates.push(date);
  }

  return dates;
}

/** The stable identity of one generated departure. */
export function departureId(seasonId: string, date: string): string {
  return `${seasonId}:${date}`;
}

/**
 * The upcoming departures of a trip, soonest first.
 *
 * "Upcoming" means the date is today or later, in Pokhara. A departure
 * leaving today is still listed — the office marks it `closed` if a same-day
 * inquiry is no use. That is the whole of "past departures are hidden
 * automatically": nothing is edited when a date goes by, the generator simply
 * stops producing it.
 *
 * Exceptions are applied by date: a `status` replaces `available`, a
 * `pricePerPerson` replaces the season's price.
 *
 * If two seasons generate the same date, both departures are returned — they
 * have different identities and possibly different prices. What a single
 * calendar cell shows for such a date is the caller's decision; see
 * `departureOnDate`.
 */
export function generateDepartures(
  seasons: SeasonView[],
  durationDays: number,
  today: string
): Departure[] {
  const departures: Departure[] = [];

  for (const season of seasons) {
    if (season.endDate < today) continue;

    const exceptions = new Map(
      season.exceptions.map((exception) => [exception.date, exception])
    );

    for (const date of seasonDates(season, today)) {
      const exception = exceptions.get(date);

      departures.push({
        id: departureId(season.id, date),
        seasonId: season.id,
        date,
        endDate: addDays(date, Math.max(durationDays, 1) - 1),
        pricePerPerson: exception?.pricePerPerson ?? season.pricePerPerson,
        status: exception?.status ?? 'available',
      });
    }
  }

  return departures.sort((a, b) =>
    a.date === b.date ? a.pricePerPerson - b.pricePerPerson : a.date < b.date ? -1 : 1
  );
}

/* ------------------------------------------------------------------ *
 * Looking a departure up by its identity (part two)
 * ------------------------------------------------------------------ */

/** A season id is a Mongo ObjectId: 24 hex characters. */
const DEPARTURE_ID = /^([0-9a-f]{24}):(\d{4}-\d{2}-\d{2})$/;

/**
 * `"<seasonId>:<date>"` → its two halves, or null if it is not one.
 *
 * The id arrives from a query string and a form post, so it is checked for
 * shape **and** for a real date — `2026-02-31` matches the pattern.
 */
export function parseDepartureId(id: string): { seasonId: string; date: string } | null {
  const match = DEPARTURE_ID.exec(id);

  if (!match || !isIsoDate(match[2])) return null;

  return { seasonId: match[1], date: match[2] };
}

/**
 * The departure an identity names, as the seasons say it is **today** — or
 * null if it no longer exists: the season was deleted, its range or pattern
 * no longer produces that date, or the date is before `today`.
 *
 * Generates from the one season the id names rather than the whole trip, so a
 * lookup is at most one season's dates.
 */
export function findDeparture(
  seasons: SeasonView[],
  durationDays: number,
  id: string,
  today: string
): Departure | null {
  const parsed = parseDepartureId(id);

  if (!parsed || parsed.date < today) return null;

  const season = seasons.find((candidate) => candidate.id === parsed.seasonId);

  if (!season || !runsOn(season, parsed.date)) return null;

  return generateDepartures([season], durationDays, parsed.date).find(
    (departure) => departure.id === id
  ) ?? null;
}

/**
 * A stored season → the plain `SeasonView` the generator reads.
 *
 * Takes a structural type rather than `IDepartureSeason`, so this file keeps
 * its promise of no model imports: anything with these fields fits, whether a
 * lean read, a populated ref or a hydrated subdocument. `new Date(...)` around
 * each date because a lean read through a populate can hand back either a
 * `Date` or its string form.
 */
export interface StoredSeason {
  _id?: unknown;
  startDate: Date | string;
  endDate: Date | string;
  pattern: SeasonPattern;
  weekdays?: number[];
  pricePerPerson: number;
  exceptions?: {
    date: Date | string;
    status?: ExceptionStatus | null;
    pricePerPerson?: number | null;
  }[];
}

export function toSeasonView(season: StoredSeason): SeasonView {
  return {
    id: String(season._id),
    startDate: toIsoDate(new Date(season.startDate)),
    endDate: toIsoDate(new Date(season.endDate)),
    pattern: season.pattern,
    weekdays: [...(season.weekdays ?? [])],
    pricePerPerson: season.pricePerPerson,
    exceptions: (season.exceptions ?? []).map((exception) => ({
      date: toIsoDate(new Date(exception.date)),
      status: exception.status ?? null,
      pricePerPerson: exception.pricePerPerson ?? null,
    })),
  };
}

/**
 * The one departure a calendar cell stands for.
 *
 * Normally there is exactly one per date. When overlapping seasons produce two,
 * the one a visitor can actually join wins, then the cheaper — the date *is*
 * available, which is the fact the cell exists to show.
 */
export function departureOnDate(
  departures: Departure[],
  date: string
): Departure | null {
  let best: Departure | null = null;

  for (const departure of departures) {
    if (departure.date !== date) continue;

    if (
      !best ||
      (departure.status === 'available' && best.status !== 'available') ||
      (departure.status === best.status && departure.pricePerPerson < best.pricePerPerson)
    ) {
      best = departure;
    }
  }

  return best;
}

const monthNameFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  timeZone: 'UTC',
});

const monthYearFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * A `YYYY-MM` as a month name — "September", or "September 2027" once the
 * year stops being the obvious one.
 *
 * The line above the calendar used to read "this month", which is true of the
 * grid and ambiguous beside the rail's headline "from" price: two numbers on
 * one screen, one of them labelled by a phrase that does not say which month
 * it means. Naming the month removes the reading where they contradict each
 * other.
 *
 * The year is added only when it differs from `today`'s — "September 2026
 * departures" in September 2026 is noise, and leaving it off in December when
 * the grid is showing next March is worse.
 *
 * `timeZone: 'UTC'`, as everywhere else here: these are calendar dates stored
 * as UTC midnights, and read back in any other zone a month boundary moves.
 */
export function monthLabel(month: string, today: string): string {
  const date = fromIsoDate(`${month}-01`);

  return month.slice(0, 4) === today.slice(0, 4)
    ? monthNameFormatter.format(date)
    : monthYearFormatter.format(date);
}

/**
 * The cheapest **available** departure's price, or null when none is
 * available. Full and closed departures are real but cannot be joined, so
 * their price is not a price anyone can pay.
 *
 * Pass a month (`YYYY-MM`) to restrict it — the "September departures from
 * $X" line above the calendar.
 */
export function groupFromPrice(departures: Departure[], month?: string): number | null {
  const prices = departures
    .filter((departure) => departure.status === 'available')
    .filter((departure) => !month || departure.date.startsWith(month))
    .map((departure) => departure.pricePerPerson);

  // `Math.min()` of nothing is Infinity, so the empty case is handled first.
  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * The "from" price for a private trip: the cheapest group-pricing tier, or the
 * flat price when the trip has no tiers.
 */
export function privateFromPrice(trip: {
  price: number;
  groupPricing: { pricePerPerson: number }[];
}): number {
  const tiers = trip.groupPricing.map((tier) => tier.pricePerPerson);

  return tiers.length > 0 ? Math.min(...tiers) : trip.price;
}

/** The rail's headline "from": the lower of the two paths. */
export function headlineFromPrice(groupFrom: number | null, privateFrom: number): number {
  return groupFrom === null ? privateFrom : Math.min(groupFrom, privateFrom);
}

/**
 * Only what a "from" price is computed from. Structural, so this file still
 * imports nothing from `models/`: a lean read, a populated document and a
 * hydrated one all fit.
 *
 * `departureSeasons` and `groupPricing` are optional because a `.lean()` read
 * does not apply schema defaults — a trip written before either field existed
 * comes back without the key.
 */
export interface PricedTrip {
  price: number;
  durationDays: number;
  groupPricing?: { pricePerPerson: number }[];
  departureSeasons?: StoredSeason[];
}

/**
 * **The** "from" price for a trip — the single number every surface shows.
 *
 * The lower of the cheapest upcoming *available* departure and the cheapest
 * private tier. Cards, the /trips listing and its sort, the trip page
 * headline, the rail and the `Offer` in structured data all call this, so a
 * visitor comparing a card against the page it links to can never see two
 * figures for one trip. Before this existed the card read the flat price and
 * the page read the departures: Everest Base Camp advertised $1,295 on the
 * card and $1,245 on its own page.
 *
 * `today` is Pokhara's date, because "upcoming" is the company's calendar, not
 * the reader's. It is a parameter rather than read here so that a page and
 * everything on it price against one instant.
 *
 * The flat `price` has not stopped mattering: it is still the anchor the admin
 * maintains, still required to equal the cheapest tier, and still what this
 * falls back to for a trip with no tiers and no departures.
 */
export function tripFromPrice(trip: PricedTrip, today: string): number {
  const seasons = (trip.departureSeasons ?? []).map(toSeasonView);
  const groupFrom = groupFromPrice(
    generateDepartures(seasons, trip.durationDays, today)
  );

  return headlineFromPrice(
    groupFrom,
    privateFromPrice({ price: trip.price, groupPricing: trip.groupPricing ?? [] })
  );
}

/* ------------------------------------------------------------------ *
 * Validation shared by the model and the Zod schema
 * ------------------------------------------------------------------ */

/**
 * What is wrong with a season's exceptions, one message per offending index.
 *
 * Shared so the model (the guarantee) and the Zod schema (keyed to the row,
 * before a round trip) cannot apply different rules. An exception must:
 *
 * - fall on a date the season actually departs — an exception on a Tuesday of
 *   a Mondays-only season would silently do nothing;
 * - do something — change the status, the price, or both;
 * - not repeat a date already excepted, which would leave it undefined which
 *   of the two applies.
 */
export function exceptionProblems(
  season: SeasonShape,
  exceptions: { date: string; status: string | null; pricePerPerson: number | null | undefined }[]
): Map<number, string> {
  const problems = new Map<number, string>();
  const seen = new Set<string>();

  exceptions.forEach((exception, index) => {
    if (!runsOn(season, exception.date)) {
      problems.set(index, 'This date is not a departure in this season');
    } else if (!exception.status && exception.pricePerPerson == null) {
      problems.set(index, 'Mark the date full or closed, or give it its own price');
    } else if (seen.has(exception.date)) {
      problems.set(index, 'This date already has an exception');
    }

    seen.add(exception.date);
  });

  return problems;
}

/**
 * The first date two seasons both depart on, or null if they never share one.
 *
 * Only the intersection of the two ranges is walked, so two seasons in
 * different months cost nothing, and two in the same year at most 366 steps.
 */
export function sharedDepartureDate(a: SeasonShape, b: SeasonShape): string | null {
  const from = a.startDate > b.startDate ? a.startDate : b.startDate;
  const to = a.endDate < b.endDate ? a.endDate : b.endDate;

  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (runsOn(a, date) && runsOn(b, date)) return date;
  }

  return null;
}

/**
 * Seasons that overlap an earlier one, keyed by the **later** season's index.
 *
 * Overlap means *both seasons depart on the same date*, not merely that their
 * ranges intersect. Two seasons over the same weeks, one leaving on Mondays and
 * one on Thursdays, never produce the same departure and are allowed — that is
 * one way to price two weekly departures differently. What is rejected is two
 * seasons claiming one date: that is two prices and two identities for one
 * departure, and a different price on part of a season is what a price-override
 * exception is for.
 *
 * The message names the other season and the first clashing date, because
 * "overlaps another season" on a trip with six of them sends the admin
 * comparing every pair by hand. Only the later season is flagged, so each
 * clash is reported once.
 *
 * Seasons whose dates are not yet complete are skipped — a half-typed row is
 * not an overlap yet, and its own fields already report what is missing.
 */
export function seasonOverlaps(seasons: SeasonShape[]): Map<number, string> {
  const problems = new Map<number, string>();
  const format = (date: string) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(fromIsoDate(date));

  const complete = (season: SeasonShape) =>
    isIsoDate(season.startDate) &&
    isIsoDate(season.endDate) &&
    season.endDate >= season.startDate;

  seasons.forEach((later, j) => {
    if (!complete(later)) return;

    for (let i = 0; i < j; i++) {
      const earlier = seasons[i];

      if (!complete(earlier)) continue;

      const clash = sharedDepartureDate(earlier, later);

      if (clash) {
        problems.set(
          j,
          `Overlaps the season starting ${format(earlier.startDate)} — both depart on ${format(clash)}. Use an exception to price part of a season differently.`
        );
        return;
      }
    }
  });

  return problems;
}

/* ------------------------------------------------------------------ *
 * Blackout periods (private trips)
 * ------------------------------------------------------------------ */

/** The blackout covering `date`, or null. Inclusive at both ends. */
export function blackoutOn<T extends { start: string; end: string }>(
  date: string,
  periods: T[]
): T | null {
  return periods.find((period) => period.start <= date && date <= period.end) ?? null;
}

/**
 * Blackout periods that have not finished yet.
 *
 * The generic `<T extends { end: string }>` means "any type with at least a
 * string `end`". The function reads only that field, and because it returns
 * `T[]` rather than `{ end: string }[]`, a caller passing `BlackoutView[]` gets
 * `BlackoutView[]` back with every other field still typed.
 */
export function currentBlackouts<T extends { end: string }>(periods: T[], today: string): T[] {
  return periods.filter((period) => period.end >= today);
}
