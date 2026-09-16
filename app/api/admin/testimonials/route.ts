import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import Testimonial from '../../../../models/Testimonial';
import { adminTestimonialSchema } from '../../../../lib/validators/adminContent';
import { testimonialPaths, revalidateAll } from '../../../../lib/revalidation';
import { isOwnPublicId } from '../../../../lib/cloudinary';
import type { PublishStatus } from '../../../../models/shared/status';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/testimonials — create one.
 *
 * ## No separate create form, unlike trips
 *
 * A testimonial has no field that cannot exist before the record does. Its
 * photo is optional, so the `coverImage` deadlock that forced the trip create
 * screen — the signing endpoint deriving a public ID from a record that has to
 * exist first — does not arise. One form, one schema, two verbs.
 *
 * The photo is filed under the record's **id** rather than a slug, because
 * testimonials have no slug and a person's name is neither unique nor stable
 * enough to file images under. That means a photo added while creating is
 * uploaded against a temporary segment; the sign route's `newSlug` path covers
 * it, and the public ID always ends in eight random bytes so nothing collides.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an auth challenge confirms the route exists.
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

  const parsed = adminTestimonialSchema.safeParse(body);

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

  /*
   * The stored reference ends up interpolated into a Cloudinary URL on the
   * homepage, so it is checked to be one of ours rather than trusted because it
   * arrived from an admin session. An absolute URL is the shape an injected
   * value would take, and this rejects it.
   */
  if (data.photo && !isOwnPublicId(data.photo)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: {
          photo:
            'That is not a Cloudinary reference this site issued. Upload the photo rather than pasting a URL.',
        },
      },
      { status: 400 }
    );
  }

  await connectDB();

  const testimonial = new Testimonial({
    name: data.name,
    quote: data.quote,
    photo: data.photo,
    photoAlt: data.photoAlt,
    trip: data.trip ? new mongoose.Types.ObjectId(data.trip) : null,
    country: data.country,
    displayOrder: data.displayOrder,
    status: data.status as PublishStatus,
  });

  try {
    await testimonial.save();
  } catch (error) {
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

    console.error('[admin/testimonials] Create failed:', error);

    return NextResponse.json(
      { error: 'Could not create the testimonial. Nothing was saved.' },
      { status: 500 }
    );
  }

  /*
   * Only a published testimonial changes a public page. A draft appears
   * nowhere, so purging the homepage for one would be a rebuild that produces
   * an identical page.
   */
  const revalidated =
    testimonial.status === 'published'
      ? revalidateAll(await testimonialPaths({ trip: testimonial.trip }))
      : [];

  return NextResponse.json(
    { ok: true, id: String(testimonial._id), revalidated },
    { status: 201 }
  );
}
