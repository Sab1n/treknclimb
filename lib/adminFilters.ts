import {
  BOOKING_STATUSES,
  type BookingStatus,
} from '../models/BookingRequest';
import {
  BOOKING_SORT_FIELDS,
  type BookingSortField,
  type BookingListOptions,
} from './queries/bookings';
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

  return {
    status,
    // Only echoed back if they parse. A junk `?from=` would otherwise render
    // into the date input, where the browser silently discards it and the admin
    // sees an empty box next to a filtered table.
    fromInput: startOfNepalDay(params.from) ? params.from! : '',
    toInput: endOfNepalDay(params.to) ? params.to! : '',
    sort,
    direction: params.dir === 'asc' ? 'asc' : 'desc',
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
