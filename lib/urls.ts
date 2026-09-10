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
