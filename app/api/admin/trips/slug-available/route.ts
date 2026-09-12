import { NextResponse } from 'next/server';

import { requireAdmin } from '../../../../../lib/adminAuth';
import { isSlugTaken } from '../../../../../lib/queries/adminTrips';
import { tripSlugSchema } from '../../../../../lib/validators/createTrip';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/trips/slug-available?slug=…&exceptId=…
 *
 * Answers "is this slug free?" while the admin is still typing, so a collision
 * is a note under the field rather than a rejected submit. The shape and
 * reserved-list checks run in the browser already — they are pure functions
 * with no database behind them — so this endpoint exists for the one question
 * only the server can answer.
 *
 * ## This is a convenience, not the guarantee
 *
 * Two people typing the same slug at the same moment both get "available". The
 * unique index on `Trip.slug` is what actually prevents the collision, and the
 * create and save routes both handle the resulting 11000. Nothing here is
 * load-bearing; it exists so the common case does not cost a failed submit.
 *
 * ## Why it is a *static* segment under a dynamic sibling
 *
 * `slug-available` sits beside `[id]`, and Next resolves static segments first
 * — the same arrangement as `/blog/category` beside `/blog/[slug]`. It is safe
 * here for a reason that does not hold generally: `[id]` matches a MongoDB
 * ObjectId, which is 24 hex characters, and `slug-available` is not one. No
 * real id can ever be shadowed by this route.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const raw = params.get('slug') ?? '';

  /*
   * Parsed through the same schema the form and the create route use, so this
   * cannot develop its own opinion about what a valid slug is. An invalid one
   * is reported as unavailable with the reason, which is more useful than a
   * 400 the field has to translate.
   */
  const parsed = tripSlugSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { available: false, reason: parsed.error.issues[0]?.message ?? 'Invalid slug.' },
      { headers: { 'cache-control': 'no-store' } }
    );
  }

  /*
   * `exceptId` lets the editor use this too: a trip's own slug is not "taken"
   * as far as that trip is concerned. Empty for a create, where every existing
   * slug counts.
   */
  const exceptId = params.get('exceptId') ?? '';

  const taken = await isSlugTaken(parsed.data, exceptId);

  return NextResponse.json(
    {
      available: !taken,
      reason: taken ? 'Another trip already uses this slug.' : null,
      // Echoed back so a slow response arriving after further typing can be
      // discarded rather than shown against a slug the admin has moved on from.
      slug: parsed.data,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
