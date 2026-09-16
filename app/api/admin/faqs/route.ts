import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import Faq from '../../../../models/Faq';
import { adminFaqSchema } from '../../../../lib/validators/adminContent';
import { faqPaths, revalidateAll } from '../../../../lib/revalidation';
import type { PublishStatus } from '../../../../models/shared/status';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/faqs — create one.
 *
 * The association is not validated for existence beyond its shape. A trip or
 * destination id that matches nothing produces a FAQ that renders on no page,
 * which is a content mistake rather than a corrupt record — and the ids come
 * from selects populated by this server, so the only way to send a bad one is
 * to construct the request by hand.
 */
export async function POST(request: Request) {
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

  const faq = new Faq({
    question: data.question,
    answer: data.answer,
    category: data.category,
    destination: data.destination
      ? new mongoose.Types.ObjectId(data.destination)
      : null,
    displayOrder: data.displayOrder,
    status: data.status as PublishStatus,
  });

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

    console.error('[admin/faqs] Create failed:', error);

    return NextResponse.json(
      { error: 'Could not create the FAQ. Nothing was saved.' },
      { status: 500 }
    );
  }

  // A draft appears nowhere public, so there is no cached page to purge.
  const revalidated =
    faq.status === 'published'
      ? revalidateAll(await faqPaths({ destination: faq.destination }))
      : [];

  return NextResponse.json(
    { ok: true, id: String(faq._id), revalidated },
    { status: 201 }
  );
}
