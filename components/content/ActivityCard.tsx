import Link from 'next/link';
import CloudinaryImage from '../ui/CloudinaryImage';
import { activityPath } from '../../lib/urls';
import { IActivityWithTripCount } from '../../lib/queries/destinations';
import { IDestination } from '../../models/Destination';

/**
 * One activity in the "start with the activity" grid. Only ever rendered for
 * destinations with `hasActivities`.
 *
 * The destination is passed in rather than read off the activity, because an
 * activity carries its destination as an unpopulated ObjectId and the URL
 * needs the slug.
 */
export default function ActivityCard({
  activity,
  destination,
}: {
  activity: IActivityWithTripCount;
  destination: Pick<IDestination, 'slug'>;
}) {
  return (
    <article className="group h-full overflow-hidden rounded-lg border border-hairline bg-white transition-shadow hover:shadow-md">
      <Link href={activityPath(activity, destination)} className="flex h-full flex-col">
        <div className="relative aspect-[3/2] overflow-hidden bg-hairline">
          <CloudinaryImage
            src={activity.coverImage}
            alt={activity.coverImageAlt}
            width={640}
            height={427}
            sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 100vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>

        <div className="flex flex-1 flex-col p-5">
          <h3 className="font-display text-lg font-extrabold tracking-display">
            {activity.name}
          </h3>

          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
            {activity.description}
          </p>

          <p className="mt-4 font-mono text-xs text-muted tabular">
            {activity.tripCount === 0
              ? 'Trips coming soon'
              : `${activity.tripCount} ${activity.tripCount === 1 ? 'trip' : 'trips'}`}
          </p>
        </div>
      </Link>
    </article>
  );
}
