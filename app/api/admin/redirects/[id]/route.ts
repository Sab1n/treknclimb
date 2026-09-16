import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import Redirect from '../../../../../models/Redirect';
import { adminRedirectSchema } from '../../../../../lib/validators/adminRedirect';
import { isRedirectSourceTaken } from '../../../../../lib/queries/adminRedirects';
import { clearRedirectMissCache } from '../../../../../lib/redirects';

export const dynamic = 'force-dynamic';

/** Shared by both methods. Returns a response on failure, null on success. */
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

/**
 * PATCH /api/admin/redirects/[id]
 *
 * Takes the full row, or just `{ isActive }` for the toggle in the list — which
 * is why the schema is applied only when the body carries more than that. A
 * toggle that had to round-trip every field would mean the list needed the
 * whole record loaded to flip one boolean.
 */
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

  await connectDB();

  let row;

  try {
    row = await Redirect.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!row) return new NextResponse(null, { status: 404 });

  const payload = (body ?? {}) as Record<string, unknown>;
  const keys = Object.keys(payload);

  // The active toggle: one field, no schema needed.
  if (keys.length === 1 && keys[0] === 'isActive') {
    if (typeof payload.isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'isActive has to be true or false.' },
        { status: 400 }
      );
    }

    row.isActive = payload.isActive;
    await row.save();

    /*
     * Cleared on a toggle too. Switching a redirect *on* is the case that
     * matters: without this the path stays a cached miss for up to a minute and
     * the toggle looks like it did nothing.
     */
    clearRedirectMissCache();

    return NextResponse.json({ ok: true, isActive: row.isActive });
  }

  const parsed = adminRedirectSchema.safeParse(body);

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

  if (await isRedirectSourceTaken(data.oldUrl, id)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { oldUrl: 'Another redirect already uses this path.' },
      },
      { status: 400 }
    );
  }

  row.oldUrl = data.oldUrl;
  row.newUrl = data.newUrl;
  row.type = data.type as typeof row.type;
  row.isActive = data.isActive;

  try {
    await row.save();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json(
        {
          error: 'Some fields need checking.',
          fieldErrors: { oldUrl: 'Another redirect already uses this path.' },
        },
        { status: 400 }
      );
    }

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

    console.error('[admin/redirects] Save failed:', error);

    return NextResponse.json({ error: 'Could not save.' }, { status: 500 });
  }

  clearRedirectMissCache();

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/redirects/[id]
 *
 * No guard on this one, unlike deleting an activity. A redirect references
 * nothing and nothing references it — removing one turns a 301 back into a
 * 404, which is recoverable by writing the row again. The confirm dialog in
 * the UI is the whole ceremony it warrants.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

  await connectDB();

  try {
    const result = await Redirect.deleteOne({ _id: id });

    if (result.deletedCount === 0) return new NextResponse(null, { status: 404 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  clearRedirectMissCache();

  return NextResponse.json({ ok: true });
}
