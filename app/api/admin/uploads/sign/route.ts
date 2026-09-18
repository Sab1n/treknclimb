import { NextResponse } from 'next/server';
import type { Model } from 'mongoose';

import { requireAdmin } from '../../../../../lib/adminAuth';
import { connectDB } from '../../../../../lib/db';
import Trip from '../../../../../models/Trip';
import Activity from '../../../../../models/Activity';
import Destination from '../../../../../models/Destination';
import Testimonial from '../../../../../models/Testimonial';
import TeamMember from '../../../../../models/TeamMember';
import BlogPost from '../../../../../models/BlogPost';
import {
  signUpload,
  isUploadCollection,
  type UploadCollection,
} from '../../../../../lib/cloudinary';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/uploads/sign — a one-shot signature for a direct upload.
 *
 * The browser asks for a signature, then POSTs the file straight to Cloudinary
 * with it. The file never touches this server, and `CLOUDINARY_API_SECRET`
 * never leaves it.
 *
 * ## The request says which record, not which public ID
 *
 * The caller sends a collection and an id. The public ID is derived here, from
 * that record's slug — or its id where the collection has no slug. Letting the
 * browser name the destination and signing it would mean an admin session could
 * sign an upload over `treknclimb/destinations/nepal` and overwrite the Nepal
 * hero: a signed endpoint that signs anything asked of it is an unsigned
 * endpoint with extra steps.
 *
 * The collection is checked against a closed list rather than used as given,
 * because it becomes a folder in the path.
 *
 * ## `newSlug` — uploading for a record that does not exist yet
 *
 * An activity's cover image is required, and an activity has no draft state to
 * postpone it to, so the create form has to upload before the record is saved.
 * `newSlug` covers that case: no lookup, the segment comes from the form.
 *
 * **That is safe, and it is worth being explicit about why**, because it looks
 * like the hole the previous paragraph closes. The danger was never a
 * caller-chosen *folder* — it was a caller-chosen *complete public ID*, which
 * could name an existing asset and replace it. Here the collection still comes
 * from the closed list, the segment is sanitised, and `imagePublicId` always
 * appends eight random bytes. There is no value of `newSlug` that produces the
 * public ID of an existing image, so nothing can be overwritten — and
 * `overwrite: false` in the signature means an improbable collision fails
 * loudly rather than replacing anything.
 *
 * The `id` form is still preferred wherever a record exists: it files the image
 * under the record's real slug rather than whatever is currently typed in the
 * form.
 *
 * ## Rate limiting
 *
 * Deliberately none. This is behind an admin session with a single operator,
 * and the expensive resource — Cloudinary storage — is already gated by that.
 * A limiter here would mostly mean an admin uploading a twenty-image gallery
 * being told to wait.
 */

/*
 * `Model<any>` rather than a union of the four model types. Each has a
 * different document interface, and the only thing this map is used for is
 * `findById().select('slug')` — a lookup that is identical across all of them.
 * Threading four generics through for that would be ceremony, so the narrowing
 * happens at the one field actually read, below.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODELS: Record<UploadCollection, Model<any>> = {
  trips: Trip,
  activities: Activity,
  destinations: Destination,
  testimonials: Testimonial,
  team: TeamMember,
  blog: BlogPost,
};

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

  const payload = (body ?? {}) as {
    collection?: unknown;
    id?: unknown;
    newSlug?: unknown;
  };

  if (
    typeof payload.collection !== 'string' ||
    !isUploadCollection(payload.collection)
  ) {
    return NextResponse.json(
      { error: 'Unknown collection.' },
      { status: 400 }
    );
  }

  const collection = payload.collection;

  let segment: string;

  if (typeof payload.newSlug === 'string' && payload.newSlug.trim() !== '') {
    // A record that does not exist yet. No lookup — see the note above for why
    // a caller-supplied segment cannot overwrite anything.
    segment = payload.newSlug;
  } else {
    if (typeof payload.id !== 'string' || payload.id === '') {
      return NextResponse.json(
        { error: 'Which record is this for?' },
        { status: 400 }
      );
    }

    await connectDB();

    let record: { _id: unknown; slug?: string } | null;

    try {
      record = await MODELS[collection]
        .findById(payload.id)
        .select('slug')
        .lean<{ _id: unknown; slug?: string }>()
        .exec();
    } catch {
      // A malformed id throws a CastError rather than returning null.
      return new NextResponse(null, { status: 404 });
    }

    if (!record) return new NextResponse(null, { status: 404 });

    /*
     * The slug where the collection has one, the id where it does not.
     * Testimonials are the second case: a person's name is neither unique nor
     * stable enough to file images under, and the id is both.
     */
    segment = record.slug ?? String(record._id);
  }

  const signature = signUpload(collection, segment);

  if (!signature) {
    /*
     * 503, not 500. Nothing is broken — the deployment has no Cloudinary
     * credentials — and the message names which ones, because the alternative
     * is an admin reporting "upload is broken" and someone reading logs to find
     * out an environment variable was never set.
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
