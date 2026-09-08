import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import Activity from '../models/Activity';

/**
 * Adds `suitability` to the three seeded Nepal activities.
 * findOne -> assign -> save(), never seed.ts --force: --force would recreate
 * the activities with new ObjectIds and orphan every trip that references them.
 *
 * PLACEHOLDER COPY — written here, not supplied by the client.
 */
const copy: Record<string, string> = {
  trekking:
    'Suits anyone comfortable walking five to seven hours on consecutive days over uneven ground. No climbing skill, no ropes and no previous altitude experience are needed — our itineraries build in the acclimatisation days that make the difference. If you walk hills at home a few times a month, you are ready for most of these routes.',
  'peak-climbing':
    'Suits strong trekkers who want a summit rather than a viewpoint. You do not need previous climbing experience — training days on rope, crampon and fixed-line technique are built into every itinerary — but you do need to be comfortable with long days at altitude first. If you have completed a high-altitude trek and want the next step, this is it.',
  hiking:
    'Suits first-time visitors, families with teenagers, and anyone with a few days rather than a few weeks. Nothing here goes high enough for altitude to be a factor and every night is in a teahouse or lodge. It is also the sensible choice if you are recovering fitness or travelling with mixed abilities in the group.',
};

async function run() {
  await connectDB();
  for (const [slug, suitability] of Object.entries(copy)) {
    const activity = await Activity.findOne({ slug });
    if (!activity) { console.log(`  ${slug}: not found, skipped`); continue; }
    activity.suitability = suitability;
    await activity.save();
    console.log(`  ${slug}: set (${suitability.length} chars)`);
  }
  await mongoose.disconnect();
}
run().catch(async (e) => { console.error(e); await mongoose.disconnect(); process.exit(1); });
