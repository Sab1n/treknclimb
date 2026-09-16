import { connectDB } from './db';
import Destination from '../models/Destination';
import Activity from '../models/Activity';
import Trip from '../models/Trip';
import BlogPost from '../models/BlogPost';
import BlogCategory from '../models/BlogCategory';

/**
 * Does this path resolve to a real page?
 *
 * ## Why this exists
 *
 * The redirect resolver only ever runs on a path that already 404'd, so the
 * *requested* URL is known dead. But following a chain walks through URLs
 * nobody asked for, and one of those can be live.
 *
 * That is not hypothetical — it was caught in testing. With rows
 * `/chain-c -> /nepal` and a stray `/nepal -> /india`, a request for
 * `/chain-a` resolved all the way to `/india`: the follower reached `/nepal`,
 * found a row whose `oldUrl` matched, and kept going. A visitor asking for an
 * old Nepal URL was sent to India.
 *
 * So the chain stops at the first hop that resolves to a page. "A redirect
 * whose `oldUrl` matches a live page must never fire" has to hold for
 * intermediate hops too, and for those it cannot be structural — it has to be
 * checked.
 *
 * ## Cost
 *
 * One or two indexed lookups, and **only while following a chain** — hop zero
 * is skipped because the caller already knows it is dead. Most redirects are a
 * single hop and never reach this at all.
 */

/**
 * Single-segment paths that are real pages with no database record behind them.
 *
 * These are static routes in `app/`, so nothing in Mongo would reveal them. The
 * list overlaps `RESERVED_SLUGS` heavily and is deliberately kept separate:
 * that list is about slugs an admin must not *choose*, this one is about paths
 * that already *serve*. They answer different questions and will drift apart —
 * `sitemap.xml` belongs here and not there.
 */
const STATIC_PATHS = new Set([
  '/',
  '/destinations',
  '/trips',
  '/blog',
  '/about',
  '/contact',
  '/faq',
  '/privacy-policy',
  '/terms',
  '/booking-policy',
  '/sitemap.xml',
  '/robots.txt',
  '/llms.txt',
]);

/**
 * Checks whether a path would render.
 *
 * Mirrors the routing rules rather than guessing: the same
 * `hasActivities` asymmetry that decides the URL shape decides which lookup to
 * make. Published-only, because a draft trip is not a live page — a redirect
 * pointing at one should keep following rather than dead-end on a 404.
 *
 * Errors resolve to `true`, which is the safe direction. A failed lookup that
 * returned `false` would let the chain walk on through a page that might be
 * live; returning `true` stops the chain early, and a redirect that stops one
 * hop short still lands somewhere real.
 */
export async function isLivePath(path: string): Promise<boolean> {
  const clean = path.split('?')[0].split('#')[0].toLowerCase();

  if (STATIC_PATHS.has(clean)) return true;

  const segments = clean.split('/').filter(Boolean);

  if (segments.length === 0 || segments.length > 3) return false;

  try {
    await connectDB();

    if (segments.length === 1) {
      const destination = await Destination.findOne({ slug: segments[0] })
        .select('_id')
        .lean();

      return !!destination;
    }

    if (segments.length === 2) {
      const [first, second] = segments;

      if (first === 'blog') {
        const post = await BlogPost.findOne({ slug: second, status: 'published' })
          .select('_id')
          .lean();

        return !!post;
      }

      const destination = await Destination.findOne({ slug: first })
        .select('_id hasActivities')
        .lean();

      if (!destination) return false;

      // `/nepal/activities` is a static segment beside the dynamic one.
      if (second === 'activities') return destination.hasActivities;

      if (destination.hasActivities) {
        const activity = await Activity.findOne({
          slug: second,
          destination: destination._id,
        })
          .select('_id')
          .lean();

        return !!activity;
      }

      /*
       * A destination without an activity layer holds trips directly. The
       * `activity: null` check matters: a Nepal trip must not be considered
       * live at `/nepal/<trip>`, because its canonical home is one level
       * deeper and the route 404s it there on purpose.
       */
      const trip = await Trip.findOne({
        slug: second,
        destination: destination._id,
        activity: null,
        status: 'published',
      })
        .select('_id')
        .lean();

      return !!trip;
    }

    // Three segments.
    const [first, second, third] = segments;

    if (first === 'blog' && second === 'category') {
      const category = await BlogCategory.findOne({ slug: third })
        .select('_id')
        .lean();

      return !!category;
    }

    const destination = await Destination.findOne({ slug: first })
      .select('_id hasActivities')
      .lean();

    if (!destination || !destination.hasActivities) return false;

    const activity = await Activity.findOne({
      slug: second,
      destination: destination._id,
    })
      .select('_id')
      .lean();

    if (!activity) return false;

    const trip = await Trip.findOne({
      slug: third,
      destination: destination._id,
      activity: activity._id,
      status: 'published',
    })
      .select('_id')
      .lean();

    return !!trip;
  } catch (error) {
    console.error(`[livePaths] Could not check ${path}:`, error);

    // The safe direction — see the note above.
    return true;
  }
}
