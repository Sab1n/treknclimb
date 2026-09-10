/**
 * ============================================================================
 * PLACEHOLDER DEVELOPMENT CONTENT — NOT CLIENT COPY. DO NOT SHIP.
 * ============================================================================
 *
 * Everything the homepage needs in order to render against real records rather
 * than empty states:
 *
 *   1. The SiteSettings conversion copy — hero headline, subheading, CTA
 *      label, risk reversal, office hours and the response-time promise, plus
 *      four value propositions.
 *   2. `featured: true` on three trips, so the featured section is
 *      editorially chosen rather than falling back to listing order.
 *   3. Three testimonials.
 *
 * **All of the copy below was written here, not supplied by Trek & Climb
 * Adventure.** The value propositions describe how the company plausibly
 * operates; the testimonials are invented people saying invented things. Both
 * must be replaced through the admin before launch. The risk-reversal line is
 * the exception — that wording is specified in CLAUDE.md.
 *
 * Deliberately NOT seeded, because each would be a fabricated fact rather than
 * placeholder prose:
 *
 *   - `headlineStats` — "3,800+ trekkers" is exactly the invented social proof
 *     the design rules forbid. Left empty; the hero omits the row.
 *   - `contactPersonName` / `contactPersonRole` — naming a member of staff who
 *     may not exist. Left empty; the CTA block omits the line.
 *   - Testimonial photos — there are no images to point at, and alt text is
 *     required whenever there is one.
 *   - Star ratings of any kind. Testimonials are display content, not a review
 *     system, and nothing here feeds `aggregateRating`.
 *
 * The testimonial names are invented people, which is the same class of thing
 * as the blog byline. They are marked in the quote attribution rather than the
 * name — a customer quote is a weaker claim than an author's credentials, and
 * three cards reading "PLACEHOLDER" would make the section impossible to
 * design against. **They are still fabricated and must be replaced.**
 *
 *   npx tsx --env-file=.env.local scripts/seed-homepage-content.ts
 *   npx tsx --env-file=.env.local scripts/seed-homepage-content.ts --force
 *
 * `--force` only re-writes the testimonials. It never deletes and recreates
 * the SiteSettings singleton or any trip, because both are referenced by
 * ObjectId elsewhere. Settings and featured flags are updated in place with
 * findOne → assign → save(), the convention for touching already-seeded
 * collections: additive, reversible, and the validators run on the way through.
 */

import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import SiteSettings from '../models/SiteSettings';
import Trip from '../models/Trip';
import Testimonial from '../models/Testimonial';

/** Trips to flag as featured, by slug. Three fills the homepage grid exactly. */
const FEATURED_SLUGS = [
  'everest-base-camp-trek',
  'island-peak-climbing',
  // A non-Nepal trip on purpose: the homepage must not read as a Nepal-only
  // operator when three of four destinations have no activity layer.
  'markha-valley-trek',
];

const VALUE_PROPOSITIONS = [
  {
    title: 'You are booking the operator',
    body: 'No agency in the middle. The people who answer your email are the people who run the trek, which is why the answers are specific.',
    displayOrder: 1,
  },
  {
    title: 'One price, permits included',
    body: 'The figure we quote covers permits, guide, porters, accommodation and the meals listed on the trip page. What is not included is written down, not discovered later.',
    displayOrder: 2,
  },
  {
    title: 'Itineraries built around acclimatisation',
    body: 'Rest days are where they are for a physiological reason, not to fill the calendar. It is the single biggest factor in whether you reach the top feeling well.',
    displayOrder: 3,
  },
  {
    title: 'Licensed, insured and registered',
    body: 'Registered with the Government of Nepal and members of TAAN and the Nepal Mountaineering Association. Our guides carry current wilderness first-aid certification.',
    displayOrder: 4,
  },
];

/** `tripSlug` is resolved to an ObjectId below; null means a general quote. */
const TESTIMONIALS = [
  {
    name: 'Hannah W.',
    country: 'United Kingdom — placeholder testimonial',
    tripSlug: 'everest-base-camp-trek',
    quote:
      'What convinced me was the reply to my first email. I asked what happens if someone in the group gets altitude sickness and got three paragraphs about their evacuation procedure, not a sales pitch. The trek was run exactly the way that email suggested it would be.',
    displayOrder: 1,
  },
  {
    name: 'Marc D.',
    country: 'France — placeholder testimonial',
    tripSlug: 'island-peak-climbing',
    quote:
      'I had never used crampons. The two training days before the summit push were unhurried and thorough, and by the time we were on the headwall the rope work felt ordinary. Nobody made me feel like a beginner.',
    displayOrder: 2,
  },
  {
    name: 'Priya R.',
    country: 'Singapore — placeholder testimonial',
    tripSlug: 'poon-hill-trek',
    quote:
      'We had five days and two teenagers and no idea what was realistic. They talked us out of the longer trek we had asked about and suggested this one instead, which was the right call and cost them money.',
    displayOrder: 3,
  },
];

async function seedHomepageContent() {
  const force = process.argv.includes('--force');

  await connectDB();

  /* ---------------- 1. SiteSettings ---------------- */

  /*
   * findOne → assign → save(), never findOneAndUpdate. Query middleware skips
   * pre('validate'), so an update through the query path would bypass any
   * document-level rule — including the conditional requirement that
   * contactPersonPhotoAlt exists whenever contactPersonPhoto does.
   */
  const settings = await SiteSettings.findOne({ key: 'site' });

  if (!settings) {
    throw new Error('No SiteSettings singleton found. Run scripts/seed.ts first.');
  }

  settings.heroHeadline =
    'Himalayan treks and climbs, run by the guides who walk them';
  settings.heroSubheading =
    'Nepal, India, Tibet and Bhutan. Send us your dates and we come back with a day-by-day itinerary and a final price. Nothing is booked by asking.';
  settings.heroCtaLabel = 'Get my free itinerary';
  // Specified wording, from CLAUDE.md. Not placeholder.
  settings.riskReversalText =
    'No payment now. Deposit only after you approve the plan.';
  settings.responseTimePromise =
    'Every inquiry answered within 24 hours, by a person';
  settings.officeHours = 'Office hours 9am–6pm Nepal time (UTC+5:45)';
  settings.valuePropositions = VALUE_PROPOSITIONS;

  await settings.save();
  console.log('Updated the SiteSettings singleton with placeholder homepage copy.');

  /* ---------------- 2. featured trips ---------------- */

  let flagged = 0;

  for (const slug of FEATURED_SLUGS) {
    const trip = await Trip.findOne({ slug });

    if (!trip) {
      console.warn(`  No trip with slug "${slug}" — skipped.`);
      continue;
    }

    trip.featured = true;
    // save() runs Trip's pre('validate') hook, so the Nepal/activity rule is
    // re-checked on the way through. Flipping one boolean cannot quietly write
    // a document that would fail validation.
    await trip.save();
    flagged += 1;
  }

  console.log(`Flagged ${flagged} trips as featured.`);

  /* ---------------- 3. testimonials ---------------- */

  const existing = await Testimonial.countDocuments();

  if (existing > 0 && !force) {
    console.log(
      `${existing} testimonials already exist — left alone. Re-run with --force to replace them.`
    );
  } else {
    if (existing > 0) {
      await Testimonial.deleteMany({});
      console.log(`Cleared ${existing} existing testimonials.`);
    }

    const documents = [];

    for (const testimonial of TESTIMONIALS) {
      const trip = await Trip.findOne({ slug: testimonial.tripSlug })
        .select('_id')
        .lean();

      if (!trip) {
        console.warn(
          `  No trip with slug "${testimonial.tripSlug}" — attaching the quote to no trip.`
        );
      }

      documents.push({
        name: testimonial.name,
        country: testimonial.country,
        quote: testimonial.quote,
        // Nullable, not optional: a testimonial that names no trip is a real
        // case, so the key is always present.
        trip: trip?._id ?? null,
        displayOrder: testimonial.displayOrder,
        status: 'published' as const,
      });
    }

    const inserted = await Testimonial.insertMany(documents);
    console.log(`Inserted ${inserted.length} placeholder testimonials.`);
  }

  await mongoose.disconnect();
  console.log(
    '\nDone. Every word of this is placeholder — the client replaces it in the admin.'
  );
}

seedHomepageContent().catch(async (error) => {
  console.error('Homepage content seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
