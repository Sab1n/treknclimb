import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import Redirect from '../../../../models/Redirect';
import NotFoundLog from '../../../../models/NotFoundLog';
import { adminRedirectSchema } from '../../../../lib/validators/adminRedirect';
import { isRedirectSourceTaken } from '../../../../lib/queries/adminRedirects';
import { clearRedirectMissCache } from '../../../../lib/redirects';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/redirects — add one redirect.
 *
 * ## The negative cache has to be cleared here
 *
 * `lib/redirects.ts` remembers paths it looked up and found nothing for, so a
 * scanner cannot turn one 404 into thousands of identical queries. That cache
 * is exactly what would make the first test of a new redirect fail: an admin
 * writes a row for a path they just saw 404, follows it, and gets the cached
 * miss. Clearing on write costs nothing — redirects are written rarely — and
 * removes a confusing failure that looks like the feature not working.
 *
 * ## And the 404 log row is retired
 *
 * Adding a redirect for a path in the unmapped list is the act of dealing with
 * it, so the row goes. Leaving it would mean the worklist never shrinks and the
 * admin re-reads the same path every visit.
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

  await connectDB();

  if (await isRedirectSourceTaken(data.oldUrl, '')) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: {
          oldUrl: 'A redirect already exists for this path. Edit that one instead.',
        },
      },
      { status: 400 }
    );
  }

  const redirect = new Redirect({
    oldUrl: data.oldUrl,
    newUrl: data.newUrl,
    type: data.type,
    isActive: data.isActive,
  });

  try {
    await redirect.save();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json(
        {
          error: 'Some fields need checking.',
          fieldErrors: { oldUrl: 'A redirect already exists for this path.' },
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

    console.error('[admin/redirects] Create failed:', error);

    return NextResponse.json(
      { error: 'Could not save the redirect.' },
      { status: 500 }
    );
  }

  clearRedirectMissCache();

  // The path is now handled, so it leaves the unmapped worklist.
  try {
    await NotFoundLog.deleteOne({ path: data.oldUrl });
  } catch (error) {
    console.error('[admin/redirects] Could not retire the 404 log row:', error);
  }

  return NextResponse.json(
    { ok: true, id: String(redirect._id) },
    { status: 201 }
  );
}
