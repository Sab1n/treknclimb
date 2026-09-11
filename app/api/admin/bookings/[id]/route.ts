import { NextResponse } from 'next/server';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import BookingRequest from '../../../../../models/BookingRequest';
import { adminBookingUpdateSchema } from '../../../../../lib/validators/adminBooking';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/bookings/[id] — status and internal notes.
 *
 * ## How this differs from the Express equivalent
 *
 * The dynamic segment comes from the folder name, not from a path pattern:
 * `app/api/admin/bookings/[id]/route.ts` is what `app.patch('/:id', ...)` would
 * have been. There is no `req.params` — the params arrive as the handler's
 * **second argument**, and in Next 15+ they are a `Promise` that has to be
 * awaited, because the framework may start rendering before the route is fully
 * resolved.
 *
 * The exported function name is the method. A GET to this URL is a 405 with no
 * code written, and there is no `router.use(requireAuth)` — the auth check is
 * the first line of the function, written out.
 *
 * ## CSRF
 *
 * The session cookie is `SameSite=Lax`, which already stops a cross-site form
 * from carrying it. The origin check below covers what Lax does not: it is a
 * same-site, not same-origin, policy, so a subdomain that was ever compromised
 * would otherwise be able to drive this. Cheap, and this endpoint writes.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — the same reasoning as the middleware. An authorisation
    // error confirms the endpoint exists and is worth attacking.
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const parsed = adminBookingUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid update.' },
      { status: 400 }
    );
  }

  await connectDB();

  /*
   * `findById` → assign → `save()`, per CLAUDE.md. Query middleware does not
   * run `pre('validate')`, so `findByIdAndUpdate` skips document hooks
   * entirely and `runValidators: true` only covers path validators.
   * BookingRequest has no validate hook today, but the convention is what stops
   * the next model that does from being updated through a path that ignores it.
   *
   * A malformed id throws a CastError rather than returning null, so the lookup
   * is wrapped — otherwise a hand-typed URL is a 500.
   */
  let booking;

  try {
    booking = await BookingRequest.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!booking) return new NextResponse(null, { status: 404 });

  if (parsed.data.status !== undefined && parsed.data.status !== booking.status) {
    booking.status = parsed.data.status;

    /*
     * The model documents this field as "null until the status first moves off
     * Pending", so it is set here rather than left for someone to notice later.
     * Guarded on an actual change: re-selecting the status already showing
     * should not look like staff did something.
     */
    booking.statusUpdatedAt = new Date();
  }

  if (parsed.data.internalNotes !== undefined) {
    booking.internalNotes = parsed.data.internalNotes;
  }

  await booking.save();

  /*
   * No `revalidatePath()`. Nothing public renders an inquiry, and every admin
   * screen is `force-dynamic` — there is no cached page for this write to
   * invalidate. Content mutations will need it; this one genuinely does not.
   */
  return NextResponse.json({
    ok: true,
    status: booking.status,
    statusUpdatedAt: booking.statusUpdatedAt,
  });
}
