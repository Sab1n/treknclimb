import { ITripPopulated } from '../models/Trip';
import { IActivity } from '../models/Activity';
import { IDestination } from '../models/Destination';
import { IBlogPost } from '../models/BlogPost';
import { IBlogCategory } from '../models/BlogCategory';

/**
 * URL construction, in one place.
 *
 * The Nepal asymmetry decides the shape of a trip URL, so it is resolved here
 * rather than re-derived in every card, breadcrumb and link. A trip with an
 * activity sits under it; a trip without sits directly under its destination.
 *
 *   /nepal/trekking/everest-base-camp
 *   /bhutan/druk-path
 */
export function destinationPath(destination: Pick<IDestination, 'slug'>): string {
  return `/${destination.slug}`;
}

export function activityPath(
  activity: Pick<IActivity, 'slug'>,
  destination: Pick<IDestination, 'slug'>
): string {
  return `/${destination.slug}/${activity.slug}`;
}

/**
 * Takes a populated trip, because the URL needs the destination and activity
 * *slugs* — an unpopulated `ITrip` only carries their ObjectIds, so the
 * compiler will stop you calling this with one.
 */
export function tripPath(trip: ITripPopulated): string {
  const segments = [trip.destination.slug];

  if (trip.activity) segments.push(trip.activity.slug);

  segments.push(trip.slug);

  return `/${segments.join('/')}`;
}

/**
 * Blog URLs.
 *
 * `/blog/category/[slug]` and `/blog/[slug]` share a segment: `category` is a
 * static folder sitting beside the dynamic one, and Next resolves static
 * first. That works — unlike two *dynamic* siblings, which fail the build —
 * but it means a post slugged `category` would be permanently unreachable,
 * which is why `category` is on the reserved list.
 */
export function blogPostPath(post: Pick<IBlogPost, 'slug'>): string {
  return `/blog/${post.slug}`;
}

export function blogCategoryPath(
  category: Pick<IBlogCategory, 'slug'>
): string {
  return `/blog/category/${category.slug}`;
}

/**
 * The activity listing for a destination — `/nepal/activities`.
 *
 * `activities` is a static segment sitting beside the dynamic `[slug]`, and
 * Next resolves static first. That is also why `activities` is on the reserved
 * slug list: an activity slugged `activities` would build a page this route
 * permanently wins.
 */
export function activitiesListingPath(
  destination: Pick<IDestination, 'slug'>
): string {
  return `/${destination.slug}/activities`;
}

/**
 * The /trips listing, pre-filtered.
 *
 * **Only ever linked to from a page that has already done its own job.** An
 * activity page ranks for "trekking in Nepal" and carries the intro copy,
 * suitability and grades table; the filtered listing is where someone goes
 * *after* reading it, to compare options on price and duration. Linking cards
 * straight past the activity page to a filter state would orphan a page that
 * has its own metadata and canonical — and the filtered URL canonicals back to
 * plain `/trips`, so it cannot inherit the ranking either.
 *
 * The keys match `lib/tripFilters.ts` exactly, which is what makes the link
 * work with no code in between.
 */
export function filteredTripsPath(filters: {
  destination?: string;
  activity?: string;
  duration?: string;
  difficulty?: string;
  price?: string;
}): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }

  const query = params.toString();

  return query ? `/trips?${query}` : '/trips';
}
