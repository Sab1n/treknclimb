import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import Destination, { IDestination } from '../models/Destination';
import Activity, { IActivity } from '../models/Activity';
import Affiliation, { IAffiliation } from '../models/Affiliation';
import BlogCategory, { IBlogCategory } from '../models/BlogCategory';
import SiteSettings from '../models/SiteSettings';

/**
 * Seeds the fixed reference data: four destinations, Nepal's three activities,
 * the four affiliations, the blog taxonomy, and the empty SiteSettings
 * singleton.
 *
 * This data is edit-only in the CMS — created here once and never through the
 * UI — so the script refuses to run against a database that already has it
 * rather than overwriting edits. Pass --force to wipe and re-seed.
 *
 *   npx tsx --env-file=.env.local scripts/seed.ts
 *   npx tsx --env-file=.env.local scripts/seed.ts --force
 *
 * Nothing here invents client data. Registration numbers, phone, address and
 * all conversion copy are left blank for the client to supply through the
 * admin — the prototypes' versions of those are placeholder, not fact.
 */

/**
 * A generic. `Seed<T>` takes any model interface and strips the fields the
 * database fills in for itself, leaving exactly what a seed literal has to
 * provide. `T` is a type parameter — a placeholder the caller supplies, so one
 * definition covers every model instead of one alias per model.
 *
 * Every other required field survives the strip, so a missing coverImageAlt is
 * still a compile error.
 */
type Seed<T> = Omit<
  T,
  '_id' | 'createdAt' | 'updatedAt' | 'slugHistory' | 'noIndex'
>;

const destinations: Seed<IDestination>[] = [
  {
    name: 'Nepal',
    slug: 'nepal',
    description:
      'Home of eight of the world’s fourteen 8,000-metre peaks. Trekking, peak climbing and short hikes across the Everest, Annapurna, Manaslu and Langtang regions.',
    coverImage: 'treknclimb/destinations/nepal',
    coverImageAlt: 'The Annapurna range at sunrise, seen from Poon Hill',
    hasActivities: true,
    metaTitle: 'Nepal Trekking & Peak Climbing Tours',
    metaDescription:
      'Guided treks, peak climbs and hikes across Nepal’s Everest, Annapurna and Langtang regions, run from Pokhara.',
    displayOrder: 1,
  },
  {
    name: 'India',
    slug: 'india',
    description:
      'Himalayan trekking in Ladakh, Sikkim and Himachal, alongside cultural journeys through northern India.',
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

// `destination` is filled in once Nepal has an _id.
const nepalActivities: Omit<Seed<IActivity>, 'destination'>[] = [
  {
    name: 'Trekking',
    slug: 'trekking',
    description:
      'Multi-day walking routes through the Everest, Annapurna, Langtang and Manaslu regions. No technical climbing — teahouse and camping itineraries.',
    coverImage: 'treknclimb/activities/trekking',
    coverImageAlt: 'Trekkers on the trail below Ama Dablam',
    displayOrder: 1,
    metaTitle: 'Nepal Trekking Routes & Packages',
    metaDescription:
      'Guided treks across Everest, Annapurna, Langtang and Manaslu with licensed local guides.',
  },
  {
    name: 'Peak Climbing',
    slug: 'peak-climbing',
    description:
      'Trekking peaks between roughly 5,500 m and 6,500 m. Rope, crampons and ice axe, with training days built into the itinerary.',
    coverImage: 'treknclimb/activities/peak-climbing',
    coverImageAlt: 'Climber on the fixed ropes of the Island Peak headwall',
    displayOrder: 2,
    metaTitle: 'Nepal Peak Climbing Expeditions',
    metaDescription:
      'Guided climbs of Nepal’s trekking peaks — Island Peak, Mera Peak and Lobuche East. Permits and equipment included.',
  },
  {
    name: 'Hiking',
    slug: 'hiking',
    description:
      'Short day walks and two- to four-day routes around Pokhara and the Kathmandu valley. No altitude experience needed.',
    coverImage: 'treknclimb/activities/hiking',
    coverImageAlt: 'Terraced hillside above Pokhara on the Australian Camp trail',
    displayOrder: 3,
    metaTitle: 'Short Hikes near Pokhara & Kathmandu',
    metaDescription:
      'Day hikes and short routes around Pokhara and the Kathmandu valley.',
  },
];

/**
 * The four bodies named in CLAUDE.md. Registration numbers are deliberately
 * absent — the real ones have to come from the client, and a placeholder
 * licence number on a trust asset is worse than a blank one.
 */
const affiliations: Seed<IAffiliation>[] = [
  {
    name: 'Department of Tourism',
    abbreviation: 'DoT',
    logo: 'treknclimb/affiliations/dot',
    logoAlt: 'Department of Tourism, Government of Nepal',
    url: 'https://tourism.gov.np',
    displayOrder: 1,
  },
  {
    name: 'Nepal Tourism Board',
    abbreviation: 'NTB',
    logo: 'treknclimb/affiliations/ntb',
    logoAlt: 'Nepal Tourism Board',
    url: 'https://ntb.gov.np',
    displayOrder: 2,
  },
  {
    name: 'Trekking Agencies’ Association of Nepal, Pokhara',
    abbreviation: 'TAAN',
    logo: 'treknclimb/affiliations/taan',
    logoAlt: 'Trekking Agencies’ Association of Nepal, Pokhara chapter',
    url: 'https://taanpokhara.org',
    displayOrder: 3,
  },
  {
    name: 'Nepal Mountaineering Association',
    abbreviation: 'NMA',
    logo: 'treknclimb/affiliations/nma',
    logoAlt: 'Nepal Mountaineering Association',
    url: 'https://nepalmountaineering.org',
    displayOrder: 4,
  },
];

const blogCategories: Seed<IBlogCategory>[] = [
  {
    name: 'Destination guides',
    slug: 'destination-guides',
    description: 'Region-by-region guides to where we operate.',
    displayOrder: 1,
  },
  {
    name: 'Travel tips',
    slug: 'travel-tips',
    description: 'Visas, permits, packing and getting there.',
    displayOrder: 2,
  },
  {
    name: 'Trekking guides',
    slug: 'trekking-guides',
    description: 'Route notes, altitude, fitness and preparation.',
    displayOrder: 3,
  },
  {
    name: 'Culture & food',
    slug: 'culture-and-food',
    description: 'The places, people and food along the routes.',
    displayOrder: 4,
  },
];

async function seed() {
  const force = process.argv.includes('--force');

  await connectDB();

  const counts = {
    destinations: await Destination.countDocuments(),
    activities: await Activity.countDocuments(),
    affiliations: await Affiliation.countDocuments(),
    blogCategories: await BlogCategory.countDocuments(),
    siteSettings: await SiteSettings.countDocuments(),
  };

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  if (total > 0 && !force) {
    console.log('Already seeded:', counts);
    console.log(
      'This data is edit-only, so the script will not overwrite it. Re-run with --force to wipe and re-seed.'
    );
    await mongoose.disconnect();
    return;
  }

  if (force) {
    await Promise.all([
      Activity.deleteMany({}),
      Destination.deleteMany({}),
      Affiliation.deleteMany({}),
      BlogCategory.deleteMany({}),
      SiteSettings.deleteMany({}),
    ]);
    console.log('Cleared existing reference data.');
  }

  /**
   * insertMany does NOT run save middleware — no pre('save') or post('save')
   * hook fires. It DOES validate: it calls $validate() on every document,
   * which runs schema validators and any pre('validate') hook.
   *
   * That matters the moment anyone seeds Trips this way, because Trip's
   * pre('validate') hook queries the Destination collection — one extra round
   * trip per document. None of the models below has a validate hook.
   */
  const insertedDestinations = await Destination.insertMany(destinations);
  console.log(`Inserted ${insertedDestinations.length} destinations.`);

  const nepal = insertedDestinations.find((d) => d.slug === 'nepal');
  if (!nepal) throw new Error('Nepal was not inserted — cannot attach activities.');

  const insertedActivities = await Activity.insertMany(
    nepalActivities.map((activity) => ({ ...activity, destination: nepal._id }))
  );
  console.log(`Inserted ${insertedActivities.length} activities under ${nepal.name}.`);

  const insertedAffiliations = await Affiliation.insertMany(affiliations);
  console.log(
    `Inserted ${insertedAffiliations.length} affiliations (registration numbers left blank for the client).`
  );

  const insertedCategories = await BlogCategory.insertMany(blogCategories);
  console.log(`Inserted ${insertedCategories.length} blog categories.`);

  /**
   * The SiteSettings singleton. Only the three facts CLAUDE.md actually states
   * are filled in; everything else — phone, address, response-time promise,
   * hero copy, stats — stays empty until the client supplies it. The unique
   * `key` means a second call can never create a second document.
   */
  await SiteSettings.create({
    key: 'site',
    legalName: 'Trek & Climb Adventure',
    addressLocality: 'Pokhara',
    addressCountry: 'Nepal',
  });
  console.log('Created the SiteSettings singleton (mostly empty — fill it in the admin).');

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch(async (error) => {
  console.error('Seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
