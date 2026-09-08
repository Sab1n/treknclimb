import Link from 'next/link';
import CloudinaryImage from '../ui/CloudinaryImage';
import { destinationPath } from '../../lib/urls';
import { IDestination } from '../../models/Destination';

/**
 * A wide, horizontal destination card for the overview page.
 *
 * Separate from ActivityCard and TripCard rather than a variant of either.
 * Those are vertical, image-on-top cards sized for a three-up grid; this is a
 * full-width two-column row. Sharing one component across both shapes would
 * mean a layout prop that swaps almost every class, which is two components
 * wearing a trench coat.
 *
 * `reverse` alternates which side the image sits on down the list, so four
 * rows do not read as four identical bands. It only applies from `md` up —
 * below that everything stacks in DOM order, which puts the image first.
 */
export default function DestinationCard({
  destination,
  tripCount,
  reverse = false,
}: {
  destination: IDestination;
  tripCount: number;
  reverse?: boolean;
}) {
  return (
    <article className="group overflow-hidden rounded-lg border border-hairline bg-white transition-shadow hover:shadow-md">
      <Link
        href={destinationPath(destination)}
        className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'}`}
      >
        <div className="relative overflow-hidden bg-hairline md:w-1/2 lg:w-3/5">
          <CloudinaryImage
            src={destination.coverImage}
            alt={destination.coverImageAlt}
            width={960}
            height={640}
            sizes="(min-width: 1024px) 36rem, (min-width: 768px) 50vw, 100vw"
            className="aspect-[3/2] h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>

        <div className="flex flex-1 flex-col justify-center p-6 sm:p-8 lg:p-10">
          <h3 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
            {destination.name}
          </h3>

          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted sm:text-base">
            {destination.description}
          </p>

          <p className="mt-5 font-mono text-xs text-muted tabular">
            {tripCount > 0
              ? `${tripCount} ${tripCount === 1 ? 'trip' : 'trips'}`
              : 'Trips publishing soon — ask us what we run here'}
          </p>

          <p className="mt-4 text-sm font-semibold underline-offset-4 group-hover:underline">
            Explore {destination.name}
          </p>
        </div>
      </Link>
    </article>
  );
}
