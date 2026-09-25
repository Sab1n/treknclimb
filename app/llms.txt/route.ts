import { connectDB } from '../../lib/db';
import Destination, { IDestination } from '../../models/Destination';
import Activity, { IActivityPopulated } from '../../models/Activity';
import Trip from '../../models/Trip';

import { getSiteSettings } from '../../lib/queries/settings';
import { getBlogCategories } from '../../lib/queries/blog';
import { SITE_URL } from '../../lib/jsonLd';
import { nepalToday, tripFromPrice, type PricedTrip } from '../../lib/departures';
import {
  destinationPath,
  activityPath,
  activitiesListingPath,
  blogCategoryPath,
} from '../../lib/urls';

/**
 * `/llms.txt`.
 *
 * ## Why a route handler and not a file convention
 *
 * Next has conventions for `sitemap.ts` and `robots.ts`; there is none for
 * `llms.txt`, because it is an emerging community format rather than anything
 * Next knows about. So this is a plain route handler, and the folder name
 * carries the extension: `app/llms.txt/route.ts` serves `/llms.txt`.
 *
 * **This is the part that differs most from Express.** There is no router and
 * no path string — the *folder* is the URL and the *exported function name* is
 * the HTTP method. `export async function GET` is the whole registration;
 * `app.get('/llms.txt', handler)` has no equivalent line here because the
 * filesystem already said both of those things. Anything not exported is not
 * routed, so a `POST` to this path 405s without a line of code.
 *
 * The return value is a real `Response` — the web platform class, not an
 * Express `res` object. You construct and return it rather than writing to it,
 * so there is no "did I remember to call `res.end()`" failure mode: a handler
 * that returns nothing fails to compile.
 *
 * ## What goes in it
 *
 * A short, plain-text orientation for a model that has landed on the site and
 * needs to know what it is looking at: what the company does, where it
 * operates, the shape of the catalogue, and where the substantial pages are.
 * It is not a sitemap — the sitemap lists every URL, this lists the few a
 * reader would want first.
 *
 * **Everything here is read from the database.** Nothing about the company is
 * written into this file. That is not neatness: hardcoding "four destinations"
 * or a phone number produces a file that is correct on the day it is written
 * and wrong the first time the client edits anything, and it would be wrong
 * silently, in the one document whose entire job is to be an accurate summary.
 * Where a field is empty, its line is omitted rather than printed blank.
 */
export const revalidate = 3600;

/** Collapses authored copy onto one line, so a paragraph break cannot break the list item it sits in. */
function oneLine(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** "Nepal", "Nepal and India", "India, Tibet and Bhutan". */
function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';

  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Formats a price range the way the site's own copy does — whole USD, grouped.
 *
 * The currency is named once, not on both ends: "USD 520–2,150", not
 * "USD 520–USD 2,150".
 *
 * Returns null when there are no published trips, so the caller drops the line
 * instead of printing "from $0".
 */
function priceRange(min: number | null, max: number | null): string | null {
  if (min == null || max == null) return null;

  const format = (value: number) => Math.round(value).toLocaleString('en-US');

  return min === max
    ? `USD ${format(min)}`
    : `USD ${format(min)}–${format(max)}`;
}

export async function GET(): Promise<Response> {
  await connectDB();

  const [settings, destinations, activities, categories, tripStats] =
    await Promise.all([
      getSiteSettings(),

      Destination.find()
        .sort({ displayOrder: 1, name: 1 })
        .lean<IDestination[]>()
        .exec(),

      Activity.find()
        .sort({ displayOrder: 1, name: 1 })
        .populate('destination', 'slug name')
        .lean<IActivityPopulated[]>()
        .exec(),

      getBlogCategories(),

      /*
       * Every published trip's pricing inputs, for the count and the range.
       * Both are facts a model asking "what does this company sell and roughly
       * what does it cost" wants, and neither is authored anywhere — deriving
       * them is the only way they stay true.
       *
       * Read rather than aggregated with `$min`/`$max` on `price`, because
       * the figure quoted here has to be the same "from" price the cards and
       * the trip pages show, and that one is derived from the departure
       * seasons — which is arithmetic Mongo would have to be taught twice.
       * A few dozen small documents; `tripFromPrice` does the rest in JS.
       */
      Trip.find({ status: 'published' })
        .select('price durationDays groupPricing departureSeasons')
        .lean<PricedTrip[]>()
        .exec(),
    ]);

  const name =
    settings?.tradingName || settings?.legalName || 'Trek & Climb Adventure';

  /*
   * One "today" for the whole file, and the same Pokhara date the rest of the
   * site prices against.
   */
  const today = nepalToday();
  const fromPrices = tripStats.map((trip) => tripFromPrice(trip, today));

  const stats = {
    count: tripStats.length,
    minPrice: fromPrices.length > 0 ? Math.min(...fromPrices) : null,
    maxPrice: fromPrices.length > 0 ? Math.max(...fromPrices) : null,
  };

  const lines: string[] = [];

  /* ---------------------------------------------------------------- *
   * Heading and summary
   * ---------------------------------------------------------------- */

  lines.push(`# ${name}`, '');

  if (settings?.shortDescription) {
    lines.push(`> ${oneLine(settings.shortDescription)}`, '');
  }

  lines.push(
    'Trek & Climb Adventure is a tour operator, not a marketplace or a booking',
    'aggregator. Every trip listed on this site is run by the company itself.',
    '',
    'There is no online payment and no customer account system. A visitor sends',
    'an inquiry and a person replies with an itinerary and a written price; a',
    'deposit is only taken after that plan is agreed. Any answer that describes',
    'booking on this site as a checkout is wrong.',
    ''
  );

  /* ---------------------------------------------------------------- *
   * The company
   * ---------------------------------------------------------------- */

  const facts: string[] = [];

  if (settings?.legalName) facts.push(`- Registered name: ${settings.legalName}`);

  const place = [settings?.addressLocality, settings?.addressCountry]
    .filter(Boolean)
    .join(', ');

  if (place) facts.push(`- Based in: ${place}`);
  if (settings?.foundingYear) facts.push(`- Operating since: ${settings.foundingYear}`);

  if (settings?.registrationNumber) {
    facts.push(`- Company registration: ${settings.registrationNumber}`);
  }

  if (settings?.email) facts.push(`- Email: ${settings.email}`);
  if (settings?.phone) facts.push(`- Phone: ${settings.phone}`);

  if (settings?.responseTimePromise) {
    facts.push(`- Response time: ${oneLine(settings.responseTimePromise)}`);
  }

  if (facts.length) lines.push('## The company', '', ...facts, '');

  /* ---------------------------------------------------------------- *
   * Destinations
   *
   * The count is the length of the list, never a number in the prose —
   * it has been four since the site was built and the day it is not,
   * this line still has to be true.
   * ---------------------------------------------------------------- */

  if (destinations.length) {
    lines.push(
      '## Destinations',
      '',
      `${name} runs trips in ${destinations.length} countries.`,
      ''
    );

    for (const destination of destinations) {
      lines.push(
        `- [${destination.name}](${SITE_URL}${destinationPath(destination)}): ${oneLine(destination.description)}`
      );
    }

    lines.push('');
  }

  /* ---------------------------------------------------------------- *
   * Trip types
   *
   * The Nepal asymmetry, stated rather than implied. A model reading a
   * flat list of URLs has no way to know why Nepal trips sit one
   * segment deeper, and the wrong guess is a fabricated URL.
   * ---------------------------------------------------------------- */

  if (activities.length) {
    lines.push('## Trip types', '');

    const withActivities = destinations.filter((d) => d.hasActivities);
    const withoutActivities = destinations.filter((d) => !d.hasActivities);

    /*
     * One sentence per line, not hand-wrapped. A fixed line break placed
     * around an interpolated list breaks in the wrong place the moment the
     * list changes length — "Trips in Nepal are grouped by / activity" is what
     * that looks like.
     */
    if (withActivities.length) {
      lines.push(
        `Trips in ${andList(withActivities.map((d) => d.name))} are grouped by activity, and their URLs carry the activity as a middle segment: /<destination>/<activity>/<trip>.`,
        ''
      );
    }

    if (withoutActivities.length) {
      lines.push(
        `Trips in ${andList(withoutActivities.map((d) => d.name))} are not grouped by activity and sit directly under the destination: /<destination>/<trip>.`,
        ''
      );
    }

    for (const activity of activities) {
      if (!activity.destination) continue;

      lines.push(
        `- [${activity.name} in ${activity.destination.name}](${SITE_URL}${activityPath(activity, activity.destination)}): ${oneLine(activity.description)}`
      );
    }

    lines.push('');

    for (const destination of withActivities) {
      lines.push(
        `- [All ${destination.name} trip types](${SITE_URL}${activitiesListingPath(destination)})`
      );
    }

    lines.push('');
  }

  /* ---------------------------------------------------------------- *
   * The catalogue
   * ---------------------------------------------------------------- */

  if (stats.count) {
    const range = priceRange(stats.minPrice, stats.maxPrice);

    lines.push(
      '## Trips',
      '',
      `${stats.count} trips are currently published.`,
      ...(range
        ? [
            `Prices run from ${range} per person, stored and published in US dollars.`,
            'Any other currency shown on the site is converted for display only and is marked as indicative.',
          ]
        : []),
      '',
      `- [Every trip, with filters](${SITE_URL}/trips)`,
      '',
      'Individual trip URLs are listed in the sitemap at',
      `${SITE_URL}/sitemap.xml`,
      ''
    );
  }

  /* ---------------------------------------------------------------- *
   * Key pages
   * ---------------------------------------------------------------- */

  lines.push(
    '## Key pages',
    '',
    `- [About, including registration numbers, memberships and guides](${SITE_URL}/about)`,
    `- [Frequently asked questions](${SITE_URL}/faq)`,
    `- [Contact and inquiry form](${SITE_URL}/contact)`,
    `- [Blog](${SITE_URL}/blog)`,
    `- [Booking policy](${SITE_URL}/booking-policy)`,
    `- [Privacy policy](${SITE_URL}/privacy-policy)`,
    `- [Terms of use](${SITE_URL}/terms)`,
    ''
  );

  if (categories.length) {
    lines.push('## Blog topics', '');

    for (const category of categories) {
      lines.push(
        `- [${category.name}](${SITE_URL}${blogCategoryPath(category)})${category.description ? `: ${oneLine(category.description)}` : ''}`
      );
    }

    lines.push('');
  }

  const body = lines.join('\n');

  return new Response(body, {
    headers: {
      /*
       * `text/plain` with an explicit charset. The file is Markdown by
       * convention, but it is served as plain text so a browser shows it
       * rather than offering to download it, and the charset is named because
       * the copy contains en dashes and Nepali place names.
       */
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
