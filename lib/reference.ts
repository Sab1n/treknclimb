import { connectDB } from './db';
import Counter from '../models/Counter';
import BookingRequest from '../models/BookingRequest';

/**
 * Allocates the human-readable inquiry reference: TNC-{year}-{4-digit sequence}.
 *
 * ## Why a counter document
 *
 * The obvious implementation — count this year's bookings and add one — has a
 * race in it. Two inquiries arriving in the same tick both read 416, both
 * write 417, and one of them is rejected by the unique index after the visitor
 * has already filled in the form. On a site whose only conversion event is this
 * form, that is the worst possible place to lose a submission.
 *
 * So the sequence lives in its own document and is advanced with
 * `findOneAndUpdate` + `$inc`. **A single-document update in MongoDB is
 * atomic**, so two concurrent callers are serialised by the database and get
 * 417 and 418. No transaction, no lock, no read-then-write gap. `upsert`
 * creates the counter on the first inquiry of each year.
 *
 * This is a deliberate exception to the "never `findOneAndUpdate`" convention.
 * That rule exists because query middleware skips `pre('validate')` and would
 * bypass the Nepal/activity rule — a Counter has no hooks and no validation,
 * and atomicity is the entire reason this code exists.
 *
 * ## Alternatives, and why not
 *
 * - **Random 4-digit suffix + unique index.** Ten thousand values, so by the
 *   birthday bound collisions start showing up in the low hundreds of
 *   bookings. Retryable, but the format implies a sequence and a random one
 *   invites "what happened to TNC-2026-0416?".
 * - **A MongoDB transaction around count-then-insert.** Correct, but needs a
 *   replica set session and costs far more than an atomic `$inc` for a
 *   guarantee that `$inc` already gives.
 * - **UUID or timestamp.** Collision-free and unreadable. This number gets
 *   quoted over WhatsApp by someone who wrote it on paper.
 *
 * ## The remaining failure mode
 *
 * The counter can fall behind reality — a restored backup, or someone
 * inserting a booking by hand. The unique index on `reference` catches that,
 * and the loop below re-increments and tries again rather than failing the
 * submission. The index is the guarantee; the counter is the mechanism.
 */

const MAX_ATTEMPTS = 5;

function format(year: number, seq: number): string {
  // padStart(4) is a minimum, not a cap — the 10,000th inquiry of a year
  // becomes TNC-2026-10000 rather than wrapping or truncating.
  return `TNC-${year}-${String(seq).padStart(4, '0')}`;
}

/** Advances the counter for one year and returns the next value. */
async function nextSequence(year: number): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { _id: `booking:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return counter!.seq;
}

export async function allocateReference(
  now: Date = new Date()
): Promise<string> {
  await connectDB();

  const year = now.getUTCFullYear();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const reference = format(year, await nextSequence(year));

    // Cheap guard against a counter that has fallen behind the collection.
    // Not a substitute for the unique index — two callers could both pass this
    // check — but it resolves the common case without provoking a write error.
    const taken = await BookingRequest.exists({ reference });

    if (!taken) return reference;
  }

  throw new Error(
    `Could not allocate a booking reference for ${year} after ${MAX_ATTEMPTS} attempts.`
  );
}
