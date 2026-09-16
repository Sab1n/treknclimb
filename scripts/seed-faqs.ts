/**
 * Seeds placeholder FAQ entries so `/faq` and the destination pages render.
 *
 *   npx tsx --env-file=.env.local scripts/seed-faqs.ts
 *   npx tsx --env-file=.env.local scripts/seed-faqs.ts --remove
 *
 * ## Every entry is marked placeholder, deliberately
 *
 * CLAUDE.md is explicit that prototype content is placeholder and that no
 * specific value in it was supplied by the client. These answers are written to
 * be structurally realistic — the right length, the right tone, the right kind
 * of detail — so the pages can be judged as designs. **They are not the
 * client's policies and several contain figures nobody has confirmed.**
 *
 * `isPlaceholder: true` is written onto every document so they can be found and
 * removed with one query, and so nothing here can quietly survive into launch
 * as though it had been approved. The field is not on the `Faq` interface or
 * schema — which means Mongoose's `strict` mode would silently drop it, exactly
 * as CLAUDE.md records happening to `RejectedSubmission.form`. So these are
 * written through the **raw driver**, and read back to prove the flag is
 * actually on disk.
 *
 * That is also why removal matches on the flag rather than on the question
 * text: text gets edited, and an edited placeholder is the one that survives a
 * text-matched cleanup.
 *
 * ## An additive script, never `seed.ts --force`
 *
 * Per CLAUDE.md: `--force` deletes and recreates documents with new ObjectIds.
 * This inserts, and `--remove` deletes only what it inserted.
 */

import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import Faq from '../models/Faq';
import Destination from '../models/Destination';

interface Seed {
  question: string;
  answer: string;
  category?: string;
  /** Destination slug, or undefined for a sitewide entry. */
  destination?: string;
}

const SITEWIDE: Seed[] = [
  {
    category: 'Booking',
    question: 'Do I pay anything when I send an inquiry?',
    answer:
      'No. An inquiry costs nothing and commits you to nothing. We reply with a day-by-day plan and a final price, and only once you have approved that plan do we ask for a deposit.',
  },
  {
    category: 'Booking',
    question: 'How quickly will you reply?',
    answer:
      'Within one working day, and usually the same day. Nepal is UTC+5:45, so an inquiry sent from Europe in the evening is normally answered by the time you wake up.\n\nPLACEHOLDER — confirm the response-time promise with the client before launch. It should match the figure in SiteSettings.',
  },
  {
    category: 'Booking',
    question: 'Can I change the itinerary?',
    answer:
      'Yes. Every trip we list is a starting point. Adding a rest day, starting from a different town or extending at the end are all normal requests — tell us what you have in mind when you inquire and the plan we send back will reflect it.',
  },
  {
    category: 'Permits and paperwork',
    question: 'Do you arrange permits?',
    answer:
      'Yes, all of them. Trekking permits, conservation area fees and restricted-area permits where a route needs one are arranged by us and included in the price unless the trip page says otherwise.\n\nSome restricted areas need 21 days of lead time, so tell us your dates early if you are looking at one.\n\nPLACEHOLDER — confirm which permits are included as standard.',
  },
  {
    category: 'Permits and paperwork',
    question: 'Why do you ask for my nationality?',
    answer:
      'Because permit fees and visa rules differ by passport. SAARC nationals pay different rates for several Nepali permits, and on-arrival visa rules are not the same for everyone. We cannot give you an accurate price without it.',
  },
  {
    category: 'On the trail',
    question: 'How fit do I need to be?',
    answer:
      'For most of our treks, fit enough to walk five to seven hours on consecutive days carrying a daypack. You do not need technical skills or previous altitude experience for a standard trek. Peak climbing is different and each of those trips says what it expects.\n\nPLACEHOLDER — the client should confirm the daily-hours figure.',
  },
  {
    category: 'On the trail',
    question: 'What happens if I get altitude sickness?',
    answer:
      'Your guide watches for it from the first day above 3,000 m and will slow or stop the ascent long before it becomes serious. If symptoms do not settle, the answer is always to descend, and we will arrange it.\n\nInsurance covering helicopter evacuation above 4,000 m is a condition of joining any of our high-altitude trips.\n\nPLACEHOLDER — confirm the altitude threshold and the insurance requirement.',
  },
  {
    category: 'On the trail',
    question: 'How big are the groups?',
    answer:
      'Small. We cap most treks at twelve people, and many of our departures run with far fewer. If you would rather walk as a private group of two or three, that is available on every trip we list — say so when you inquire.\n\nPLACEHOLDER — confirm the group cap.',
  },
  {
    category: 'Money',
    question: 'Which currency are your prices in?',
    answer:
      'Prices are set in US dollars. You can switch the display to another currency on any trip page, but those figures are indicative — the rate moves, and the price we confirm when we reply is the one that holds.',
  },
  {
    category: 'Money',
    question: 'What is not included in the price?',
    answer:
      'International flights, your visa, travel insurance, and anything personal — drinks, laundry, tips. Each trip page lists what is and is not included for that specific route, and that list is the one that applies.',
  },
];

const BY_DESTINATION: Seed[] = [
  {
    destination: 'nepal',
    category: 'Permits and paperwork',
    question: 'Do I need a visa for Nepal, and can I get it on arrival?',
    answer:
      'Most nationalities can get a tourist visa on arrival at Kathmandu airport or at a land border. Bring passport photos and the fee in cash. A few passports need a visa in advance — tell us your nationality when you inquire and we will confirm which applies to you.\n\nPLACEHOLDER — confirm current fees and the list of exceptions before launch.',
  },
  {
    destination: 'nepal',
    category: 'Seasons',
    question: 'When is the best time to trek in Nepal?',
    answer:
      'October and November are the clearest and the busiest. March to May is nearly as good and brings the rhododendron in flower. The monsoon, June to September, is wet on most routes but is exactly when the rain-shadow regions north of the mountains are at their best.',
  },
  {
    destination: 'nepal',
    category: 'On the trail',
    question: 'Are Lukla flights really that unreliable?',
    answer:
      'They can be. Lukla is weather-dependent and cancellations happen, most often in the monsoon and in winter. We build buffer days into Everest-region itineraries for that reason, and we will tell you the realistic risk for your dates rather than the optimistic one.\n\nPLACEHOLDER — confirm how many buffer days are standard.',
  },
  {
    destination: 'india',
    category: 'Seasons',
    question: 'When can I trek in Ladakh?',
    answer:
      'June to September. Ladakh sits in the rain shadow of the Himalaya, so it stays dry and walkable through the months when Nepal is under monsoon — which is precisely why it is on this list.',
  },
  {
    destination: 'india',
    category: 'Permits and paperwork',
    question: 'Do I need an Indian visa in advance?',
    answer:
      'Yes. India has no visa on arrival for most nationalities, and the e-visa needs applying for before you travel. Some areas of Ladakh also need an Inner Line Permit, which we arrange.\n\nPLACEHOLDER — confirm which areas need the permit and whether it is included.',
  },
  {
    destination: 'tibet',
    category: 'Permits and paperwork',
    question: 'Can I travel independently in Tibet?',
    answer:
      'No. Tibet requires a Travel Permit and an organised itinerary with a licensed guide throughout — independent travel is not permitted. Your Chinese visa and the Tibet permit are separate documents and the permit takes time, so book earlier than you would for Nepal.\n\nPLACEHOLDER — confirm the current lead time.',
  },
  {
    destination: 'bhutan',
    category: 'Money',
    question: 'What is the daily fee in Bhutan?',
    answer:
      'Bhutan charges a Sustainable Development Fee per visitor per night, on top of the trip cost. It is set by the government rather than by us and it changes, so the figure we quote when you inquire is the one that applies to your dates.\n\nPLACEHOLDER — the current SDF figure has not been confirmed and is deliberately not stated here.',
  },
];

async function main() {
  const remove = process.argv.includes('--remove');

  await connectDB();

  if (remove) {
    const result = await Faq.collection.deleteMany({ isPlaceholder: true });
    console.log(`Removed ${result.deletedCount} placeholder FAQ entries.`);
    await mongoose.disconnect();
    return;
  }

  const existing = await Faq.collection.countDocuments({ isPlaceholder: true });

  if (existing > 0) {
    console.log(
      `${existing} placeholder entries are already present. Run with --remove first if you want to reseed.`
    );
    await mongoose.disconnect();
    return;
  }

  const destinations = await Destination.find()
    .select('slug')
    .lean<{ _id: mongoose.Types.ObjectId; slug: string }[]>()
    .exec();

  const bySlug = new Map(destinations.map((d) => [d.slug, d._id]));

  const documents = [...SITEWIDE, ...BY_DESTINATION].map((seed, index) => {
    if (seed.destination && !bySlug.has(seed.destination)) {
      throw new Error(
        `No destination with slug "${seed.destination}". Seed the destinations first.`
      );
    }

    return {
      question: seed.question,
      answer: seed.answer,
      category: seed.category,
      trip: null,
      destination: seed.destination ? bySlug.get(seed.destination)! : null,
      displayOrder: index,
      status: 'published',
      isPlaceholder: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    };
  });

  const result = await Faq.collection.insertMany(documents);

  /*
   * Read back through the raw driver, not through Mongoose. CLAUDE.md is
   * explicit: reading through the model can return the value you just set from
   * the in-memory document and prove nothing. `isPlaceholder` is not on the
   * schema, so this is the only way to know it survived the write — and if it
   * did not, `--remove` would match nothing and these would be permanent.
   */
  const stored = await Faq.collection.countDocuments({ isPlaceholder: true });

  console.log(`Inserted ${result.insertedCount} FAQ entries.`);
  console.log(
    `  ${SITEWIDE.length} sitewide, ${BY_DESTINATION.length} attached to a destination.`
  );
  console.log(`  isPlaceholder flag verified on disk for ${stored} of them.`);

  if (stored !== result.insertedCount) {
    console.error(
      '  WARNING: the flag did not survive the write. Remove these by hand.'
    );
  }

  console.log('\nEvery answer is placeholder copy. Several contain figures');
  console.log('nobody has confirmed — search the answers for PLACEHOLDER.');
  console.log('Remove them all with: scripts/seed-faqs.ts --remove');

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
