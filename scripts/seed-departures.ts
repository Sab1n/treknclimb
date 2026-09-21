import mongoose from 'mongoose';

import { connectDB } from '../lib/db';
import Trip from '../models/Trip';
import { fromIsoDate } from '../lib/departures';
import { purge } from './lib/purge';

/**
 * PLACEHOLDER departure seasons on Everest Base Camp, so the trip page
 * calendar has something to render. **None of these dates or prices came from
 * the client.**
 *
 *   npx tsx --env-file=.env.local scripts/seed-departures.ts
 *   npx tsx --env-file=.env.local scripts/seed-departures.ts --remove
 *
 * - **October, daily, $1,245** — a whole month of departures, which is what
 *   seasons exist for. Two exceptions so every calendar state is visible: the
 *   17th closed and the 26th full. $1,245 is below the cheapest private tier
 *   ($1,295), so the rail's headline comes from the group path.
 * - **9 November, a single departure, closed** — a season whose start and end
 *   are the same day. It carries over the closed departure the earlier
 *   placeholder set had.
 * - One blackout period for private trips, whose reason says it is a
 *   placeholder, because that text is shown to visitors.
 *
 * A season has no free-text field to carry a label, so the marking lives here,
 * in CLAUDE.md's placeholder list, and in `--remove`.
 *
 * ## Refuses to overwrite
 *
 * If the trip already has seasons or blackout periods, this does nothing — real
 * dates entered in the admin must never be replaced by a development seed.
 * `--remove` clears **all** seasons and blackout periods on this one trip, so
 * run it only while these placeholders are the only ones.
 *
 * `findOne` → assign → `save()`, per CLAUDE.md, so the season validators run on
 * the way in. A UTF-8 `.ts` file run by `tsx`, not text piped through
 * PowerShell; the only non-ASCII character stored is the em dash in the
 * blackout reason.
 */

const SLUG = 'everest-base-camp-trek';

async function main() {
  const remove = process.argv.includes('--remove');

  await connectDB();

  const trip = await Trip.findOne({ slug: SLUG });

  if (!trip) throw new Error(`No trip slugged ${SLUG}.`);

  if (remove) {
    trip.departureSeasons = [];
    trip.blackoutPeriods = [];
    await trip.save();
    console.log(`Removed all departure seasons and blackout periods from ${SLUG}.`);
  } else {
    if (trip.departureSeasons.length > 0 || trip.blackoutPeriods.length > 0) {
      console.log(
        `${SLUG} already has ${trip.departureSeasons.length} season(s) and ` +
          `${trip.blackoutPeriods.length} blackout period(s). Nothing written.`
      );
      await mongoose.disconnect();
      return;
    }

    trip.departureSeasons = [
      {
        startDate: fromIsoDate('2026-10-01'),
        endDate: fromIsoDate('2026-10-31'),
        pattern: 'daily',
        weekdays: [],
        pricePerPerson: 1245,
        exceptions: [
          { date: fromIsoDate('2026-10-17'), status: 'closed', pricePerPerson: null },
          { date: fromIsoDate('2026-10-26'), status: 'full', pricePerPerson: null },
        ],
      },
      {
        startDate: fromIsoDate('2026-11-09'),
        endDate: fromIsoDate('2026-11-09'),
        pattern: 'daily',
        weekdays: [],
        pricePerPerson: 1195,
        exceptions: [
          { date: fromIsoDate('2026-11-09'), status: 'closed', pricePerPerson: null },
        ],
      },
    ];

    trip.blackoutPeriods = [
      {
        start: fromIsoDate('2026-12-20'),
        end: fromIsoDate('2027-01-05'),
        reason: 'PLACEHOLDER — seeded for development, not a real closure',
      },
    ];

    await trip.save();

    console.log(`Seeded 2 placeholder seasons and 1 blackout period on ${SLUG}.`);
  }

  await purge([
    '/nepal/trekking/everest-base-camp-trek',
    '/nepal/trekking',
    '/trips',
    '/',
    // The inquiry form carries every trip's seasons for its departure picker.
    '/contact',
  ]);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
