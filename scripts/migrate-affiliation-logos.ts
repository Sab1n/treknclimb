import mongoose from 'mongoose';

import { connectDB } from '../lib/db';
import Affiliation from '../models/Affiliation';

/**
 * Clears the four seeded affiliation logo public IDs.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-affiliation-logos.ts
 *
 * The seed filed each body under `treknclimb/affiliations/<abbr>` before any
 * logo file existed, and none has been uploaded since. A public ID pointing at
 * nothing is not a neutral placeholder: `CloudinaryImage` degrades to a
 * labelled grey block, so the About page carried four grey blocks and the
 * footer strip could not fall back to the abbreviation, because as far as the
 * code was concerned there *was* a logo.
 *
 * So the value is removed rather than the renderer taught to guess. Blank is
 * the true state, and the abbreviation fallback is the designed one. Uploading
 * a logo through Settings fills the field back in with a real ID.
 *
 * `findById` → assign → `save()` per CLAUDE.md, so the conditional `logoAlt`
 * rule runs on the way through — clearing the logo is exactly the case where
 * the alt text stops being required, and doing this through the raw driver
 * would skip the check that says so.
 *
 * Idempotent: a record with no logo is left alone. Only the seeded IDs are
 * cleared, so a real logo uploaded before this runs survives it.
 */

const SEEDED_PREFIX = 'treknclimb/affiliations/';

async function main() {
  await connectDB();

  const affiliations = await Affiliation.find().select('_id name logo logoAlt');

  let cleared = 0;

  for (const affiliation of affiliations) {
    if (!affiliation.logo) continue;

    /*
     * Only the seeded pattern. An ID with a random suffix came from a real
     * upload through the signing endpoint, and clearing that would throw away
     * a logo somebody actually supplied.
     */
    const seeded =
      affiliation.logo.startsWith(SEEDED_PREFIX) &&
      !affiliation.logo.slice(SEEDED_PREFIX.length).includes('/');

    if (!seeded) {
      console.log(`  ${affiliation.name}: real logo, left alone.`);
      continue;
    }

    affiliation.logo = undefined;
    affiliation.logoAlt = undefined;

    await affiliation.save();
    cleared += 1;

    console.log(`  ${affiliation.name}: placeholder logo cleared.`);
  }

  console.log(`\n${cleared} logo(s) cleared.`);

  /*
   * Read back through the raw driver, not through Mongoose. A hydrated
   * document would report the in-memory value and prove nothing about what is
   * stored.
   */
  const remaining = await Affiliation.collection.countDocuments({
    logo: { $regex: `^${SEEDED_PREFIX}[^/]+$` },
  });

  console.log(`${remaining} placeholder logo(s) left in the collection.`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
