import mongoose from 'mongoose';

import { connectDB } from '../lib/db';
import BookingRequest from '../models/BookingRequest';

/**
 * Gives every existing inquiry the three departure fields, as null.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-booking-departures.ts
 *
 * `tripType`, `departureId` and `departureSnapshot` are `| null` on the
 * interface — the key is always present. An inquiry written before they
 * existed has no key at all, and a `.lean()` read does **not** apply schema
 * defaults, so the admin would read `undefined` where the type promises
 * `null`. Null is also the true value: nobody was asked group or private.
 *
 * `findById` → assign → `save()` per CLAUDE.md, so the pairing hook runs on
 * the way through. `markModified` because hydrating a document already fills
 * the defaults in memory — assigning null over a null is not a change, and
 * `save()` would write nothing. `timestamps: false` so the inquiry's
 * `updatedAt` still says when a person last touched it.
 *
 * Verified afterwards through the raw driver, not through Mongoose: reading
 * back through the model would apply the defaults again and prove nothing.
 * Idempotent.
 */

const FIELDS = ['tripType', 'departureId', 'departureSnapshot'] as const;

async function main() {
  await connectDB();

  const missing = await BookingRequest.collection
    .find(
      { $or: FIELDS.map((field) => ({ [field]: { $exists: false } })) },
      { projection: { _id: 1 } }
    )
    .toArray();

  console.log(`${missing.length} inquiry(ies) lack the departure fields.`);

  for (const { _id } of missing) {
    const booking = await BookingRequest.findById(_id);

    if (!booking) continue;

    for (const field of FIELDS) {
      booking.set(field, booking.get(field) ?? null);
      booking.markModified(field);
    }

    await booking.save({ timestamps: false });
  }

  const stillMissing = await BookingRequest.collection.countDocuments({
    $or: FIELDS.map((field) => ({ [field]: { $exists: false } })),
  });

  console.log(`Done. ${stillMissing} still lack them (raw driver check).`);

  await mongoose.disconnect();
  process.exit(stillMissing === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
