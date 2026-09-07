import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import Destination, { IDestination } from '../models/Destination';
import Activity, { IActivity } from '../models/Activity';

/**
 * Seeds the four destinations and Nepal's three activities.
 *
 * Destinations are edit-only in the CMS — created here once and never through
 * the UI — so this script refuses to run against a database that already has
 * them rather than overwriting edits. Pass --force to wipe and re-seed.
 *
 *   npx tsx --env-file=.env.local scripts/seed.ts
 *   npx tsx --env-file=.env.local scripts/seed.ts --force
 */

/**
 * `Omit<IDestination, '_id'>` is the same trick ITripPopulated uses: take the
 * full interface and drop a key. The seed literals below have no _id — Mongo
 * assigns those — but every other required field is still enforced, so a typo
 * or a missing coverImageAlt is a compile error rather than a runtime one.
 */
type DestinationSeed = Omit<IDestination, '_id'>;

/** Same idea, minus the destination ref, which is filled in after Nepal exists. */
type ActivitySeed = Omit<IActivity, '_id' | 'destination'>;

const destinations: DestinationSeed[] = [
  {
    name: 'Nepal',
    slug: 'nepal',
    description:
      'Home of eight of the world’s fourteen 8,000-metre peaks, and the country we know best. Trekking, peak climbing and short hikes across the Everest, Annapurna and Langtang regions.',
    coverImage: 'treknclimb/destinations/nepal',
    coverImageAlt: 'The Annapurna range at sunrise, seen from Poon Hill',
    hasActivities: true,
    metaTitle: 'Nepal Trekking & Peak Climbing Tours',
    metaDescription:
      'Guided treks, peak climbs and hikes across Nepal’s Everest, Annapurna and Langtang regions. Fixed departures from Pokhara and Kathmandu.',
    displayOrder: 1,
  },
  {
    name: 'India',
    slug: 'india',
    description:
      'Himalayan trekking in Ladakh, Sikkim and Himachal, alongside cultural journeys through Rajasthan and the Golden Triangle.',
    coverImage: 'treknclimb/destinations/india',
    coverImageAlt: 'Monastery above the Indus valley in Ladakh',
    hasActivities: false,
    metaTitle: 'India Himalayan Treks & Cultural Tours',
    metaDescription:
      'Guided Himalayan treks in Ladakh, Sikkim and Himachal Pradesh, plus cultural tours across northern India.',
    displayOrder: 2,
  },
  {
    name: 'Tibet',
    slug: 'tibet',
    description:
      'The Tibetan plateau, Lhasa, Everest north base camp and the Kailash kora. Permit-led travel with long lead times.',
    coverImage: 'treknclimb/destinations/tibet',
    coverImageAlt: 'Potala Palace in Lhasa under a clear sky',
    hasActivities: false,
    metaTitle: 'Tibet Tours, Lhasa & Everest North Base Camp',
    metaDescription:
      'Guided tours across the Tibetan plateau — Lhasa, Everest north base camp and the Mount Kailash kora. Permits arranged.',
    displayOrder: 3,
  },
  {
    name: 'Bhutan',
    slug: 'bhutan',
    description:
      'Dzongs, festivals and the Snowman trek, in a country that limits visitor numbers by design.',
    coverImage: 'treknclimb/destinations/bhutan',
    coverImageAlt: 'Tiger’s Nest monastery on the cliff face above Paro',
    hasActivities: false,
    metaTitle: 'Bhutan Tours, Treks & Festivals',
    metaDescription:
      'Guided journeys through Bhutan — Paro, Thimphu, the Tiger’s Nest and the Snowman trek. Daily fees and permits handled.',
    displayOrder: 4,
  },
];

const nepalActivities: ActivitySeed[] = [
  {
    name: 'Trekking',
    slug: 'trekking',
    description:
      'Multi-day walking routes through the Everest, Annapurna, Langtang and Manaslu regions. No technical climbing — teahouse and camping itineraries from five days upward.',
    coverImage: 'treknclimb/activities/trekking',
    coverImageAlt: 'Trekkers on the trail below Ama Dablam',
    displayOrder: 1,
    metaTitle: 'Nepal Trekking Routes & Packages',
    metaDescription:
      'Guided treks across Everest, Annapurna, Langtang and Manaslu. Teahouse and camping itineraries with licensed local guides.',
  },
  {
    name: 'Peak Climbing',
    slug: 'peak-climbing',
    description:
      'Trekking peaks between roughly 5,500 m and 6,500 m — Island Peak, Mera, Lobuche East. Rope, crampons and ice axe, with training days built into the itinerary.',
    coverImage: 'treknclimb/activities/peak-climbing',
    coverImageAlt: 'Climber on the fixed ropes of Island Peak headwall',
    displayOrder: 2,
    metaTitle: 'Nepal Peak Climbing Expeditions',
    metaDescription:
      'Guided climbs of Nepal’s trekking peaks — Island Peak, Mera Peak and Lobuche East. Permits, equipment and training included.',
  },
  {
    name: 'Hiking',
    slug: 'hiking',
    description:
      'Short day walks and two- to four-day routes around Pokhara and the Kathmandu valley. Suitable without altitude experience.',
    coverImage: 'treknclimb/activities/hiking',
    coverImageAlt: 'Terraced hillside above Pokhara on the Australian Camp trail',
    displayOrder: 3,
    metaTitle: 'Short Hikes near Pokhara & Kathmandu',
    metaDescription:
      'Day hikes and short routes around Pokhara and the Kathmandu valley. No altitude experience needed.',
  },
];

async function seed() {
  const force = process.argv.includes('--force');

  await connectDB();

  const existingDestinations = await Destination.countDocuments();
  const existingActivities = await Activity.countDocuments();

  if ((existingDestinations > 0 || existingActivities > 0) && !force) {
    console.log(
      `Already seeded — ${existingDestinations} destinations, ${existingActivities} activities.\n` +
        'Destinations are edit-only, so this script will not overwrite them. Re-run with --force to wipe and re-seed.'
    );
    await mongoose.disconnect();
    return;
  }

  if (force) {
    await Activity.deleteMany({});
    await Destination.deleteMany({});
    console.log('Cleared existing destinations and activities.');
  }

  /**
   * insertMany does NOT run save middleware — no pre('save') or post('save')
   * hook fires here. It DOES still validate: it calls $validate() on every
   * document, which runs schema validators and any pre('validate') hook.
   *
   * That distinction matters the moment anyone seeds Trips with this pattern,
   * because Trip's pre('validate') hook queries the Destination collection —
   * one extra round trip per document. It does not matter for the two models
   * below, neither of which has a validate hook.
   */
  const insertedDestinations = await Destination.insertMany(destinations);
  console.log(`Inserted ${insertedDestinations.length} destinations.`);

  const nepal = insertedDestinations.find((d) => d.slug === 'nepal');

  if (!nepal) {
    throw new Error('Nepal was not inserted — cannot attach activities.');
  }

  const insertedActivities = await Activity.insertMany(
    nepalActivities.map((activity) => ({ ...activity, destination: nepal._id }))
  );
  console.log(
    `Inserted ${insertedActivities.length} activities under ${nepal.name}.`
  );

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch(async (error) => {
  console.error('Seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
