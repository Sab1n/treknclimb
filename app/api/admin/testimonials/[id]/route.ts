import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import Testimonial from '../../../../../models/Testimonial';
import { adminTestimonialSchema } from '../../../../../lib/validators/adminContent';
import { testimonialPaths, revalidateAll } from '../../../../../lib/revalidation';
import { isOwnPublicId } from '../../../../../lib/cloudinary';
import type { PublishStatus } from '../../../../../models/shared/status';

export const dynamic = 'force-dynamic';

/**
 * PATCH and DELETE for one testimonial.
 *
 * Both live here because both address a single record — the split Express would
 * write as `router.route('/:id')` against `router.route('/')` next door. In the
 * App Router the folder is the path and the exported function name is the
 * method, so there is no router to register and no ordering to get wrong.
 */

/** Shared by both methods. Returns a response on failure, null on success. */
async function guard(request: Request): Promise<NextResponse | null> {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  // SameSite=Lax already blocks a cross-site form post; this covers what it
  // does not, since Lax is a same-*site* rather than same-origin policy.
  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

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

  // `findById` → assign → `save()`, per CLAUDE.md. `findByIdAndUpdate` skips
  // `pre('validate')`, and `photoAlt`'s conditional requirement lives there.
  let testimonial;

  try {
    testimonial = await Testimonial.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!testimonial) return new NextResponse(null, { status: 404 });

  /*
   * The pages this testimonial affects *before* the edit, read before anything
   * is assigned. Moving it from one trip to another, or unpublishing it, leaves
   * the page it has just left still serving it from cache — and that page's
   * path is no longer derivable from the record once the new values are on it.
   */
  const previousPaths =
    testimonial.status === 'published'
      ? await testimonialPaths({ trip: testimonial.trip })
      : [];

  testimonial.name = data.name;
  testimonial.quote = data.quote;
  testimonial.photo = data.photo;
  testimonial.photoAlt = data.photoAlt;
  testimonial.trip = data.trip ? new mongoose.Types.ObjectId(data.trip) : null;
  testimonial.country = data.country;
  testimonial.displayOrder = data.displayOrder;
  testimonial.status = data.status as PublishStatus;

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

    console.error('[admin/testimonials] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save. Nothing was changed.' },
      { status: 500 }
    );
  }

  const currentPaths =
    testimonial.status === 'published'
      ? await testimonialPaths({ trip: testimonial.trip })
      : [];

  /*
   * Both sets. `revalidateAll` de-duplicates, so the common case — an edit that
   * changes neither the trip nor the status — purges the homepage once rather
   * than twice.
   */
  return NextResponse.json({
    ok: true,
    updatedAt: testimonial.updatedAt,
    revalidated: revalidateAll([...previousPaths, ...currentPaths]),
  });
}

/**
 * DELETE /api/admin/testimonials/[id]
 *
 * No guard, unlike an activity. Nothing references a testimonial — it is a leaf
 * — so deleting one cannot leave another record pointing at nothing. `archived`
 * exists for the case where the quote should stop showing but the record should
 * survive; delete is for a duplicate or something entered by mistake.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

  await connectDB();

  let testimonial;

  try {
    testimonial = await Testimonial.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!testimonial) return new NextResponse(null, { status: 404 });

  // Read before the delete: afterwards there is no record to derive them from.
  const paths =
    testimonial.status === 'published'
      ? await testimonialPaths({ trip: testimonial.trip })
      : [];

  await testimonial.deleteOne();

  return NextResponse.json({ ok: true, revalidated: revalidateAll(paths) });
}
