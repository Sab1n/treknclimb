import { NextResponse } from 'next/server';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import ExchangeRate from '../../../../../models/ExchangeRate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/rates/refresh — record that the active rates were checked.
 *
 * ## Why this is not "fetch from the provider"
 *
 * There is no exchange rate provider. CLAUDE.md lists the choice as an open
 * item, `EXCHANGE_RATE_API_KEY` is in the environment list but nothing reads
 * it, and no client exists. A button labelled "Refresh from API" would be a
 * claim the system cannot keep — and the failure mode is the worst kind: the
 * admin presses it, the timestamps move, the warning clears, and the rates are
 * exactly as wrong as they were.
 *
 * What an admin actually needs on the day they check the rates against their
 * bank and find them still correct is a way to say so. That is this: it moves
 * `lastUpdated` on the active rows and changes no number.
 *
 * **It is therefore an assertion by a person, not a measurement**, which is why
 * the screen labels it "I have checked these" rather than "Refresh". When a
 * provider is chosen, the honest upgrade is a second endpoint that fetches and
 * writes real numbers, and this one stays for the manual case.
 *
 * ## No revalidation
 *
 * Nothing a visitor can see has changed — the rates are identical. Purging the
 * whole priced catalogue to rewrite an admin-only timestamp would be a full
 * site regeneration for no visible difference.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an auth challenge confirms the endpoint exists.
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  await connectDB();

  try {
    /*
     * Active rows only. A deactivated currency is shown to nobody, so marking
     * it checked would be recording a check that had no reason to happen.
     *
     * `updateMany` rather than the usual findById → save(): this touches one
     * date field on every row, `ExchangeRate` has no validate hook for query
     * middleware to skip, and the alternative is a round trip per currency to
     * write a timestamp. The same exception, and the same reasoning, as the FAQ
     * reorder route.
     */
    const result = await ExchangeRate.updateMany(
      { isActive: true },
      { $set: { lastUpdated: new Date() } }
    );

    return NextResponse.json({ ok: true, marked: result.modifiedCount });
  } catch (error) {
    console.error('[admin/rates/refresh] Failed:', error);

    return NextResponse.json(
      { error: 'Could not update the timestamps.' },
      { status: 500 }
    );
  }
}
