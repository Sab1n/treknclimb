import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import ExchangeRate from '../../../../models/ExchangeRate';
import {
  RATE_SOURCES,
  ROUNDING_RULES,
  type RateSource,
  type RoundingRule,
} from '../../../../models/shared/rateVocab';
import { revalidateAll, pricePaths } from '../../../../lib/revalidation';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/rates — save the whole rate table.
 *
 * ## One request for the table, not one per row
 *
 * The screen is a grid the admin edits and then saves, so sending it as a unit
 * is what matches the interaction. It also means a partial failure cannot leave
 * half the currencies updated and half not — which on a price table is the
 * state that produces a trip costing NPR 1,300.
 *
 * Rows are addressed **by id**, never by position, for the same reason the
 * affiliation numbers are: a reordered or re-seeded table would otherwise write
 * the Nepalese rupee's rate onto the euro.
 *
 * ## `lastUpdated` moves only when the rate does
 *
 * It is a separate field from `updatedAt` on purpose. Toggling `isActive` or
 * changing a rounding rule must not reset the clock the staleness warning reads,
 * or a three-month-old rate looks fresh because somebody flipped a checkbox.
 */

/**
 * A rate arriving from a text input.
 *
 * **Units of this currency per 1 USD** — NPR is about 133, not 0.0075. The
 * bound is deliberately generous: this catches a decimal-point slip or an empty
 * field, and the *inverted*-rate case is caught by a warning in the editor
 * instead, because an unfamiliar currency can legitimately be very small or
 * very large and refusing the save would be wrong.
 */
const rateSchema = z
  .string()
  .trim()
  .min(1, 'A rate is required')
  .transform(Number)
  .refine(Number.isFinite, 'The rate must be a number')
  .refine((value) => value > 0, 'The rate must be greater than zero')
  .refine((value) => value <= 10_000_000, 'That rate is implausibly large');

const rowSchema = z.object({
  id: z.string().trim().regex(/^[0-9a-f]{24}$/i, 'Bad record reference'),
  rate: rateSchema,
  source: z.enum(RATE_SOURCES, { error: 'Choose api or manual' }),
  roundingRule: z.enum(ROUNDING_RULES, { error: 'Choose a rounding rule' }),
  isActive: z.boolean(),
});

const bodySchema = z.object({ rates: z.array(rowSchema).max(50) });

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an auth challenge confirms the endpoint exists.
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

  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      // `rates.2.rate` — the key the editor puts under the right cell.
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }

    return NextResponse.json(
      { error: 'Some rates need checking.', fieldErrors },
      { status: 400 }
    );
  }

  await connectDB();

  const changed: string[] = [];
  let anyRateChanged = false;

  try {
    for (const row of parsed.data.rates) {
      // `findById` → assign → `save()`, per CLAUDE.md.
      const record = await ExchangeRate.findById(row.id);

      // An id the form knew about that no longer exists. Skipped rather than
      // failed — the rest of the table is already correct.
      if (!record) continue;

      const rateMoved = record.rate !== row.rate;

      if (
        !rateMoved &&
        record.source === row.source &&
        record.roundingRule === row.roundingRule &&
        record.isActive === row.isActive
      ) {
        continue;
      }

      record.rate = row.rate;
      record.source = row.source as RateSource;
      record.roundingRule = row.roundingRule as RoundingRule;
      record.isActive = row.isActive;

      /*
       * Only when the number itself moved. A rounding-rule change or a
       * deactivation is not a refresh, and treating it as one would silence the
       * staleness warning for another week on a rate nobody re-checked.
       */
      if (rateMoved) {
        record.lastUpdated = new Date();
        anyRateChanged = true;
      }

      await record.save();
      changed.push(record.currencyCode);
    }
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      const fieldErrors: Record<string, string> = {};

      for (const [path, detail] of Object.entries(error.errors)) {
        fieldErrors[path] = detail.message;
      }

      return NextResponse.json(
        { error: 'Some rates need checking.', fieldErrors },
        { status: 400 }
      );
    }

    console.error('[admin/rates] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save the rates.' },
      { status: 500 }
    );
  }

  /*
   * Every page that shows a price. Rates are baked into the static HTML as
   * props — conversion happens client-side, but from values captured at build
   * time — so a rate change is stale content on every one of those pages until
   * they regenerate.
   */
  const revalidated =
    changed.length > 0 ? revalidateAll(await pricePaths()) : [];

  return NextResponse.json({
    ok: true,
    changed,
    ratesRefreshed: anyRateChanged,
    revalidated,
  });
}
