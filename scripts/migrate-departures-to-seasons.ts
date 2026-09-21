import mongoose from 'mongoose';

import { connectDB } from '../lib/db';
import Trip from '../models/Trip';
import { addDays, toIsoDate } from '../lib/departures';

/**
 * Converts every stored `departures[]` into `departureSeasons[]`, and gives
 * every trip the new array.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-departures-to-seasons.ts
 *
 * ## Through the raw driver, and why that is not the whole story
 *
 * `departures` is no longer in the schema, so Mongoose cannot read it —
 * `strict` mode drops unknown paths on the way in, and `trip.departures` would
 * be undefined on a document that plainly holds three. Same situation as
 * scripts/migrate-trip-region-ref.ts: the schema that replaced the field can
 * no longer see what it held. So the read and the write go through
 * `Trip.collection`.
 *
 * The raw driver runs **no validators and no plugins**, including the U+FFFD
 * guard. So every converted trip is then loaded through Mongoose and
 * `validate()`d, which runs the season rules — end not before start, exceptions
 * on real departure dates — and the encoding guard. A conversion the model
 * would reject is reported rather than trusted. Run scripts/scan-encoding.ts
 * afterwards as well; CLAUDE.md asks for it after any raw write.
 *
 * ## The conversion
 *
 * Each old departure becomes a **single-date season** — start and end both on
 * its start date — at its price. A `full` or `closed` departure becomes an
 * exception on that date; `available` needs none, since that is what a
 * generated date already is. The old per-departure `endDate` (the day the trek
 * finished) is dropped: it is now derived from `durationDays`. Where the two
 * disagree the script says so, because that is a departure whose length was
 * not the trip's length, and it would now show a different end date.
 *
 * The old departure's `_id` becomes the season's `_id`. Nothing references
 * either yet, but it keeps a thread from the old record to the new one.
 *
 * `updatedAt` is not touched — raw writes never bump it — so the sitemap's
 * `<lastmod>` for these trips does not move. Idempotent: a second run finds no
 * `departures` field and only fills in missing empty arrays.
 */

interface OldDeparture {
  _id: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  pricePerPerson: number;
  status: 'available' | 'full' | 'closed';
}

async function main() {
  await connectDB();

  const withDepartures = await Trip.collection
    .find(
      { departures: { $exists: true } },
      { projection: { slug: 1, durationDays: 1, departures: 1, departureSeasons: 1 } }
    )
    .toArray();

  console.log(`${withDepartures.length} trip(s) store the old departures[].`);

  const converted: mongoose.Types.ObjectId[] = [];

  for (const doc of withDepartures) {
    const departures = (doc.departures ?? []) as OldDeparture[];
    const existing = (doc.departureSeasons ?? []) as unknown[];

    const seasons = departures.map((departure) => {
      const start = toIsoDate(departure.startDate);
      const derivedEnd = addDays(start, Math.max(doc.durationDays ?? 1, 1) - 1);
      const storedEnd = toIsoDate(departure.endDate);

      if (storedEnd !== derivedEnd) {
        console.log(
          `  NOTE ${doc.slug} ${start}: stored end ${storedEnd}, ` +
            `now derived as ${derivedEnd} from ${doc.durationDays} days`
        );
      }

      return {
        _id: departure._id,
        startDate: departure.startDate,
        endDate: departure.startDate,
        pattern: 'daily',
        weekdays: [],
        pricePerPerson: departure.pricePerPerson,
        exceptions:
          departure.status === 'available'
            ? []
            : [
                {
                  _id: new mongoose.Types.ObjectId(),
                  date: departure.startDate,
                  status: departure.status,
                  pricePerPerson: null,
                },
              ],
      };
    });

    await Trip.collection.updateOne(
      { _id: doc._id },
      {
        $set: { departureSeasons: [...existing, ...seasons] },
        $unset: { departures: '' },
      }
    );

    converted.push(doc._id);

    console.log(
      `  ${doc.slug}: ${departures.length} departure(s) → ${seasons.length} single-date season(s)`
    );
  }

  // Trips that never had departures still need the key; lean reads skip defaults.
  const filled = await Trip.collection.updateMany(
    { departureSeasons: { $exists: false } },
    { $set: { departureSeasons: [] } }
  );

  console.log(`${filled.modifiedCount} trip(s) given an empty departureSeasons[].`);

  /* ---------------- verify through the model ---------------- */

  let invalid = 0;

  for (const id of converted) {
    const trip = await Trip.findById(id);

    try {
      await trip!.validate();
    } catch (error) {
      invalid += 1;
      console.log(`  INVALID ${trip!.slug}:`, (error as Error).message);
    }
  }

  const leftover = await Trip.collection.countDocuments({ departures: { $exists: true } });
  const missing = await Trip.collection.countDocuments({ departureSeasons: { $exists: false } });

  console.log(
    `Verified: ${converted.length - invalid}/${converted.length} converted trip(s) pass model validation; ` +
      `${leftover} still store departures[]; ${missing} lack departureSeasons[].`
  );

  await mongoose.disconnect();
  process.exit(invalid === 0 && leftover === 0 && missing === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
