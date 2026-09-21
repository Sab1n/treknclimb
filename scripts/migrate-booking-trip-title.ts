import mongoose from 'mongoose';

import { connectDB } from '../lib/db';
import BookingRequest from '../models/BookingRequest';
import Trip from '../models/Trip';

/**
 * Backfills `BookingRequest.tripTitle` on inquiries taken before the field
 * existed.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-booking-trip-title.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/migrate-booking-trip-title.ts
 *
 * ## Why it has to run now rather than when it matters
 *
 * `tripTitle` is a snapshot the submission route takes. Existing inquiries have
 * none, so they still depend entirely on the `trip` reference resolving — and
 * the moment a draft trip is deleted, any inquiry pointing at it silently
 * becomes a "General inquiry" that says nothing about what the customer asked.
 *
 * The backfill can only run **while the trips still exist**. After a deletion
 * the name is gone from the database entirely and no script can recover it.
 * That is the whole reason this is not deferred.
 *
 * ## `findOne` → assign → `save()`, per CLAUDE.md
 *
 * Not `updateMany`. `BookingRequest` has no validate hook today, but the rule
 * exists because a model acquiring one later would be silently skipped by query
 * middleware — and this touches customer records, which is the worst place to
 * discover that. The volume is small enough that the loop costs nothing.
 *
 * Inquiries that name no trip are left alone: null is a real, meaningful value
 * there, not missing data.
 */
(async () => {
  const dryRun = process.argv.includes('--dry-run');

  await connectDB();

  const titleById = new Map(
    (
      await Trip.find()
        .select('_id title')
        .lean<{ _id: mongoose.Types.ObjectId; title: string }[]>()
    ).map((trip) => [String(trip._id), trip.title])
  );

  const bookings = await BookingRequest.find({
    trip: { $ne: null },
    $or: [{ tripTitle: { $exists: false } }, { tripTitle: '' }],
  });

  console.log(`${bookings.length} inquiry(ies) need a title snapshot.\n`);

  const planned: { reference: string; title: string }[] = [];
  const orphaned: string[] = [];

  for (const booking of bookings) {
    const title = titleById.get(String(booking.trip));

    if (!title) {
      /*
       * The reference already points at a trip that is gone. Nothing can be
       * recovered — the name only ever existed on the deleted document — so it
       * is reported rather than guessed at. Reported and not cleared, because
       * a dangling id is at least evidence that *a* trip was named.
       */
      orphaned.push(booking.reference);
      continue;
    }

    planned.push({ reference: booking.reference, title });

    if (!dryRun) {
      booking.tripTitle = title;
      await booking.save();
    }
  }

  for (const row of planned) {
    console.log(`  ${row.reference.padEnd(18)} ${row.title}`);
  }

  if (orphaned.length) {
    console.log(
      `\n${orphaned.length} inquiry(ies) point at a trip that no longer exists:`
    );
    for (const reference of orphaned) console.log(`  ${reference}`);
    console.log(
      '\n  Their trip name is unrecoverable — it only existed on the deleted\n' +
        '  document. They will continue to read as "General inquiry".'
    );
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    await mongoose.disconnect();
    return;
  }

  /*
   * Read back with the raw driver. Reading through Mongoose can return the
   * value just set from the in-memory document and prove nothing about what
   * reached Atlas.
   */
  const remaining = await BookingRequest.collection.countDocuments({
    trip: { $ne: null },
    $or: [{ tripTitle: { $exists: false } }, { tripTitle: '' }],
  });

  console.log(`\nWrote ${planned.length}.`);
  console.log(`Inquiries still missing a snapshot: ${remaining} (${orphaned.length} orphaned).`);

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error('Backfill failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
