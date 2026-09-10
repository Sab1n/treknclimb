import Link from 'next/link';
import CloudinaryImage from '../ui/CloudinaryImage';
import { destinationPath } from '../../lib/urls';
import { IDestination } from '../../models/Destination';

/**
 * A compact destination tile for the homepage explorer.
 *
 * A third destination shape, deliberately. `DestinationCard` is a full-width
 * two-column row built to carry a paragraph on /destinations; four of those
 * stacked would be most of the homepage before a visitor reaches a single trip.
 * This one is an image with a name and a trip count — enough to choose from,
 * sized for a four-up grid.
 *
 * The caption sits on a gradient rather than directly on the photograph,
 * because the cover images come from the client and nothing guarantees a dark
 * enough corner for white text.
 */
export default function DestinationTile({
  destination,
  tripCount,
}: {
  destination: IDestination;
  tripCount: number;
}) {
  return (
    <Link
      href={destinationPath(destination)}
      className="group relative block overflow-hidden rounded-lg bg-hairline"
    >
      <CloudinaryImage
        src={destination.coverImage}
        alt={destination.coverImageAlt}
        width={640}
        height={800}
        sizes="(min-width: 1024px) 18rem, (min-width: 640px) 45vw, 100vw"
        className="aspect-[4/5] h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />

      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink via-ink/60 to-transparent"
      />

      <div className="absolute inset-x-0 bottom-0 p-5 text-paper">
        <h3 className="font-display text-xl font-extrabold tracking-display">
          {destination.name}
        </h3>

        <p className="mt-1 font-mono text-xs text-paper/70 tabular">
          {tripCount > 0
            ? `${tripCount} ${tripCount === 1 ? 'trip' : 'trips'}`
            : 'Ask us what we run here'}
          {destination.hasActivities && ' · trekking, climbing, hiking'}
        </p>
      </div>
    </Link>
  );
}
