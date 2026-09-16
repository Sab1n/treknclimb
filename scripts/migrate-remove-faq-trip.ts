/**
 * Removes the dead `trip` field from every Faq document.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-remove-faq-trip.ts
 *
 * `Faq.trip` was dropped from the schema: a trip's questions live in
 * `Trip.faqs`, the embedded array the trip page renders and the trip editor
 * writes, and a single `trip` ref here could not express "this answer applies
 * to these five trips" — so it bought no reuse while costing two sources for
 * one section of one page. See the note on `models/Faq.ts`.
 *
 * ## Why the field has to be unset rather than just forgotten
 *
 * Removing a path from a schema does **not** remove it from stored documents.
 * Mongoose's `strict` mode simply stops reading and writing it, so the value
 * sits on disk indefinitely — invisible through the model, present in every
 * raw export, and waiting to be misread by whoever finds it in Compass and
 * concludes trips still have FAQs here.
 *
 * That invisibility is the same trap CLAUDE.md records for
 * `RejectedSubmission.form`, pointing the other way: there, strict mode
 * silently dropped a write; here, it silently retains one.
 *
 * ## Raw driver, not the model
 *
 * `Faq.updateMany` would be filtered through the schema, which no longer knows
 * `trip` exists — so `$unset` on it would be stripped before it reached
 * MongoDB and the script would report success having done nothing. The
 * collection handle bypasses that, and the count is read back the same way.
 *
 * Additive and idempotent: re-running it finds nothing to do. Safe to run
 * against a database where the field was never present.
 */

import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import Faq from '../models/Faq';

async function main() {
  await connectDB();

  const before = await Faq.collection.countDocuments({
    trip: { $exists: true },
  });

  if (before === 0) {
    console.log('No Faq document carries a `trip` field. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  /*
   * Anything with a non-null `trip` would have been rendering on no page since
   * the field was never read — worth naming rather than silently discarding,
   * because it is content someone wrote and can no longer find.
   */
  const attached = await Faq.collection
    .find({ trip: { $ne: null } })
    .project({ question: 1 })
    .toArray();

  if (attached.length > 0) {
    console.log(
      `${attached.length} entries were attached to a trip. Their text is kept; only the association is dropped.`
    );
    console.log('Re-enter these on the trip editor’s FAQs tab if they matter:');
    for (const row of attached) console.log('  -', row.question);
  }

  const result = await Faq.collection.updateMany(
    { trip: { $exists: true } },
    { $unset: { trip: '' } }
  );

  const after = await Faq.collection.countDocuments({ trip: { $exists: true } });

  console.log(`Unset \`trip\` on ${result.modifiedCount} of ${before} documents.`);
  console.log(`Documents still carrying the field: ${after}.`);

  if (after !== 0) {
    console.error('WARNING: the field survived on some documents.');
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
