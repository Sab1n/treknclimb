import { NextResponse } from 'next/server';

import { requireAdmin } from '../../../../../lib/adminAuth';
import { getBookingRequests } from '../../../../../lib/queries/bookings';
import { parseInquiryFilters, toListOptions } from '../../../../../lib/adminFilters';
import { csvCell, csvDate, csvDocument, csvHeaders } from '../../../../../lib/csv';
import { CONSENT_STATEMENT_SINCE } from '../../../../../lib/consent';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/bookings/export — the filtered inquiry list as CSV.
 *
 * The filters are parsed with the same function the screen uses, so the file
 * always contains exactly the rows that were visible when the button was
 * pressed. That is the whole reason `parseInquiryFilters` is not written twice.
 *
 * This hands over every customer's name, email, phone and message in one
 * request. `requireAdmin()` runs here regardless of what the middleware matcher
 * covers — a single layer in front of a file like this is not enough.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = parseInquiryFilters(params);

  const bookings = await getBookingRequests(toListOptions(filters));

  const header = [
    'reference',
    'submitted_at',
    'name',
    'email',
    'phone',
    'nationality',
    'trip',
    'travellers',
    'preferred_date',
    'preferred_channel',
    'message',
    'status',
    'status_updated_at',
    'source_page',
    'consented_at',
    'consent_statement_version',
    'internal_notes',
  ];

  const rows = bookings.map((booking) => [
    csvCell(booking.reference),
    csvCell(csvDate(booking.createdAt)),
    csvCell(booking.name),
    csvCell(booking.email),
    csvCell(booking.phone),
    csvCell(booking.nationality),
    // Null for a general inquiry that names no trip — a real case, not a gap.
    csvCell(booking.trip?.title),
    csvCell(booking.travellers),
    csvCell(csvDate(booking.preferredDate)),
    csvCell(booking.preferredChannel),
    csvCell(booking.message),
    csvCell(booking.status),
    csvCell(csvDate(booking.statusUpdatedAt)),
    csvCell(booking.sourcePage),
    csvCell(csvDate(booking.consentedAt)),
    /*
     * The consent wording is versioned by the date it took effect, not stored
     * per row. An export that carries the timestamp without the version is an
     * export that records when someone agreed and not what to — which is the
     * half that matters if it is ever produced as evidence.
     *
     * This is the *current* version for every row. It is honest only while
     * there has been one wording, which is why `lib/consent.ts` says to turn
     * that constant into a dated list the first time it changes. Until then a
     * column that reads the same on every line is exactly right.
     */
    csvCell(CONSENT_STATEMENT_SINCE),
    csvCell(booking.internalNotes),
  ]);

  const csv = csvDocument(header, rows);

  const filename = `booking-inquiries${
    filters.status ? `-${filters.status.toLowerCase()}` : ''
  }-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: csvHeaders(filename),
  });
}
