/**
 * ============================================================================
 * PLACEHOLDER DEVELOPMENT CONTENT — NOT CLIENT COPY. DO NOT SHIP.
 * ============================================================================
 *
 * Four published posts across three categories, so the blog index, the post
 * page and the category archives render against real records instead of empty
 * states.
 *
 * **Every word below was written here, not by Trek & Climb Adventure.** The
 * geography is real and the advice is broadly sound, but none of it has been
 * checked by a guide, and the specifics — the acclimatisation figures, the
 * flight statistics, the permit details — are illustrative rather than
 * verified. All of it must be rewritten or replaced before launch.
 *
 * **The author is a placeholder, and it says so on the page.** `author`,
 * `authorRole` and `authorBio` exist for E-E-A-T: they are a claim that a named
 * person with stated experience stands behind the advice. A fabricated one is
 * a stronger misrepresentation than a placeholder price, because a reader may
 * act on it at altitude — so the byline reads "PLACEHOLDER AUTHOR" rather than
 * a plausible name. A plausible invented person is exactly the kind of thing
 * that survives to launch unnoticed; this one cannot.
 *
 * Left deliberately unset: nothing here invents a comment count, a share
 * count, or any other social proof.
 *
 *   npx tsx --env-file=.env.local scripts/seed-blog.ts
 *   npx tsx --env-file=.env.local scripts/seed-blog.ts --force
 *
 * Cloudinary IDs used are listed at the bottom of this file.
 */

import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import BlogPost, { IBlogPost } from '../models/BlogPost';
import BlogCategory from '../models/BlogCategory';
import Trip from '../models/Trip';

/**
 * The stand-in byline.
 *
 * Deliberately not a plausible name with plausible credentials. That version
 * existed here and was the wrong call: an invented guide with "twenty-two
 * seasons in the Khumbu" reads as real to everyone who sees it, survives
 * review unnoticed, and ends up on a live page making an experience claim
 * about advice people act on at altitude.
 *
 * This version is impossible to miss on the page itself, which is where it
 * needs to be caught — not in a file header nobody opens.
 */
const PLACEHOLDER_AUTHOR = {
  author: 'PLACEHOLDER AUTHOR',
  authorRole: 'Replace with a real staff member before publishing.',
  authorBio:
    'This byline is placeholder development content. No such person works here. Author name, role and credentials must be replaced with a real member of staff before this post is published — the author box is an experience claim, and an invented one is a misrepresentation.',
};

/**
 * What a seed literal supplies. Refs are resolved from slugs below and
 * everything the schema defaults is stripped out.
 */
type PostSeed = Omit<
  IBlogPost,
  | '_id'
  | 'createdAt'
  | 'updatedAt'
  | 'slugHistory'
  | 'noIndex'
  | 'category'
  | 'relatedTrips'
> & {
  categorySlug: string;
  /** Admin-selected in real use; resolved from slugs here. */
  relatedTripSlugs: string[];
};

/** Days ago, as a date. Keeps the seeded posts looking recent whenever it runs. */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(9, 0, 0, 0);
  return date;
}

const posts: PostSeed[] = [
  {
    title: 'Altitude sickness: what our guides actually watch for',
    slug: 'altitude-sickness-what-guides-watch-for',
    categorySlug: 'travel-tips',
    excerpt:
      'Every guide we employ has turned a group around at some point. It is the least popular decision in the job and the only one that matters.',
    body: `Every guide we employ has turned a group around at some point. It is the least popular decision in the job and the only one that matters. Here is what we watch for, and what you should tell us even when you would rather not.

## The three-symptom rule

Acute mountain sickness usually starts as a headache that paracetamol does not fully clear, plus any one of nausea, dizziness, unusual breathlessness at rest, or broken sleep. One symptom on its own is common and normally resolves. **Two or more that persist through a rest day is our threshold for descent.**

The reason we ask about sleep every single morning is that poor sleep is the earliest reliable signal, and the one people dismiss as jet lag or an uncomfortable teahouse mattress.

## Why our itineraries look slower

A short Everest Base Camp itinerary exists and plenty of operators sell it. It works for most people. Our longer version adds acclimatisation days lower down, and those days are the difference between reaching base camp and being evacuated from below it.

Two days is a small price. We will not cut them to save time, and if that makes a quote look expensive next to someone else's, this is why.

## What we carry

- A pulse oximeter, checked every evening above 3,500 m
- Acetazolamide, for guide-supervised use only
- A satellite phone on restricted-area routes
- Evacuation contacts arranged with your insurer before departure

## The descent rule

Descent is the only reliable treatment. Oxygen and medication buy time to descend; they are not a substitute for it.

> If a guide calls it, the group does not vote.

That sounds blunt written down. On the mountain it is the single clause that keeps everyone safe, and it has never once been the wrong call.`,
    featuredImage: 'treknclimb/blog/altitude-sickness',
    featuredImageAlt:
      'A guide checking a trekker with a pulse oximeter outside a teahouse at dusk',
    readTimeMinutes: 7,
    publishedAt: daysAgo(12),
    status: 'published',
    ...PLACEHOLDER_AUTHOR,
    // The trips where acclimatisation planning matters most.
    relatedTripSlugs: [
      'everest-base-camp-trek',
      'island-peak-climbing',
      'annapurna-base-camp-trek',
    ],
    metaTitle: 'Altitude Sickness on a Himalayan Trek: What Guides Watch For',
    metaDescription:
      'The symptoms our guides check for daily, why acclimatisation days matter, and the descent rule that overrides everything else.',
  },

  {
    title: 'Annapurna Base Camp or Poon Hill: which one fits the week you have',
    slug: 'annapurna-base-camp-or-poon-hill',
    categorySlug: 'trekking-guides',
    excerpt:
      'They start from the same road head and they are not the same trek. The honest answer usually comes down to how many days you actually have.',
    body: `These two get compared constantly, usually by people who have done neither. They start from broadly the same place and they are genuinely different trips.

## The short version

- **Poon Hill** if you have under a week, are travelling with people of mixed fitness, or want a first taste of the Himalaya without altitude being a factor.
- **Annapurna Base Camp** if you have ten days or more and want to stand inside the sanctuary with the ridge closing around you.

## What the extra days buy

Poon Hill tops out low enough that altitude is not really in play. You walk through rhododendron forest and terraced hillsides, sleep in comfortable lodges, and get one of the best sunrise viewpoints in Nepal.

Annapurna Base Camp goes considerably higher and into a glacial amphitheatre. The scenery changes character completely in the last two days — that is the part people remember, and it is the part you cannot compress.

## Fitness, honestly

Neither is technical. Both involve long days of stone staircases, which is harder on the knees than the altitude is on the lungs. If you can walk five to six hours on consecutive days at home, you can do either.

## What we would ask you

How many days you have, whether anyone in the group has been to altitude before, and which month you are coming. Those three answers usually settle it in one email.`,
    featuredImage: 'treknclimb/blog/abc-or-poon-hill',
    featuredImageAlt:
      'Stone staircase trail climbing through rhododendron forest in the Annapurna foothills',
    readTimeMinutes: 6,
    publishedAt: daysAgo(26),
    status: 'published',
    ...PLACEHOLDER_AUTHOR,
    relatedTripSlugs: ['annapurna-base-camp-trek', 'poon-hill-trek'],
    metaTitle: 'Annapurna Base Camp vs Poon Hill: How to Choose',
    metaDescription:
      'Duration, altitude, fitness and scenery compared, so you can pick the Annapurna trek that fits the time you actually have.',
  },

  {
    title: 'Ladakh in the monsoon months: why July works',
    slug: 'ladakh-in-the-monsoon-months',
    categorySlug: 'destination-guides',
    excerpt:
      'When Nepal is unwalkable, the rain shadow north of the Himalaya is at its best. It is the most useful thing to know about planning a summer trek.',
    body: `Nepal in July is hot, leech-ridden and often cloud-covered, and the flights that matter get cancelled. This is the single most common reason people give up on a summer trip.

They should be looking at Ladakh instead.

## The rain shadow

The main Himalayan range takes the monsoon out of the air before it reaches the Tibetan plateau. North of that barrier, July and August are dry, clear and warm during the day — the opposite of the picture two hundred kilometres south.

That makes Ladakh the sensible answer for anyone whose only free weeks are in the northern summer.

## What it is actually like

High desert. Barley fields and poplars along the rivers, and bare ochre rock everywhere else. Monasteries built into cliffs. Villages where a homestay is a room in someone's house and dinner is whatever the family is eating.

It looks nothing like Nepal, and people who expect a Nepali trek in a different country are always surprised.

## Altitude comes first here

Leh sits high enough that you feel it stepping off the plane, and the trails go higher. **Two full days in Leh before walking is not optional**, and we build them into every itinerary regardless of how tight your dates are.

## Permits

Inner Line Permits are needed for several areas and we arrange them. They are issued against your passport and nationality, which is why we ask for it on the inquiry form.`,
    featuredImage: 'treknclimb/blog/ladakh-monsoon',
    featuredImageAlt:
      'Barley fields and poplar trees below bare ochre mountains in the Indus valley, Ladakh',
    readTimeMinutes: 8,
    publishedAt: daysAgo(41),
    status: 'published',
    ...PLACEHOLDER_AUTHOR,
    relatedTripSlugs: ['markha-valley-trek'],
    metaTitle: 'Trekking Ladakh in July and August: The Monsoon Rain Shadow',
    metaDescription:
      'Why the Indian Himalaya is dry when Nepal is not, what Ladakh is actually like, and how much acclimatisation you need in Leh.',
  },

  {
    title: 'Lukla flights: how the cancellations really work',
    slug: 'lukla-flights-how-cancellations-work',
    categorySlug: 'trekking-guides',
    excerpt:
      'Not if, but when. Building slack into your dates is cheaper and less stressful than any of the alternatives once you are already delayed.',
    body: `If you are flying to Lukla, plan for a delay. Not because it always happens, but because when it does, the people who built in a spare day carry on with their trek and the people who did not miss an international connection.

## Why it happens

Lukla is flown visually. There is no instrument approach, the strip is short and sloped, and the weather at both ends has to be workable at the same time in a narrow morning window. Cloud in the Khumbu or in Kathmandu is enough to stop the day.

Afternoons are almost never flyable, so a missed morning is usually a missed day.

## What we do about it

- **We build spare days into the itinerary**, at the end rather than the start
- We book the earliest slots, which are the most likely to go
- We hold a helicopter option and will tell you honestly what it costs
- Your guide is in Kathmandu with you, not waiting in Lukla

## The helicopter question

A shared charter is the usual fallback and it is not cheap. Some insurance policies cover it when the delay is long enough; most do not cover it merely for convenience. We will tell you which yours is before you decide, not after.

## What to do on your side

Leave at least two days between coming off the trail and your international flight. If nothing goes wrong you get two days in Kathmandu, which is not a punishment.`,
    featuredImage: 'treknclimb/blog/lukla-flights',
    featuredImageAlt:
      'Small twin-engine aircraft on the sloped runway at Lukla with cloud on the surrounding ridges',
    readTimeMinutes: 6,
    publishedAt: daysAgo(58),
    status: 'published',
    ...PLACEHOLDER_AUTHOR,
    relatedTripSlugs: ['everest-base-camp-trek', 'island-peak-climbing'],
    metaTitle: 'Lukla Flight Cancellations: How They Work and How to Plan',
    metaDescription:
      'Why Lukla flights get cancelled, what a helicopter fallback really costs, and how many spare days to build into your dates.',
  },
];

async function seedBlog() {
  const force = process.argv.includes('--force');

  await connectDB();

  const existing = await BlogPost.countDocuments();

  if (existing > 0 && !force) {
    console.log(
      `${existing} blog posts already exist — left alone. Re-run with --force to replace them.`
    );
    await mongoose.disconnect();
    return;
  }

  if (existing > 0) {
    await BlogPost.deleteMany({});
    console.log(`Cleared ${existing} existing posts.`);
  }

  const categories = await BlogCategory.find().select('_id slug name').lean();

  if (categories.length === 0) {
    throw new Error('No blog categories found. Run scripts/seed.ts first.');
  }

  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  const trips = await Trip.find().select('_id slug').lean();
  const tripBySlug = new Map(trips.map((t) => [t.slug, t]));

  const documents = posts.map((post) => {
    const { categorySlug, relatedTripSlugs, ...rest } = post;

    const category = categoryBySlug.get(categorySlug);
    if (!category) {
      throw new Error(`No blog category with slug "${categorySlug}".`);
    }

    const relatedTrips = relatedTripSlugs.map((slug) => {
      const trip = tripBySlug.get(slug);
      if (!trip) {
        throw new Error(
          `No trip with slug "${slug}" — run scripts/seed-trips.ts first.`
        );
      }
      return trip._id;
    });

    return { ...rest, category: category._id, relatedTrips };
  });

  /*
   * insertMany skips save middleware but DOES validate — it calls $validate()
   * on every document, so the path validators run, including the reserved-slug
   * check on `slug`. BlogPost has no pre('validate') hook, so there is no extra
   * round trip per document here the way there is when seeding trips.
   */
  const inserted = await BlogPost.insertMany(documents);

  console.log(`Inserted ${inserted.length} placeholder posts:`);
  for (const post of inserted) {
    const category = categories.find((c) => c._id.equals(post.category));
    console.log(
      `  ${post.slug}  →  ${category?.name}  (${post.relatedTrips.length} related trips)`
    );
  }

  const empty = categories.filter(
    (category) =>
      !documents.some((document) => document.category.equals(category._id))
  );

  if (empty.length > 0) {
    console.log(
      `\nCategories left with no posts (their archives render the empty state): ${empty
        .map((c) => c.name)
        .join(', ')}`
    );
  }

  await mongoose.disconnect();
  console.log(
    '\nDone. Placeholder content, and the byline reads PLACEHOLDER AUTHOR on the page. Replace both before launch.'
  );
}

seedBlog().catch(async (error) => {
  console.error('Blog seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});

/*
 * ============================================================================
 * CLOUDINARY PUBLIC IDs USED
 * ============================================================================
 *
 *   treknclimb/blog/altitude-sickness
 *   treknclimb/blog/abc-or-poon-hill
 *   treknclimb/blog/ladakh-monsoon
 *   treknclimb/blog/lukla-flights
 *
 * Prefixed `treknclimb/blog/<slug>` per the Cloudinary convention in
 * CLAUDE.md. Until these are uploaded, CloudinaryImage renders its alt-text
 * placeholder rather than failing.
 * ============================================================================
 */
