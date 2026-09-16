import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import Faq from '../../../../../models/Faq';
import { adminFaqSchema } from '../../../../../lib/validators/adminContent';
import { faqPaths, revalidateAll } from '../../../../../lib/revalidation';
import type { PublishStatus } from '../../../../../models/shared/status';

export const dynamic = 'force-dynamic';

/**
 * PATCH and DELETE for one FAQ.
 *
 * ## The revalidation here is the fiddly one on this screen
 *
 * A FAQ renders wherever its association points, and the association is
 * editable. So the set of stale pages after a save is **not** derivable from
 * the saved record alone — the page it just left is stale too, and after the
 * assignment there is nothing on the document that names it.
 *
 * Four things can change where it appears, and all four go wrong the same way
 * if only the new location is purged:
 *
 * - moved from one trip to another — the old trip page keeps showing it
 * - moved from a trip to sitewide — the trip page keeps showing it
 * - published — nothing was purged before, so the page never picks it up
 * - unpublished or archived — the page keeps showing it, which is the worst of
 *   the four, because the point of unpublishing is that it stops being visible
 *
 * The last one is why the old set is computed from the *old* status rather than
 * skipped when the new status is not `published`. An entry going from published
 * to draft has an empty new set and a non-empty old one, and it is precisely
 * then that a purge is needed.
 */

async function guard(request: Request): Promise<NextResponse | null> {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

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

  const parsed = adminFaqSchema.safeParse(body);

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

  let faq;

  try {
    faq = await Faq.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!faq) return new NextResponse(null, { status: 404 });

  // Read before assigning — see the note above.
  const previousPaths =
    faq.status === 'published'
      ? await faqPaths({ destination: faq.destination })
      : [];

  faq.question = data.question;
  faq.answer = data.answer;
  faq.category = data.category;
  faq.destination = data.destination
    ? new mongoose.Types.ObjectId(data.destination)
    : null;
  faq.displayOrder = data.displayOrder;
  faq.status = data.status as PublishStatus;

  try {
    await faq.save();
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

    console.error('[admin/faqs] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save. Nothing was changed.' },
      { status: 500 }
    );
  }

  const currentPaths =
    faq.status === 'published'
      ? await faqPaths({ destination: faq.destination })
      : [];

  return NextResponse.json({
    ok: true,
    updatedAt: faq.updatedAt,
    revalidated: revalidateAll([...previousPaths, ...currentPaths]),
  });
}

/**
 * DELETE /api/admin/faqs/[id]
 *
 * Nothing references a FAQ, so there is no dependant to strand. `archived` is
 * the option for an answer that should stop showing but should stay findable.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

  await connectDB();

  let faq;

  try {
    faq = await Faq.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!faq) return new NextResponse(null, { status: 404 });

  const paths =
    faq.status === 'published'
      ? await faqPaths({ destination: faq.destination })
      : [];

  await faq.deleteOne();

  return NextResponse.json({ ok: true, revalidated: revalidateAll(paths) });
}
