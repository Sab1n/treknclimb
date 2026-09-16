import { NextResponse } from 'next/server';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import NotFoundLog from '../../../../../models/NotFoundLog';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/not-found-log/[id] — dismiss a 404 as not worth mapping.
 *
 * Marked rather than deleted. A deleted row reappears on the very next request
 * for that path and re-clutters the worklist, so "I have looked at this and it
 * needs nothing" has to be a state the record can hold. It is reversible, and
 * the list can show ignored rows on request.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const ignored = (body as { ignored?: unknown })?.ignored;

  if (typeof ignored !== 'boolean') {
    return NextResponse.json(
      { error: 'ignored has to be true or false.' },
      { status: 400 }
    );
  }

  await connectDB();

  try {
    const result = await NotFoundLog.updateOne({ _id: id }, { $set: { ignored } });

    if (result.matchedCount === 0) return new NextResponse(null, { status: 404 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json({ ok: true, ignored });
}
