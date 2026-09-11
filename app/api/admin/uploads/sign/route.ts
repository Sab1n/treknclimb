import { NextResponse } from 'next/server';

import { requireAdmin } from '../../../../../lib/adminAuth';
import { connectDB } from '../../../../../lib/db';
import Trip from '../../../../../models/Trip';
import { signUpload } from '../../../../../lib/cloudinary';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/uploads/sign — a one-shot signature for a direct upload.
 *
 * The browser asks for a signature, then POSTs the file straight to Cloudinary
 * with it. The file never touches this server, and `CLOUDINARY_API_SECRET`
 * never leaves it.
 *
 * ## The request says which trip, not which public ID
 *
 * The caller sends a trip id. The public ID is derived here, from that trip's
 * slug. Letting the browser name the destination and signing it would mean an
 * admin session could sign an upload to
 * `treknclimb/destinations/nepal` and overwrite the Nepal hero — a signed
 * endpoint that signs anything asked of it is an unsigned endpoint with extra
 * steps.
 *
 * ## Rate limiting
 *
 * Deliberately none. This is behind an admin session with a single operator,
 * and the expensive resource (Cloudinary storage) is already gated by that.
 * Adding a limiter here would mostly mean an admin uploading a twenty-image
 * gallery being told to wait.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — consistent with every other admin endpoint. An auth
    // challenge confirms the route exists and is worth probing.
    return new NextResponse(null, { status: 404 });
  }

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

  const tripId =
    typeof body === 'object' && body !== null
      ? (body as { tripId?: unknown }).tripId
      : undefined;

  if (typeof tripId !== 'string' || tripId === '') {
    return NextResponse.json({ error: 'Which trip is this for?' }, { status: 400 });
  }

  await connectDB();

  let trip;

  try {
    trip = await Trip.findById(tripId).select('slug').lean<{ slug: string }>().exec();
  } catch {
    // A malformed id throws a CastError rather than returning null.
    return new NextResponse(null, { status: 404 });
  }

  if (!trip) return new NextResponse(null, { status: 404 });

  const signature = signUpload(trip.slug);

  if (!signature) {
    /*
     * 503, not 500. Nothing is broken — the deployment has no Cloudinary
     * credentials — and the message says which ones, because the alternative is
     * an admin reporting "upload is broken" and someone reading logs to find
     * out that an environment variable was never set.
     */
    return NextResponse.json(
      {
        error:
          'Image upload is not configured. CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET all have to be set.',
      },
      { status: 503 }
    );
  }

  /*
   * The signature is returned, the secret is not. Everything here is safe in a
   * browser: `apiKey` is a public identifier by design, and the signature is
   * valid for one upload to one public ID for about an hour.
   */
  return NextResponse.json(signature, {
    // Never cached anywhere. A reused signature is a reused public ID.
    headers: { 'cache-control': 'no-store, private' },
  });
}
