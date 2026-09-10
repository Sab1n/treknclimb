import { NextResponse } from 'next/server';

import { requireAdmin } from '../../../../../lib/adminAuth';
import { getSubscribers } from '../../../../../lib/queries/newsletter';
import {
  SUBSCRIBER_STATUSES,
  type SubscriberStatus,
} from '../../../../../models/NewsletterSubscriber';

export const dynamic = 'force-dynamic';

/**
 * Escapes one CSV cell.
 *
 * Two separate problems, and it is easy to solve only the first:
 *
 * 1. **CSV quoting.** A value containing a comma, a quote or a newline has to
 *    be wrapped in quotes with inner quotes doubled, or it silently shifts
 *    every later column. `source` holds a URL path, which can contain both.
 *
 * 2. **Formula injection.** A cell starting with `=`, `+`, `-`, `@`, tab or
 *    carriage return is executed as a formula when the file is opened in Excel
 *    or Sheets — `=HYPERLINK(...)` in an email column is a phishing link that
 *    arrives inside a file the recipient trusts, and the values here come from
 *    a public form. Prefixing with an apostrophe neutralises it while leaving
 *    the value readable.
 */
function csvCell(value: string | null | undefined): string {
  if (value == null || value === '') return '';

  const dangerous = /^[=+\-@\t\r]/.test(value);
  const text = dangerous ? `'${value}` : value;

  return `"${text.replace(/"/g, '""')}"`;
}

function isoOrEmpty(value: Date | null | undefined): string {
  return value ? new Date(value).toISOString() : '';
}

/**
 * GET /api/admin/newsletter/export — the subscriber list as CSV.
 *
 * Guarded twice: `middleware.ts` matches `/api/admin/:path*`, and
 * `requireAdmin()` throws here regardless of what the matcher covers. This
 * endpoint hands over every subscriber address in one request, so a single
 * layer is not enough.
 *
 * **`confirmToken` is never included** — the query excludes it at the database
 * level. It is a live credential, and a CSV is the most-forwarded file format
 * there is.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — same reasoning as the middleware. An authorisation error
    // confirms the endpoint exists and is worth attacking.
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

  const rows = subscribers.map((subscriber) =>
    [
      csvCell(subscriber.email),
      csvCell(subscriber.status),
      csvCell(isoOrEmpty(subscriber.createdAt)),
      csvCell(isoOrEmpty(subscriber.confirmedAt)),
      csvCell(isoOrEmpty(subscriber.unsubscribedAt)),
      csvCell(isoOrEmpty(subscriber.syncedAt)),
      csvCell(subscriber.providerContactId),
      csvCell(subscriber.source),
    ].join(',')
  );

  // CRLF and a BOM: Excel on Windows misreads UTF-8 without the BOM, and this
  // file is going to be opened on a Windows machine in an office in Pokhara.
  const csv = `﻿${[header.join(','), ...rows].join('\r\n')}\r\n`;

  const filename = `newsletter-subscribers${status ? `-${status}` : ''}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      // Personal data: never cached by a proxy or the browser.
      'cache-control': 'no-store, private',
    },
  });
}
