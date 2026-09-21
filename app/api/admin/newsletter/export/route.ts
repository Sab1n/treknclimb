import { NextResponse } from 'next/server';

import { requireAdmin } from '../../../../../lib/adminAuth';
import { getSubscribers } from '../../../../../lib/queries/newsletter';
import { csvCell, csvDate, csvDocument, csvHeaders } from '../../../../../lib/csv';
import {
  SUBSCRIBER_STATUSES,
  type SubscriberStatus,
} from '../../../../../models/NewsletterSubscriber';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/newsletter/export — the subscriber list as CSV.
 *
 * Guarded twice: `proxy.ts` matches `/api/admin/:path*`, and
 * `requireAdmin()` throws here regardless of what the matcher covers. This
 * endpoint hands over every subscriber address in one request, so a single
 * layer is not enough.
 *
 * **`confirmToken` is never included** — the query excludes it at the database
 * level. It is a live credential, and a CSV is the most-forwarded file format
 * there is.
 *
 * The escaping lives in `lib/csv.ts` now that the inquiry export needs it too.
 * It handles both CSV quoting and spreadsheet formula injection; a
 * security-relevant escape function kept in two copies is one that eventually
 * gets fixed in only one of them.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    /*
     * 404, not 403 — same reasoning as the middleware. An authorisation error
     * confirms the endpoint exists and is worth attacking.
     *
     * This runs even though middleware already guards /api/admin, because
     * middleware can only check the token signature: it runs on the edge and
     * cannot read tokenVersion from the database. A revoked session passes
     * there and is stopped here.
     */
    return new NextResponse(null, { status: 404 });
  }

  const statusParam = new URL(request.url).searchParams.get('status');

  const status = (SUBSCRIBER_STATUSES as readonly string[]).includes(
    statusParam ?? ''
  )
    ? (statusParam as SubscriberStatus)
    : undefined;

  const subscribers = await getSubscribers({ status });

  const header = [
    'email',
    'status',
    'signed_up_at',
    'confirmed_at',
    'unsubscribed_at',
    'synced_at',
    'provider_contact_id',
    'source',
  ];

  const rows = subscribers.map((subscriber) => [
    csvCell(subscriber.email),
    csvCell(subscriber.status),
    csvCell(csvDate(subscriber.createdAt)),
    csvCell(csvDate(subscriber.confirmedAt)),
    csvCell(csvDate(subscriber.unsubscribedAt)),
    csvCell(csvDate(subscriber.syncedAt)),
    csvCell(subscriber.providerContactId),
    csvCell(subscriber.source),
  ]);

  const filename = `newsletter-subscribers${status ? `-${status}` : ''}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return new NextResponse(csvDocument(header, rows), {
    status: 200,
    headers: csvHeaders(filename),
  });
}
