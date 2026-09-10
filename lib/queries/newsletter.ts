import { connectDB } from '../db';
import NewsletterSubscriber, {
  INewsletterSubscriber,
  SubscriberStatus,
} from '../../models/NewsletterSubscriber';

/**
 * Newsletter reads, for the admin screen only.
 *
 * Nothing public reads this collection. The signup endpoint deliberately
 * returns the same response whether or not an address exists, so exposing any
 * of this to an unauthenticated caller would undo that in one step.
 */

export interface SubscriberCounts {
  total: number;
  pending: number;
  confirmed: number;
  unsubscribed: number;
  /** Confirmed but never successfully pushed to the marketing provider. */
  awaitingSync: number;
}

/**
 * Counts by status, in one aggregation.
 *
 * **These are "added via this site", not "current subscribers."** The provider
 * owns unsubscribes and does not tell us about them, so `confirmed` here is a
 * high-water mark rather than a live figure. The admin screen labels it that
 * way; this comment exists so the next caller does not quietly relabel it.
 */
export async function getSubscriberCounts(): Promise<SubscriberCounts> {
  await connectDB();

  const [byStatus, awaitingSync] = await Promise.all([
    NewsletterSubscriber.aggregate<{ _id: SubscriberStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    NewsletterSubscriber.countDocuments({
      status: 'confirmed',
      syncedAt: null,
    }),
  ]);

  const counts = new Map(byStatus.map((row) => [row._id, row.count]));

  return {
    total: [...counts.values()].reduce((sum, n) => sum + n, 0),
    pending: counts.get('pending') ?? 0,
    confirmed: counts.get('confirmed') ?? 0,
    unsubscribed: counts.get('unsubscribed') ?? 0,
    awaitingSync,
  };
}

/** Subscribers, newest first, optionally filtered by status. */
export async function getSubscribers(
  options: { status?: SubscriberStatus; limit?: number } = {}
): Promise<INewsletterSubscriber[]> {
  await connectDB();

  const filter = options.status ? { status: options.status } : {};

  const query = NewsletterSubscriber.find(filter).sort({ createdAt: -1 });

  if (options.limit) query.limit(options.limit);

  /*
   * `confirmToken` is excluded rather than merely unused. It is a live
   * credential — anyone holding it can confirm that address — and it has no
   * business travelling to a rendered page or a CSV. Excluding it here means
   * no admin view can leak it by accident.
   */
  return query
    .select('-confirmToken')
    .lean<INewsletterSubscriber[]>()
    .exec();
}
