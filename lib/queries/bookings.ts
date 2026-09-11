import { connectDB } from '../db';
import BookingRequest, {
  IBookingRequestPopulated,
  BookingStatus,
} from '../../models/BookingRequest';

/*
 * Side-effect import, same reason as `lib/queries/trips.ts`: `.populate('trip')`
 * resolves the ref by model *name* at query time, and a model only registers
 * with Mongoose when its module is first imported. Without this line the
 * populate throws MissingSchemaError on whichever render happened not to import
 * Trip some other way — at build, never in the editor.
 */
import '../../models/Trip';

/**
 * Booking inquiry reads, for the admin only.
 *
 * Nothing public reads this collection. Every helper here returns a customer's
 * name, email, phone and message, so the guard is not "this route is under
 * /admin" — it is that each caller has already run `getAdminSession()`.
 *
 * These populate `trip` but deliberately do **not** populate through to
 * destination and activity. The admin list needs the trip's title, which is on
 * the trip document; a URL would need two more joins per row on a screen that
 * renders fifty of them.
 */

/** Which column the inquiry table is sorted by. */
export const BOOKING_SORT_FIELDS = [
  'createdAt',
  'name',
  'nationality',
  'travellers',
  'preferredDate',
  'status',
] as const;

export type BookingSortField = (typeof BOOKING_SORT_FIELDS)[number];

export interface BookingListOptions {
  status?: BookingStatus;
  /** Inclusive lower bound on `createdAt`. */
  from?: Date;
  /** Inclusive upper bound on `createdAt`. */
  to?: Date;
  sort?: BookingSortField;
  direction?: 'asc' | 'desc';
  limit?: number;
}

/**
 * Builds the Mongo filter once, so the list, the count and the CSV export can
 * never disagree about what "the current view" means.
 *
 * The date bounds are assembled as a single `createdAt` object rather than two
 * — `{ createdAt: { $gte } }` followed by `{ createdAt: { $lte } }` in an object
 * literal would silently keep only the second.
 */
function buildFilter(options: BookingListOptions): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (options.status) filter.status = options.status;

  if (options.from || options.to) {
    const range: Record<string, Date> = {};
    if (options.from) range.$gte = options.from;
    if (options.to) range.$lte = options.to;
    filter.createdAt = range;
  }

  return filter;
}

export async function getBookingRequests(
  options: BookingListOptions = {}
): Promise<IBookingRequestPopulated[]> {
  await connectDB();

  const sortField = options.sort ?? 'createdAt';
  const sortDirection = options.direction === 'asc' ? 1 : -1;

  /*
   * `createdAt` is the tiebreaker on every other sort. Without it, two
   * inquiries with the same status come back in whatever order the index
   * happened to produce, which changes between page loads and makes the table
   * look like it is shuffling itself.
   */
  const sort: Record<string, 1 | -1> =
    sortField === 'createdAt'
      ? { createdAt: sortDirection }
      : { [sortField]: sortDirection, createdAt: -1 };

  const query = BookingRequest.find(buildFilter(options))
    .sort(sort)
    .populate('trip', 'title slug');

  if (options.limit) query.limit(options.limit);

  return query.lean<IBookingRequestPopulated[]>().exec();
}

/** How many inquiries match a filter, for the "showing N" line. */
export async function countBookingRequests(
  options: BookingListOptions = {}
): Promise<number> {
  await connectDB();

  return BookingRequest.countDocuments(buildFilter(options));
}

/**
 * One inquiry, or `null`.
 *
 * Takes the id as a string from the route params and does not validate its
 * shape first — `findById` with a malformed id throws a CastError rather than
 * returning null, so the caller gets an unhandled 500 for a URL anybody can
 * type. The try/catch turns that into the same "not found" a real missing
 * record produces.
 */
export async function getBookingRequestById(
  id: string
): Promise<IBookingRequestPopulated | null> {
  await connectDB();

  try {
    return await BookingRequest.findById(id)
      .populate('trip', 'title slug')
      .lean<IBookingRequestPopulated>()
      .exec();
  } catch {
    return null;
  }
}

/** Counts per status, plus the total, in one aggregation. */
export async function getBookingStatusCounts(): Promise<
  Record<BookingStatus, number> & { total: number }
> {
  await connectDB();

  const rows = await BookingRequest.aggregate<{
    _id: BookingStatus;
    count: number;
  }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

  const counts = new Map(rows.map((row) => [row._id, row.count]));

  return {
    Pending: counts.get('Pending') ?? 0,
    Contacted: counts.get('Contacted') ?? 0,
    Confirmed: counts.get('Confirmed') ?? 0,
    Closed: counts.get('Closed') ?? 0,
    total: [...counts.values()].reduce((sum, n) => sum + n, 0),
  };
}
