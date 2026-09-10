/**
 * Deletes newsletter signups that were never confirmed.
 *
 *   npx tsx --env-file=.env.local scripts/purge-pending-subscribers.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/purge-pending-subscribers.ts
 *
 * A `pending` row is an address someone typed in and never confirmed. It might
 * be a person who changed their mind, a typo for someone else's address, or an
 * address entered maliciously. **None of those is a subscriber, and holding
 * them indefinitely means keeping personal data with no consent behind it** —
 * the confirmation click is the consent, and it never came.
 *
 * Seven days, matching the confirmation token's lifetime. Once the token has
 * expired the row cannot become a subscriber anyway; it is dead weight that
 * happens to contain an email address.
 *
 * ## Why a script rather than a TTL index
 *
 * `RejectedSubmissions` uses a TTL and that is right there: nothing is ever
 * waiting on those rows. Here a TTL would delete a signup mid-confirmation if
 * someone opened the email late, silently and with no record. A script runs
 * when a person decides it should, says what it removed, and has a `--dry-run`.
 *
 * Run it on a schedule once hosting is settled — the same cron that will handle
 * the inquiry and booking retention purges in the open items.
 */

import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import NewsletterSubscriber from '../models/NewsletterSubscriber';

const PENDING_MAX_AGE_DAYS = 7;

async function purge() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDB();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PENDING_MAX_AGE_DAYS);

  /*
   * Filtered on `createdAt`, not `updatedAt`. A resend refreshes `updatedAt`,
   * and keying on it would let someone hold a pending row alive forever by
   * resubmitting the address every six days — which is the same person's data
   * being retained without their consent, by an attacker's action.
   */
  const filter = { status: 'pending', createdAt: { $lt: cutoff } } as const;

  const doomed = await NewsletterSubscriber.find(filter)
    .select('email createdAt source')
    .lean();

  if (doomed.length === 0) {
    console.log(
      `Nothing to purge. No pending signups older than ${PENDING_MAX_AGE_DAYS} days.`
    );
    await mongoose.disconnect();
    return;
  }

  console.log(
    `${doomed.length} pending signup(s) older than ${PENDING_MAX_AGE_DAYS} days (before ${cutoff.toISOString().slice(0, 10)}):`
  );

  for (const subscriber of doomed) {
    console.log(
      `  ${subscriber.email}  signed up ${subscriber.createdAt.toISOString().slice(0, 10)}  from ${subscriber.source ?? 'unknown'}`
    );
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing deleted.');
    await mongoose.disconnect();
    return;
  }

  const result = await NewsletterSubscriber.deleteMany(filter);

  console.log(`\nDeleted ${result.deletedCount} unconfirmed signup(s).`);

  await mongoose.disconnect();
}

purge().catch(async (error) => {
  console.error('Purge failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
