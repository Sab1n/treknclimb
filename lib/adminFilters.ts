import {
  BOOKING_STATUSES,
  type BookingStatus,
} from '../models/BookingRequest';
import {
  BOOKING_SORT_FIELDS,
  type BookingSortField,
} from '../models/shared/bookingSort';
/*
 * Type-only, so it is erased at compile time and does not pull `lib/db` in.
 * The vocabulary above comes from `models/shared/` for exactly that reason —
 * this module parses a query string and touches no database, and it should not
 * need one to be imported.
 */
import type { BookingListOptions } from './queries/bookings';
import { startOfNepalDay, endOfNepalDay } from './adminTime';

/**
 * Turns the inquiry screen's query string into a filter.
 *
 * Shared by the page and the CSV export so that **"Export CSV" always means
 * "export what is on screen"**. Two copies of this parsing would drift, and the
 * failure would be quiet: a file that looks right and is missing rows.
 *
 * Everything here is untrusted input from a URL anyone can hand-edit, so every
 * value is checked against a known list and an unrecognised one falls back to
 * the default rather than reaching Mongo. A status of `{"$ne": null}` arriving
 * as a string is harmless because it never matches the enum.
 */

export interface InquiryFilters {
  status?: BookingStatus;
  /** The raw `YYYY-MM-DD` strings, so the form can re-render what was typed. */
  fromInput: string;
  toInput: string;
  sort: BookingSortField;
  direction: 'asc' | 'desc';
  /**
   * True when the two dates arrived the wrong way round and were swapped.
   *
   * Surfaced rather than handled silently. An inverted range is not a security
   * problem — it matches nothing — but it looks exactly like "there are no
   * inquiries in this period", which is the wrong conclusion to hand someone
   * checking whether the form is working. Swapping without saying so would
   * replace a confusing empty table with a confusing full one.
   */
  datesSwapped: boolean;
}

export interface InquirySearchParams {
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
}

export function parseInquiryFilters(
  params: InquirySearchParams
): InquiryFilters {
  const status = (BOOKING_STATUSES as readonly string[]).includes(
    params.status ?? ''
  )
    ? (params.status as BookingStatus)
    : undefined;

  const sort = (BOOKING_SORT_FIELDS as readonly string[]).includes(
    params.sort ?? ''
  )
    ? (params.sort as BookingSortField)
    : 'createdAt';

  // Only echoed back if they parse. A junk `?from=` would otherwise render
  // into the date input, where the browser silently discards it and the admin
  // sees an empty box next to a filtered table.
  let fromInput = startOfNepalDay(params.from) ? params.from! : '';
  let toInput = endOfNepalDay(params.to) ? params.to! : '';

  /*
   * An end date before the start date matches nothing, and nothing said so.
   *
   * Both bounds are applied to the same query, so `from` after `to` produces
   * an empty result that is indistinguishable from a genuinely quiet week —
   * and the date inputs still show what was typed, so there is no visible clue.
   * Typing them in the wrong order, or fixing one bound and forgetting the
   * other, is an ordinary mistake rather than an attack.
   *
   * Swapped rather than rejected: the admin's intent is unambiguous — they want
   * the period between these two dates — and an error message would make them
   * retype something the server already understood. The swap is reported so the
   * screen can say it happened.
   *
   * Compared as the **instants the bounds become**, not as strings. The bounds
   * are Nepal-time start-of-day and end-of-day, so `from === to` is a valid
   * single-day range and must not be treated as inverted.
   */
  const fromAt = startOfNepalDay(fromInput);
  const toAt = endOfNepalDay(toInput);

  const datesSwapped = !!fromAt && !!toAt && fromAt.getTime() > toAt.getTime();

  if (datesSwapped) [fromInput, toInput] = [toInput, fromInput];

  return {
    status,
    fromInput,
    toInput,
    sort,
    direction: params.dir === 'asc' ? 'asc' : 'desc',
    datesSwapped,
  };
}

/** The filter half, for the query helpers. */
export function toListOptions(filters: InquiryFilters): BookingListOptions {
  return {
    status: filters.status,
    from: startOfNepalDay(filters.fromInput),
    to: endOfNepalDay(filters.toInput),
    sort: filters.sort,
    direction: filters.direction,
  };
}

/**
 * Rebuilds the query string with one value changed.
 *
 * Sortable column headers are links, and a header that loses the status and
 * date filters when clicked is a header that throws away the admin's work. This
 * carries everything forward and overrides only what is passed.
 *
 * Empty values are dropped rather than written as `?status=`, so the URL stays
 * readable and "no filter" has exactly one spelling.
 */
export function inquiryHref(
  filters: InquiryFilters,
  overrides: Partial<{
    status: string;
    from: string;
    to: string;
    sort: string;
    dir: string;
  }> = {},
  basePath = '/admin/inquiries'
): string {
  const values: Record<string, string> = {
    status: filters.status ?? '',
    from: filters.fromInput,
    to: filters.toInput,
    sort: filters.sort,
    dir: filters.direction,
    ...overrides,
  };

  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) search.set(key, value);
  }

  // `createdAt` descending is the default the page renders with no query string
  // at all, so spelling it out adds noise to every link on the screen.
  if (search.get('sort') === 'createdAt' && search.get('dir') === 'desc') {
    search.delete('sort');
    search.delete('dir');
  }

  const query = search.toString();

  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Where a sortable column header points.
 *
 * Clicking the column already sorted flips the direction; clicking a different
 * one starts it at descending. Descending rather than ascending because every
 * column here is one where the interesting end is the top — the newest inquiry,
 * the largest group, the soonest date.
 */
export function sortHref(
  filters: InquiryFilters,
  field: BookingSortField
): string {
  const nextDirection =
    filters.sort === field && filters.direction === 'desc' ? 'asc' : 'desc';

  return inquiryHref(filters, { sort: field, dir: nextDirection });
}

/** What `aria-sort` should say on a column header. */
export function ariaSort(
  filters: InquiryFilters,
  field: BookingSortField
): 'ascending' | 'descending' | 'none' {
  if (filters.sort !== field) return 'none';

  return filters.direction === 'asc' ? 'ascending' : 'descending';
}
