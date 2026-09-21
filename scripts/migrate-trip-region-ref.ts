import mongoose from 'mongoose';

import { connectDB } from '../lib/db';
import Region from '../models/Region';
import Trip from '../models/Trip';

/**
 * `Trip.region`: free text → a `Region` reference.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-trip-region-ref.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/migrate-trip-region-ref.ts
 *
 * ## Why this needs the raw driver
 *
 * The schema now declares `region` as an ObjectId ref. The stored values are
 * strings. **Mongoose cannot read them** — a `.find()` casts the stored value
 * to the declared type and a string like `Everest / Khumbu` is not a valid
 * ObjectId, so the read throws (or, worse, a query filtering on it silently
 * matches nothing). The old shape is invisible to the model that replaced it.
 *
 * `Trip.collection` is the underlying MongoDB driver collection: no casting,
 * no validation, no middleware. It is the only thing that can still see the
 * data being migrated. This is the same reason `scripts/migrate-remove-faq-trip.ts`
 * uses it to `$unset` a path the schema no longer knows.
 *
 * ## What that costs
 *
 * **The raw driver runs no validators, so the U+FFFD guard does not apply to
 * anything written here.** That guard is a Mongoose path validator; the driver
 * never sees it. Nothing this script writes is authored text — it writes
 * ObjectIds and nulls — so the exposure is small, but the rule holds generally:
 * after any raw-driver migration, run
 *
 *   npx tsx --env-file=.env.local scripts/scan-encoding.ts
 *
 * ## Matching
 *
 * The stored strings were written by hand and do not equal the region names:
 * `Everest / Khumbu` is the Everest region, `Annapurna` is Annapurna. Matching
 * is therefore explicit and case-insensitive rather than clever — an
 * unrecognised value is **reported and left alone**, never guessed at. A trip
 * silently filed under the wrong region would appear on a page it does not
 * belong on, and nothing about that looks like an error.
 */

/**
 * Known free-text values, lowercased, mapped to a region slug.
 *
 * `null` means "recognised, and deliberately not mapped": Ladakh and
 * Paro/Thimphu are real regions of India and Bhutan with no region record — and
 * no URL that would render one, because the only region route sits under an
 * activity segment and neither destination has an activity layer. Listing them
 * here rather than leaving them unrecognised is the point: it distinguishes
 * "we looked at this and decided" from "we have never seen this value".
 */
const MAPPING: Record<string, string | null> = {
  'everest / khumbu': 'everest',
  'everest/khumbu': 'everest',
  everest: 'everest',
  khumbu: 'everest',
  annapurna: 'annapurna',
  langtang: 'langtang',
  manaslu: 'manaslu',

  ladakh: null,
  'paro / thimphu': null,
  'paro/thimphu': null,
};

interface Row {
  _id: mongoose.Types.ObjectId;
  slug: string;
  title: string;
  region?: unknown;
}

(async () => {
  const dryRun = process.argv.includes('--dry-run');

  await connectDB();

  const regions = await Region.find()
    .select('_id slug name')
    .lean<{ _id: mongoose.Types.ObjectId; slug: string; name: string }[]>();

  if (regions.length === 0) {
    console.error(
      'No regions exist. Run scripts/seed-regions.ts (or create them in the admin) first.'
    );
    process.exit(1);
  }

  const regionBySlug = new Map(regions.map((region) => [region.slug, region]));

  // Raw driver: the schema can no longer describe what is stored.
  const rows = (await Trip.collection
    .find({}, { projection: { slug: 1, title: 1, region: 1 } })
    .toArray()) as unknown as Row[];

  const planned: { row: Row; regionId: mongoose.Types.ObjectId; regionName: string }[] = [];
  const clearing: { row: Row; reason: string }[] = [];
  const unrecognised: { row: Row; value: string }[] = [];
  let alreadyDone = 0;

  for (const row of rows) {
    const value = row.region;

    // Already an ObjectId, or already null. Nothing to do.
    if (value instanceof mongoose.Types.ObjectId) {
      alreadyDone += 1;
      continue;
    }

    if (value === null || value === undefined || value === '') {
      clearing.push({ row, reason: 'no region set' });
      continue;
    }

    if (typeof value !== 'string') {
      unrecognised.push({ row, value: String(value) });
      continue;
    }

    const key = value.trim().toLowerCase();

    if (!(key in MAPPING)) {
      unrecognised.push({ row, value });
      continue;
    }

    const slug = MAPPING[key];

    if (slug === null) {
      clearing.push({ row, reason: `"${value}" has no region record or route` });
      continue;
    }

    const region = regionBySlug.get(slug);

    if (!region) {
      unrecognised.push({ row, value: `${value} (maps to "${slug}", which does not exist)` });
      continue;
    }

    planned.push({ row, regionId: region._id, regionName: region.name });
  }

  console.log(`${rows.length} trip(s) examined.\n`);

  if (alreadyDone) console.log(`${alreadyDone} already hold a reference — skipped.\n`);

  console.log(`To link (${planned.length}):`);
  for (const p of planned) {
    console.log(`  ${p.row.slug.padEnd(30)} "${String(p.row.region)}" -> ${p.regionName}`);
  }

  console.log(`\nTo set null (${clearing.length}):`);
  for (const c of clearing) console.log(`  ${c.row.slug.padEnd(30)} ${c.reason}`);

  if (unrecognised.length) {
    console.log(`\nUNRECOGNISED — left untouched (${unrecognised.length}):`);
    for (const u of unrecognised) console.log(`  ${u.row.slug.padEnd(30)} "${u.value}"`);
    console.log(
      '\n  Add these to MAPPING above and re-run. They are left as they are\n' +
        '  rather than nulled, so nothing is lost by running this twice.'
    );
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    process.exit(unrecognised.length ? 1 : 0);
  }

  console.log('\nWriting...\n');

  for (const p of planned) {
    await Trip.collection.updateOne(
      { _id: p.row._id },
      { $set: { region: p.regionId } }
    );
  }

  for (const c of clearing) {
    await Trip.collection.updateOne({ _id: c.row._id }, { $set: { region: null } });
  }

  /*
   * Read back through the *model*, not the driver. The whole point of the
   * migration is that Mongoose can now read these documents — if a cast still
   * fails, this is where it shows, rather than on a page during a build.
   */
  const verified = await Trip.find()
    .select('slug region')
    .populate('region', 'name')
    .lean<{ slug: string; region: { name: string } | null }[]>();

  console.log('Read back through the model:');
  for (const trip of verified) {
    console.log(`  ${trip.slug.padEnd(30)} ${trip.region ? trip.region.name : '(none)'}`);
  }

  const stillString = (await Trip.collection.countDocuments({
    region: { $type: 'string' },
  })) as number;

  console.log(`\nTrips still holding a string region: ${stillString}`);

  await mongoose.disconnect();

  process.exit(stillString > 0 || unrecognised.length ? 1 : 0);
})();
