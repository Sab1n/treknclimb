import { connectDB } from '../db';
import Trip from '../../models/Trip';
import BookingRequest from '../../models/BookingRequest';
import ExchangeRate, { IExchangeRate } from '../../models/ExchangeRate';

/**
 * The dashboard's numbers, gathered in one place.
 *
 * These are operational counts — how much content exists, what has come in this
 * week — and nothing more. **No pageviews, sessions or funnel data**: CLAUDE.md
 * puts conversion analytics in GA4 and rules out a MongoDB collection for them,
 * so "new inquiries this week" here is a count of documents, never a conversion
 * rate.
 */

export interface DashboardStats {
  trips: { total: number; published: number; draft: number; archived: number };
  inquiriesThisWeek: number;
  pendingInquiries: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await connectDB();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  /*
   * One aggregation for the trip counts rather than four `countDocuments`
   * calls. Each of those is a separate round trip to Atlas in Mumbai, and this
   * page is `force-dynamic` — it pays that cost on every single load.
   */
  const [tripRows, inquiriesThisWeek, pendingInquiries] = await Promise.all([
    Trip.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    BookingRequest.countDocuments({ createdAt: { $gte: weekAgo } }),
    BookingRequest.countDocuments({ status: 'Pending' }),
  ]);

  const byStatus = new Map(tripRows.map((row) => [row._id, row.count]));

  return {
    trips: {
      total: [...byStatus.values()].reduce((sum, n) => sum + n, 0),
      published: byStatus.get('published') ?? 0,
      draft: byStatus.get('draft') ?? 0,
      archived: byStatus.get('archived') ?? 0,
    },
    inquiriesThisWeek,
    pendingInquiries,
  };
}

export const RATE_STALE_AFTER_DAYS = 7;

export interface StaleRatesReport {
  /** Active rates whose `lastUpdated` is older than the threshold. */
  stale: IExchangeRate[];
  /** True when there are active rates and none of them are stale. */
  checked: boolean;
}

/**
 * Which display-currency rates have gone stale.
 *
 * Reads `lastUpdated`, **not `updatedAt`**. They are separate fields on purpose:
 * `updatedAt` moves whenever anything on the document is touched, so an admin
 * flipping `isActive` would reset it and make a three-month-old rate look fresh.
 * `lastUpdated` means "when the rate itself was refreshed", which is the only
 * thing this warning is about.
 *
 * Only active rates are checked. A deactivated currency is not being shown to
 * anybody, so its age is not a problem to nag about.
 */
export async function getStaleExchangeRates(): Promise<StaleRatesReport> {
  await connectDB();

  const cutoff = new Date(
    Date.now() - RATE_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
  );

  const [stale, activeCount] = await Promise.all([
    ExchangeRate.find({ isActive: true, lastUpdated: { $lt: cutoff } })
      .sort({ lastUpdated: 1 })
      .lean<IExchangeRate[]>()
      .exec(),
    ExchangeRate.countDocuments({ isActive: true }),
  ]);

  return { stale, checked: activeCount > 0 };
}
