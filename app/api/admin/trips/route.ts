import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import Trip from '../../../../models/Trip';
import { createTripSchema } from '../../../../lib/validators/createTrip';
import { isSlugTaken } from '../../../../lib/queries/adminTrips';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/trips — create a trip as a draft.
 *
 * ## How this differs from the Express equivalent
 *
 * This file is the *collection* route and `[id]/route.ts` is the *member*
 * route — what `app.post('/api/admin/trips')` and
 * `app.patch('/api/admin/trips/:id')` would have been on one router. There is
 * no router: the folder is the path, and the exported function name is the
 * method. `POST` here and `PATCH` there do not collide, and a `GET` to either
 * is a 405 with nothing written.
 *
 * ## Always a draft
 *
 * `status` is not accepted from the request at all — it is hard-coded below.
 * A trip created from seven fields is not ready to be live, and making the
 * create form able to publish would mean a single mis-click putting a page with
 * no description in front of customers. Publishing happens in the editor, where
 * the publish gate can check that the rest of the trip exists.
 *
 * ## No revalidatePath
 *
 * Deliberate, not an omission. A draft is excluded from every public query, the
 * listings and the sitemap, so there is no cached page anywhere that this
 * write makes stale. `revalidatePath` here would be five cache purges to
 * publish nothing.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an authorisation error confirms the endpoint exists and is
    // worth attacking. Same reasoning as every other admin route.
    return new NextResponse(null, { status: 404 });
  }

  /*
   * The session cookie is SameSite=Lax, which already blocks a cross-site form
   * post. This covers what Lax does not: it is a same-*site* policy, so a
   * subdomain that was ever compromised could otherwise drive this endpoint.
   */
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const parsed = createTripSchema.safeParse(body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }

    return NextResponse.json(
      { error: 'Some fields need checking.', fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  await connectDB();

  /*
   * Checked before the insert so a collision arrives as a field error rather
   * than as a MongoServerError with code 11000, which carries no field path and
   * cannot be attached to the slug input.
   *
   * The empty string is the "except this trip" argument, because there is no
   * trip yet — every existing slug counts as taken.
   *
   * This is a check, not a lock: two creates in the same instant both pass it.
   * The unique index is still what guarantees correctness, and the 11000 branch
   * below is the fallback.
   */
  if (await isSlugTaken(data.slug, '')) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another trip already uses this slug.' },
      },
      { status: 400 }
    );
  }

  const trip = new Trip({
    title: data.title,
    slug: data.slug,
    destination: new mongoose.Types.ObjectId(data.destination),
    /*
     * `null`, not `undefined`, when no activity is chosen. Null is a real value
     * meaning "this destination has no activity layer" — the model's
     * `pre('validate')` hook checks the pairing against the destination's
     * `hasActivities`, and it distinguishes the two.
     */
    activity: data.activity ? new mongoose.Types.ObjectId(data.activity) : null,
    startPoint: data.startPoint,
    endPoint: data.endPoint,
    durationDays: data.durationDays,
    price: data.price,
    // Never taken from the request. See the note above.
    status: 'draft',
  });

  try {
    /*
     * `new` + `save()`, not `Trip.create()` with a plain object — same
     * reasoning as the convention for updates. `save()` runs the document
     * middleware, and the Nepal/activity rule lives in `pre('validate')`.
     * (`create()` would in fact run it too, but keeping one spelling across
     * create and update means there is no second path to check when the rule
     * changes.)
     */
    await trip.save();
  } catch (error) {
    /*
     * Two shapes arrive here and both have to be handled.
     *
     * The document hook produces a ValidationError with a populated `.errors`
     * keyed by field path — the Nepal asymmetry failure is one of these, and it
     * maps straight onto a form field. A duplicate key is a MongoServerError
     * with neither, so code that only unwraps `err.errors` would show the admin
     * nothing at all.
     */
    if (error instanceof mongoose.Error.ValidationError) {
      const fieldErrors: Record<string, string> = {};

      for (const [path, detail] of Object.entries(error.errors)) {
        fieldErrors[path] = detail.message;
      }

      return NextResponse.json(
        { error: 'Some fields need checking.', fieldErrors },
        { status: 400 }
      );
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json(
        {
          error: 'Some fields need checking.',
          fieldErrors: { slug: 'Another trip already uses this slug.' },
        },
        { status: 400 }
      );
    }

    console.error('[admin/trips] Create failed:', error);

    return NextResponse.json(
      { error: 'Could not create the trip. Nothing was saved.' },
      { status: 500 }
    );
  }

  /*
   * The id is what the client needs — it navigates straight into the editor.
   * Returned rather than redirecting from here: a 3xx on a fetch is followed
   * transparently by the browser, so the caller would receive the editor's HTML
   * instead of a JSON id and have no idea where it ended up.
   */
  return NextResponse.json(
    { ok: true, id: String(trip._id), slug: trip.slug },
    { status: 201 }
  );
}
