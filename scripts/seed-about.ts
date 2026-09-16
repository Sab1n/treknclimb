/**
 * ============================================================================
 * PLACEHOLDER DEVELOPMENT CONTENT — NOT CLIENT COPY. DO NOT SHIP.
 * ============================================================================
 *
 * Everything the About page needs in order to render against real records
 * rather than empty states:
 *
 *   1. SiteSettings — the company story, the commitments list, and the three
 *      safety and responsibility blocks.
 *   2. Three TeamMember documents.
 *
 *   npx tsx --env-file=.env.local scripts/seed-about.ts
 *   npx tsx --env-file=.env.local scripts/seed-about.ts --remove
 *
 * ## The people are named PLACEHOLDER, on the page, deliberately
 *
 * This follows the blog byline treatment rather than the testimonial one, and
 * the difference is the point. A testimonial is a customer's opinion; a team
 * member is a **credentials claim about a named individual** — that this person
 * exists, works here, and holds a certification you would trust your safety to
 * at 5,000 m. An invented founder on an About page is the single worst thing
 * on this site to ship unnoticed, because it is precisely the claim the page
 * exists to make checkable.
 *
 * So the names read `PLACEHOLDER — NOT A REAL PERSON`. Not a plausible Nepali
 * name that someone skims past at launch; something that is impossible to miss
 * and embarrassing enough to guarantee it is replaced. Same for the
 * credentials, which name no real certifying body.
 *
 * ## What is deliberately NOT seeded
 *
 * Each would be a fabricated *fact* rather than placeholder prose:
 *
 *   - `foundingYear` — v1's prototype says 2004 and "twenty-two years". Nobody
 *     confirmed either. The hero omits the "since ..." clause without it.
 *   - `registrationNumber`, and every `Affiliation.registrationNumber` — a
 *     placeholder licence number is a lie in structured data and on the page.
 *     The page says "to be confirmed" instead.
 *   - `headlineStats` — invented social proof, which the design rules forbid.
 *   - Team photos — there are no images to point at, and alt text is required
 *     whenever there is one.
 *   - `yearsExperience` — an unverified number attached to a named person.
 *
 * ## Additive, per CLAUDE.md
 *
 * SiteSettings is touched with findOne → assign → save(), never
 * `seed.ts --force`: the singleton is referenced elsewhere and recreating it
 * would change its ObjectId. `--remove` clears only the three fields this
 * script sets and deletes only the members it created.
 */

import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import SiteSettings from '../models/SiteSettings';
import TeamMember from '../models/TeamMember';

const PLACEHOLDER_PREFIX = 'PLACEHOLDER — NOT A REAL PERSON';

const STORY = `Trek & Climb Adventure is a trekking and expedition operator based in Pokhara, Nepal. We run our own trips rather than reselling someone else's, which means the guide who meets you at the airport works for the company that answered your email.

PLACEHOLDER COPY. This paragraph and the one above were written during development and were not supplied by Trek & Climb Adventure. The real story — when the company started, who started it, and why — has to come from the client before this page goes live.

## What that means in practice

We keep groups small, we pay for the permits out of the trip price rather than adding them at the end, and we build itineraries that gain altitude slowly enough that most people finish them.

PLACEHOLDER COPY. Replace all of this.`;

const COMMITMENTS = [
  {
    kind: 'will' as const,
    title: 'Run our own trips',
    body: 'PLACEHOLDER. Every trip on this site is operated by us, not subcontracted to a third party. The guide you meet works for the company you booked with.',
  },
  {
    kind: 'will' as const,
    title: 'Include the permits in the price',
    body: 'PLACEHOLDER. Trekking permits and conservation fees are in the quoted price. What is excluded is listed on each trip page.',
  },
  {
    kind: 'will' as const,
    title: 'Answer every inquiry ourselves',
    body: 'PLACEHOLDER. A person reads your inquiry and writes the reply. No automated itinerary generator.',
  },
  {
    kind: 'wont' as const,
    title: 'Sell you a departure that is not running',
    body: 'PLACEHOLDER. We do not advertise fixed departures with invented availability counts. If a date does not work, we say so.',
  },
  {
    kind: 'wont' as const,
    title: 'Push you higher than is safe',
    body: 'PLACEHOLDER. If a guide judges that you should descend, you descend. Nobody is talked into one more day for the sake of a summit photo.',
  },
  {
    kind: 'wont' as const,
    title: 'Take a payment before you have the plan',
    body: 'PLACEHOLDER. No deposit is requested until you have seen a day-by-day itinerary and a final price.',
  },
];

const SAFETY = [
  {
    title: 'Insurance and evacuation',
    body: 'PLACEHOLDER. Every client must carry insurance covering helicopter evacuation at the altitude their trip reaches. We check the policy before departure and we arrange the evacuation if it is ever needed. The real threshold and the real procedure must be confirmed by the client.',
  },
  {
    title: 'Guide certification',
    body: 'PLACEHOLDER. Our guides hold government trekking-guide licences and current wilderness first-aid certification, renewed on a fixed cycle. The actual certifications held, and how often they are renewed, must be confirmed by the client before this is published.',
  },
  {
    title: 'Porter welfare',
    body: 'PLACEHOLDER. Load limits, insurance, and equipment for cold and altitude are provided to every porter. The specific limits and the insurance provider must be confirmed by the client — this is a claim about how people are treated and it must not be approximate.',
  },
];

const TEAM = [
  {
    name: `${PLACEHOLDER_PREFIX} (Founder)`,
    role: 'Founder — replace before publishing',
    bio: 'This entry is placeholder development content. No such person works here. The name, role, biography and credentials must all be replaced with a real member of staff before this page is published — a team section is an experience and qualifications claim, and an invented one is a misrepresentation to someone deciding whether to trust this company with their safety.',
    credentials: ['REPLACE: real certification', 'REPLACE: real licence number'],
    languages: ['REPLACE'],
    displayOrder: 0,
  },
  {
    name: `${PLACEHOLDER_PREFIX} (Lead guide)`,
    role: 'Lead trekking guide — replace before publishing',
    bio: 'Placeholder development content. No such person works here. Replace with a real guide, their real certifications and the languages they actually speak.',
    credentials: ['REPLACE: real certification'],
    languages: ['REPLACE'],
    displayOrder: 1,
  },
  {
    name: `${PLACEHOLDER_PREFIX} (Operations)`,
    role: 'Operations and bookings — replace before publishing',
    bio: 'Placeholder development content. No such person works here. This is the person who answers inquiries, so the real name belongs beside the response-time promise as well.',
    credentials: [],
    languages: ['REPLACE'],
    displayOrder: 2,
  },
];

async function main() {
  const remove = process.argv.includes('--remove');

  await connectDB();

  const settings = await SiteSettings.findOne({ key: 'site' });

  if (!settings) {
    console.error('No SiteSettings document. Run scripts/seed.ts first.');
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  if (remove) {
    settings.longDescription = undefined;
    settings.commitments = [];
    settings.safetyPolicies = [];
    await settings.save();

    const deleted = await TeamMember.deleteMany({
      name: { $regex: '^PLACEHOLDER' },
    });

    console.log('Cleared the story, commitments and safety blocks.');
    console.log(`Deleted ${deleted.deletedCount} placeholder team members.`);
    await mongoose.disconnect();
    return;
  }

  // findOne → assign → save(), so the validators run and the _id is untouched.
  settings.longDescription = STORY;
  settings.commitments = COMMITMENTS.map((entry, index) => ({
    ...entry,
    displayOrder: index,
  }));
  settings.safetyPolicies = SAFETY.map((entry, index) => ({
    ...entry,
    displayOrder: index,
  }));

  await settings.save();

  /*
   * Read back with the raw driver, not through the model.
   *
   * `commitments` and `safetyPolicies` are new paths on an already-seeded
   * collection, and CLAUDE.md records what happens when an interface claims a
   * field the schema lacks: `strict` mode drops the write silently and reading
   * it back *through Mongoose* returns the value from the in-memory document,
   * proving nothing. `Model.collection.findOne` is the only check that means
   * anything here.
   */
  const stored = await SiteSettings.collection.findOne({ key: 'site' });

  const ok =
    Array.isArray(stored?.commitments) &&
    stored.commitments.length === COMMITMENTS.length &&
    Array.isArray(stored?.safetyPolicies) &&
    stored.safetyPolicies.length === SAFETY.length &&
    typeof stored?.longDescription === 'string';

  console.log(
    `SiteSettings: story ${typeof stored?.longDescription === 'string' ? 'written' : 'MISSING'}, ` +
      `${stored?.commitments?.length ?? 0} commitments, ` +
      `${stored?.safetyPolicies?.length ?? 0} safety blocks — verified on disk.`
  );

  if (!ok) {
    console.error(
      'WARNING: a field did not survive the write. Check the schema paths exist.'
    );
    process.exitCode = 1;
  }

  const existing = await TeamMember.countDocuments({
    name: { $regex: '^PLACEHOLDER' },
  });

  if (existing > 0) {
    console.log(
      `${existing} placeholder team members already present — left alone. Use --remove to reseed.`
    );
  } else {
    for (const member of TEAM) {
      await new TeamMember({ ...member, status: 'published' }).save();
    }
    console.log(`Created ${TEAM.length} placeholder team members.`);
  }

  console.log('');
  console.log('  ALL OF THIS IS PLACEHOLDER. The team members are named');
  console.log('  "PLACEHOLDER — NOT A REAL PERSON" and that text renders on the');
  console.log('  page. Replace every name, role, bio and credential before launch.');
  console.log('');
  console.log('  Still unset on purpose, because each would be an invented fact:');
  console.log('    foundingYear, registrationNumber, headlineStats,');
  console.log('    Affiliation.registrationNumber, team photos, yearsExperience');
  console.log('');
  console.log('  Remove it all with: scripts/seed-about.ts --remove');

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
