/**
 * Date handling for the admin screens.
 *
 * ## Everything is shown in Nepal time
 *
 * The staff reading these screens are in Pokhara. A timestamp rendered in UTC
 * is 5 hours 45 minutes behind what their clock says, which is enough to put a
 * late-evening inquiry on the wrong day — and "did this come in today?" is a
 * question the inquiry list is asked constantly.
 *
 * The zone is applied explicitly rather than left to the machine's locale.
 * Server components render on the host, so without a fixed zone these strings
 * would read as whatever region the deployment happens to run in, and would
 * change if it moved.
 *
 * Nepal is UTC+05:45 year-round with no daylight saving, so the offset can also
 * be written as a literal where a parsed string needs one — see
 * `startOfNepalDay`. Anywhere with DST this shortcut would be a bug.
 */

export const NEPAL_TIME_ZONE = 'Asia/Kathmandu';

/** The fixed UTC offset, for constructing day boundaries from a date input. */
const NEPAL_UTC_OFFSET = '+05:45';

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: NEPAL_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: NEPAL_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** "11 Sep 2026, 14:32" in Nepal time. Em dash for a missing value. */
export function formatDateTime(value: Date | null | undefined): string {
  if (!value) return '—';

  return dateTimeFormatter.format(new Date(value));
}

/** "11 Sep 2026" in Nepal time. For dates with no meaningful time of day. */
export function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';

  return dateFormatter.format(new Date(value));
}

/**
 * "3 days ago", for the staleness warnings.
 *
 * Rounds down, so "6 days ago" really means at least six — which is the
 * direction that matters when the number is being compared against a
 * seven-day threshold.
 */
export function daysSince(value: Date | null | undefined): number | null {
  if (!value) return null;

  const ms = Date.now() - new Date(value).getTime();

  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Midnight in Nepal on the given `YYYY-MM-DD`, as a real instant.
 *
 * A `<input type="date">` submits a bare calendar date with no zone. Passing
 * that to `new Date()` parses it as **UTC midnight**, which is 05:45 on that
 * morning in Pokhara — so filtering "from the 11th" would silently drop every
 * inquiry that arrived in the first six hours of the day the admin can see on
 * screen. Appending the offset makes the boundary mean what the form says.
 *
 * Returns `undefined` for anything that is not a date, so a hand-edited query
 * string degrades to "no filter" rather than to an Invalid Date that makes
 * every comparison false and empties the table with no explanation.
 */
export function startOfNepalDay(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const date = new Date(`${value}T00:00:00.000${NEPAL_UTC_OFFSET}`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * The last millisecond of that Nepal day.
 *
 * The range filter is inclusive at both ends: an admin who sets "to" to today
 * means "including today", not "up to midnight this morning". Using the start
 * of the day as an upper bound is the off-by-one that makes a date filter look
 * like it loses records.
 */
export function endOfNepalDay(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const date = new Date(`${value}T23:59:59.999${NEPAL_UTC_OFFSET}`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}
