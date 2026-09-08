import { TripDifficulty } from '../models/Trip';

/**
 * Filter and sort definitions for /trips.
 *
 * Pure data and pure functions, no server imports — this module is used by a
 * Client Component, so anything with a Mongoose or Cloudinary dependency would
 * end up in the browser bundle. `TripDifficulty` is a type-only import and is
 * erased at compile time.
 */

/** The trip fields the filters actually read. Serializable by construction. */
export interface TripFilterMeta {
  id: string;
  title: string;
  destinationSlug: string;
  /** null for India, Tibet and Bhutan — the asymmetry, in filter form. */
  activitySlug: string | null;
  durationDays: number;
  difficulty: TripDifficulty | null;
  price: number;
  featured: boolean;
  displayOrder: number;
}

export interface Bucket {
  key: string;
  label: string;
  min: number;
  max: number;
}

export const DURATION_BUCKETS: Bucket[] = [
  { key: 'under-7', label: 'Under 7 days', min: 0, max: 6 },
  { key: '7-12', label: '7–12 days', min: 7, max: 12 },
  { key: '13-18', label: '13–18 days', min: 13, max: 18 },
  { key: '19-plus', label: '19 days or more', min: 19, max: Number.MAX_SAFE_INTEGER },
];

export const PRICE_BUCKETS: Bucket[] = [
  { key: 'under-1000', label: 'Under $1,000', min: 0, max: 999 },
  { key: '1000-1500', label: '$1,000 – $1,500', min: 1000, max: 1500 },
  { key: 'over-1500', label: 'Over $1,500', min: 1501, max: Number.MAX_SAFE_INTEGER },
];

export const SORT_OPTIONS = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'price-asc', label: 'Price, low to high' },
  { key: 'price-desc', label: 'Price, high to low' },
  { key: 'duration-asc', label: 'Duration, short to long' },
  { key: 'duration-desc', label: 'Duration, long to short' },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]['key'];

export interface TripFilterState {
  destination: string | null;
  activity: string | null;
  duration: string | null;
  difficulty: string | null;
  price: string | null;
  sort: SortKey;
}

export const EMPTY_FILTERS: TripFilterState = {
  destination: null,
  activity: null,
  duration: null,
  difficulty: null,
  price: null,
  sort: 'recommended',
};

/** Which filters are narrowing the result set right now, `sort` excluded. */
export const FILTER_KEYS = [
  'destination',
  'activity',
  'duration',
  'difficulty',
  'price',
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];

export const FILTER_LABELS: Record<FilterKey, string> = {
  destination: 'destination',
  activity: 'activity',
  duration: 'duration',
  difficulty: 'grade',
  price: 'price',
};

export function activeFilterCount(filters: TripFilterState): number {
  return FILTER_KEYS.filter((key) => filters[key] !== null).length;
}

function inBucket(buckets: Bucket[], key: string | null, value: number): boolean {
  if (!key) return true;

  const bucket = buckets.find((b) => b.key === key);
  if (!bucket) return true;

  return value >= bucket.min && value <= bucket.max;
}

/** Does one trip survive the current filters? */
export function matches(trip: TripFilterMeta, filters: TripFilterState): boolean {
  if (filters.destination && trip.destinationSlug !== filters.destination) {
    return false;
  }

  // The activity filter only ever applies within a destination that has the
  // layer. It is not offered otherwise, and is ignored if it somehow arrives
  // in the URL — a stale link must not silently return nothing.
  if (filters.activity && trip.activitySlug !== filters.activity) return false;

  if (filters.difficulty && trip.difficulty !== filters.difficulty) return false;

  if (!inBucket(DURATION_BUCKETS, filters.duration, trip.durationDays)) {
    return false;
  }

  if (!inBucket(PRICE_BUCKETS, filters.price, trip.price)) return false;

  return true;
}

export function sortTrips(
  trips: TripFilterMeta[],
  sort: SortKey
): TripFilterMeta[] {
  const sorted = [...trips];

  switch (sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price);
    case 'duration-asc':
      return sorted.sort((a, b) => a.durationDays - b.durationDays);
    case 'duration-desc':
      return sorted.sort((a, b) => b.durationDays - a.durationDays);
    default:
      return sorted.sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          a.displayOrder - b.displayOrder ||
          a.title.localeCompare(b.title)
      );
  }
}

/**
 * The filter that is costing the most results.
 *
 * For each active filter, count what would match if that one alone were
 * dropped. The one that frees the most trips is the narrowest, and is what the
 * empty state offers to clear — more useful than "clear everything", which
 * throws away intent the visitor deliberately expressed.
 */
export function narrowestFilter(
  trips: TripFilterMeta[],
  filters: TripFilterState
): { key: FilterKey; wouldMatch: number } | null {
  const active = FILTER_KEYS.filter((key) => filters[key] !== null);
  if (active.length === 0) return null;

  let best: { key: FilterKey; wouldMatch: number } | null = null;

  for (const key of active) {
    const without = { ...filters, [key]: null };
    const wouldMatch = trips.filter((trip) => matches(trip, without)).length;

    if (!best || wouldMatch > best.wouldMatch) best = { key, wouldMatch };
  }

  return best && best.wouldMatch > 0 ? best : null;
}

/* ------------------------------------------------------------------ *
 * URL serialization
 *
 * Filter state lives in the query string so a filtered view is shareable and
 * the back button works. Only non-default values are written, so the
 * unfiltered page keeps a clean `/trips`.
 * ------------------------------------------------------------------ */

export function filtersToQuery(filters: TripFilterState): string {
  const params = new URLSearchParams();

  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }

  if (filters.sort !== 'recommended') params.set('sort', filters.sort);

  const query = params.toString();

  return query ? `?${query}` : '';
}

export function queryToFilters(search: string): TripFilterState {
  const params = new URLSearchParams(search);
  const sort = params.get('sort');

  return {
    destination: params.get('destination'),
    activity: params.get('activity'),
    duration: params.get('duration'),
    difficulty: params.get('difficulty'),
    price: params.get('price'),
    sort: SORT_OPTIONS.some((option) => option.key === sort)
      ? (sort as SortKey)
      : 'recommended',
  };
}
