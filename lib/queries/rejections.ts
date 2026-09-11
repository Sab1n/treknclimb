import { connectDB } from '../db';
import RejectedSubmission, {
  IRejectedSubmission,
  RejectionReason,
} from '../../models/RejectedSubmission';

/**
 * Reads over the discarded-submission log.
 *
 * This collection exists so that "I submitted and heard nothing" is a query
 * rather than a guess, and until now nothing surfaced it — a log nobody can
 * read is a log that does not exist. These back the read-only admin view.
 *
 * **Everything here self-purges after 30 days** via the TTL index on
 * `createdAt`. An empty result therefore means one of two different things —
 * nothing was rejected, or it was rejected more than a month ago — and the
 * screen has to say so, because those lead to opposite conclusions.
 */

export interface RejectionListOptions {
  reason?: RejectionReason;
  limit?: number;
}

export async function getRejectedSubmissions(
  options: RejectionListOptions = {}
): Promise<IRejectedSubmission[]> {
  await connectDB();

  const filter = options.reason ? { reason: options.reason } : {};

  const query = RejectedSubmission.find(filter).sort({ createdAt: -1 });

  if (options.limit) query.limit(options.limit);

  return query.lean<IRejectedSubmission[]>().exec();
}

export interface RejectionCounts {
  total: number;
  byReason: Record<string, number>;
  /** The oldest row still in the window, or null. */
  oldest: Date | null;
}

/**
 * Counts by reason, and how far back the log actually reaches.
 *
 * `oldest` is the honest part. It is the difference between "nothing has been
 * rejected in 30 days" and "the log starts an hour ago because the TTL just
 * swept it", and the screen shows it for that reason.
 */
export async function getRejectionCounts(): Promise<RejectionCounts> {
  await connectDB();

  const [rows, oldest] = await Promise.all([
    RejectedSubmission.aggregate<{ _id: RejectionReason; count: number }>([
      { $group: { _id: '$reason', count: { $sum: 1 } } },
    ]),
    RejectedSubmission.findOne()
      .sort({ createdAt: 1 })
      .select('createdAt')
      .lean<Pick<IRejectedSubmission, 'createdAt'>>()
      .exec(),
  ]);

  const byReason: Record<string, number> = {};
  let total = 0;

  for (const row of rows) {
    byReason[row._id] = row.count;
    total += row.count;
  }

  return { total, byReason, oldest: oldest?.createdAt ?? null };
}

/**
 * Rejections recorded in the last seven days, for the dashboard.
 *
 * A number that is normally small and occasionally is not. A spike means either
 * a bot found the form or a spam check started catching real people, and the
 * second one costs inquiries — which is the entire reason this log is kept.
 */
export async function countRecentRejections(days = 7): Promise<number> {
  await connectDB();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return RejectedSubmission.countDocuments({ createdAt: { $gte: since } });
}
