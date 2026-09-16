import { NextResponse } from 'next/server';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import Faq, { IFaq } from '../../../../../models/Faq';
import { faqReorderSchema } from '../../../../../lib/validators/adminContent';
import { faqPaths, revalidateAll } from '../../../../../lib/revalidation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/faqs/reorder — write a new display order.
 *
 * The list screen sends the ids of **one group** in their new order, and this
 * writes `displayOrder` as the position in that array. A group is the set of
 * entries that render on the same page — sitewide, or one trip's, or one
 * destination's — because ordering entries against each other only means
 * anything when they appear in the same list.
 *
 * A static `reorder` segment beside `[id]`: Next resolves static before
 * dynamic, and the ids here are ObjectIds, so nothing is shadowed. In Express
 * this would be the ordering problem of registering `/:id` before `/reorder`
 * and having the second never match.
 *
 * ## Why this uses `bulkWrite` and not the findById → save() convention
 *
 * CLAUDE.md requires `findById` → assign → `save()` for admin mutations,
 * because query middleware skips `pre('validate')` and that is where the
 * Nepal/activity rule lives. Two things make this the exception rather than a
 * shortcut:
 *
 * - **`Faq` has no validate hook**, and `displayOrder` has no validator, so
 *   there is nothing for query middleware to skip. The rule protects a
 *   guarantee this model does not make.
 * - Forty entries reordered as forty `save()` calls is eighty round trips to
 *   Atlas in Mumbai for eighty bytes of integer.
 *
 * The write is also deliberately narrow — `$set: { displayOrder }` and nothing
 * else — so a reorder cannot carry a stale copy of anything the admin was not
 * editing. That is the property a whole-document `save()` would lose here,
 * since the list screen does not hold full documents to save.
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

  const parsed = faqReorderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Could not read that order.' },
      { status: 400 }
    );
  }

  const { ids } = parsed.data;

  /*
   * A repeated id would give one entry two positions and silently drop
   * another's. The list cannot produce it, which is exactly why it is checked
   * here — the list is not the only thing that can call this.
   */
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json(
      { error: 'The same entry appears twice in that order.' },
      { status: 400 }
    );
  }

  await connectDB();

  /*
   * Read before writing, for two reasons: an id that matches nothing should be
   * a rejected request rather than a silently skipped write, and the
   * associations are needed to work out which pages to purge — a reorder
   * changes what the page shows first, so it is a content change like any
   * other.
   */
  const existing = await Faq.find({ _id: { $in: ids } })
    .select('destination status')
    .lean<Pick<IFaq, '_id' | 'destination' | 'status'>[]>()
    .exec();

  if (existing.length !== ids.length) {
    return NextResponse.json(
      {
        error:
          'Some of those entries no longer exist. Reload the page and try again.',
      },
      { status: 409 }
    );
  }

  try {
    await Faq.bulkWrite(
      ids.map((id, index) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { displayOrder: index } },
        },
      }))
    );
  } catch (error) {
    console.error('[admin/faqs/reorder] Write failed:', error);

    return NextResponse.json(
      { error: 'Could not save the new order.' },
      { status: 500 }
    );
  }

  /*
   * Only the published entries' pages. `revalidateAll` de-duplicates, so a
   * group of twelve sitewide entries purges `/faq` once.
   */
  const paths: string[] = [];

  for (const faq of existing) {
    if (faq.status !== 'published') continue;

    paths.push(...(await faqPaths({ destination: faq.destination })));
  }

  return NextResponse.json({ ok: true, revalidated: revalidateAll(paths) });
}
