/**
 * ============================================================================
 * SCHEMA MIGRATION + PLACEHOLDER COPY — THE PROSE IS NOT CLIENT COPY.
 * ============================================================================
 *
 * Three things:
 *
 *   1. Writes `Destination.activitiesIntro` — the editorial body of
 *      `/<destination>/activities`, now with one `>` pull-quote line per
 *      section for the composed layout.
 *   2. Rewrites each activity's `description` so it says **what kit the
 *      activity needs**, in prose.
 *   3. **Unsets `technicalSkill` and `technicalSkillNote`**, which have been
 *      removed from the model.
 *
 * ## Why the technical-skill fields went
 *
 * They were the only authored column in an otherwise fully derived comparison
 * table, which made them the only column that could go quietly wrong — an
 * admin adds an activity, leaves the enum blank or picks the nearest-looking
 * value, and the table keeps presenting it with the same confidence as the
 * counted ones. The information matters; the enum was the wrong shape for it.
 * It now lives in the description, where it is a sentence someone reads rather
 * than a field someone maintains.
 *
 * **The prose below was written here, not by Trek & Climb Adventure.** The
 * geography, seasons and permit structure are broadly accurate, but the
 * specifics are illustrative and none of it has been checked by a guide. This
 * is the page's SEO substance, so it is exactly the copy the client most needs
 * to own — replace it before launch.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-activities-page.ts
 *
 * findOne → assign → save() for the writes, per the convention: additive,
 * reversible, and the validators run on the way through. The unset is the one
 * exception and uses `updateMany` with `$unset`, because a field that no longer
 * exists on the schema cannot be cleared by assigning to the document —
 * Mongoose would simply ignore the assignment and leave the value in Mongo.
 *
 * Re-running is safe: it writes the same values and skips anything missing.
 */

import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import Destination from '../models/Destination';
import Activity from '../models/Activity';

/**
 * Keyed by destination slug. Only Nepal has an activity layer today; the shape
 * is per-destination so a second one needs a new entry, not new code.
 *
 * Markdown subset — `##`, `-`, `**bold**`, `>`. **The first `>` in each section
 * becomes that section's pull quote** and is lifted out of the body, so it must
 * read as a standalone line rather than as part of the paragraph around it.
 */
const ACTIVITY_INTROS: Record<string, string> = {
  nepal: `Nepal packs eight of the world's fourteen 8,000-metre peaks into a country the size of England, and the range of what you can do here is wider than most people expect. A first-time visitor with five days and a family in tow, and a climber wanting a 6,000-metre summit, are both well served — but by completely different trips.

This page is about telling those apart before you start looking at itineraries.

## What adventure travel here actually involves

> Almost all of it is walking. The question is not whether you can climb — it is whether you can walk for six hours, and then do it again tomorrow.

Nepal's trekking regions are laced with trails that villages have used for centuries, and the routes we run follow them. You are walking between inhabited places, sleeping in teahouses or lodges, and eating what the family cooks. It is not wilderness expedition travel and it does not need you to carry a tent.

What it does need is **consecutive days on your feet**. Five to seven hours of walking, on stone staircases and uneven ground, several days in a row. That is the fitness question, and it matters far more than any single hard day.

The second factor is altitude, and it is the one that decides whether people finish. Above roughly 3,000 metres your body needs time it cannot be talked out of. Every itinerary we sell builds in acclimatisation days for that reason, and we will not remove them to shorten a trip.

## When to come

> There are two good seasons and two bad ones, and the difference between them is not a matter of degree.

- **Spring, March to May.** Warmer, longer days, rhododendron in flower at lower altitudes. Hazier views as the season goes on. The main climbing season.
- **Autumn, late September to November.** The clearest air of the year and the most reliable weather. The busiest season, for good reason.

**Monsoon, June to August**, is wet, leech-ridden and often cloud-covered in the main trekking regions, and the flights that matter get cancelled. If those are your only free weeks, the answer is not a Nepali trek — it is Ladakh, which sits in the rain shadow north of the range.

**Winter, December to February**, is cold and clear at lower altitudes and genuinely serious higher up. Short hikes around Pokhara work well. High passes mostly do not.

## Permits

> Your nationality changes what your trek costs. That is why we ask for it before quoting, rather than after.

Every trekking region requires permits, and we arrange all of them. They are issued in your name and are included in the price we quote.

Two things follow from that. Nationals of SAARC countries pay materially less than others for the same permit, so a quote given without knowing your passport is a guess. And **restricted areas need lead time** — Manaslu and Upper Mustang cannot be arranged at a few days' notice, so a late booking may narrow your options before you have chosen anything.

Your visa is separate and is yours to arrange. We will tell you what applies to your passport.

## How to choose between the three

> The real line is not difficulty. It is whether you want a summit or a viewpoint — and whether you are willing to learn to use a rope to get one.

The honest shortcut:

- **How many days do you have?** Under a week points at hiking. Ten days or more opens up the main trekking routes. Peak climbing needs longer again, because the acclimatisation cannot be compressed.
- **Do you want a summit or a viewpoint?** Both are hard work; only one involves rope, crampons and an ice axe, and only one has a day where the outcome is genuinely in doubt.
- **Has anyone in the group been to altitude?** Nobody needs to have. But it changes which itinerary we would put you on, and how many rest days it carries.

If you are between two of these, tell us and we will say which one fits — including when the answer is neither.`,
};

/**
 * Descriptions rewritten so each says what the activity needs you to carry and
 * know. This is where the removed `technicalSkill` enum went — as prose, on the
 * card, where someone reads it while choosing.
 */
const DESCRIPTIONS: Record<string, string> = {
  trekking:
    'Multi-day walking routes through the Everest, Annapurna, Langtang and Manaslu regions, staying in teahouses along the way. Nothing technical at any point — boots, poles and a day pack are the whole kit list, and no rope or climbing skill is involved.',
  'peak-climbing':
    'Trekking peaks between roughly 5,500 m and 6,500 m, approached as a trek and finished as a climb. The summit days need rope, crampons, harness and an ice axe — we provide the technical kit and build training days into the itinerary, so previous climbing experience is not required.',
  hiking:
    'Short day walks and two- to four-day routes around Pokhara and the Kathmandu valley, sleeping in lodges. Boots and a light pack are all you need; nothing goes high enough for altitude to be a factor and there is no technical ground anywhere on them.',
};

async function migrate() {
  await connectDB();

  /* ---------------- 1. the article body ---------------- */

  for (const [slug, intro] of Object.entries(ACTIVITY_INTROS)) {
    const destination = await Destination.findOne({ slug });

    if (!destination) {
      console.warn(`  No destination with slug "${slug}" — skipped.`);
      continue;
    }

    if (!destination.hasActivities) {
      // Not fatal, but almost certainly a mistake: the page 404s for a
      // destination without the layer, so the copy would never be seen.
      console.warn(
        `  "${slug}" has hasActivities=false — the intro will never render. Writing it anyway.`
      );
    }

    destination.activitiesIntro = intro;
    await destination.save();

    const pullQuotes = (intro.match(/^> /gm) ?? []).length;
    const sections = (intro.match(/^## /gm) ?? []).length;

    console.log(
      `Wrote activitiesIntro to ${destination.name} — ${intro.length} chars, ${sections} sections, ${pullQuotes} pull quotes.`
    );
  }

  /* ---------------- 2. descriptions carrying the kit ---------------- */

  let described = 0;

  for (const [slug, description] of Object.entries(DESCRIPTIONS)) {
    const activity = await Activity.findOne({ slug });

    if (!activity) {
      console.warn(`  No activity with slug "${slug}" — skipped.`);
      continue;
    }

    activity.description = description;
    await activity.save();
    described += 1;
  }

  console.log(`Rewrote ${described} activity descriptions to name the kit.`);

  /* ---------------- 3. drop the removed fields ---------------- */

  /*
   * `$unset` through the raw update path, not findOne → assign → save().
   *
   * The paths are gone from the schema, so Mongoose no longer knows about
   * them: assigning `undefined` to a document would be dropped as an unknown
   * path in strict mode and the values would stay in Mongo forever, invisible
   * to the application and present in every export.
   */
  const result = await Activity.updateMany(
    {},
    { $unset: { technicalSkill: '', technicalSkillNote: '' } },
    { strict: false }
  );

  console.log(
    `Removed technicalSkill / technicalSkillNote from ${result.modifiedCount} activity document(s).`
  );

  await mongoose.disconnect();
  console.log(
    '\nDone. The article prose is placeholder — the client rewrites it in the admin.'
  );
}

migrate().catch(async (error) => {
  console.error('Migration failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
