import Link from 'next/link';
import CloudinaryImage from '../ui/CloudinaryImage';
import { tripPath } from '../../lib/urls';
import { ITripPopulated } from '../../models/Trip';
import { nepalToday, tripFromPrice } from '../../lib/departures';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * A trip card for listings.
 *
 * Takes `ITripPopulated` because the card shows the activity name and links to
 * a URL built from the destination and activity slugs — an unpopulated `ITrip`
 * only has their ObjectIds, and the compiler enforces that here.
 *
 * The price renders statically in USD. Client-side conversion comes later, so
 * the price sits in a fixed-min-width container now: when a longer string like
 * "NPR 185,000" replaces it after hydration, the card must not reflow.
 *
 * ## The "from" price is `tripFromPrice`, like everywhere else
 *
 * Not `trip.price`. The flat price is the admin's anchor, and it is not what
 * the trip page offers: a card reading $1,295 linking to a page reading $1,245
 * is the same trip quoted twice. One function decides the figure here, on the
 * page, in the /trips sort and in the `Offer` in structured data.
 *
 * `today` is Pokhara's date at the moment the listing was generated. A
 * departure passing can therefore make a card stale until the page
 * revalidates — an hour at most, and only ever by showing a price that is too
 * low, never too high.
 */
export default function TripCard({ trip, today = nepalToday() }: { trip: ITripPopulated; today?: string }) {
  const fromPrice = tripFromPrice(trip, today);

  return (
    <article className="group h-full overflow-hidden rounded-lg border border-hairline bg-white transition-shadow hover:shadow-md">
      <Link href={tripPath(trip)} className="flex h-full flex-col">
        <div className="relative aspect-[3/2] overflow-hidden bg-hairline">
          <CloudinaryImage
            src={trip.coverImage}
            alt={trip.coverImageAlt}
            width={640}
            height={427}
            sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 100vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />

          {trip.badge && (
            <span className="absolute left-3 top-3 rounded-full bg-marigold px-3 py-1 text-xs font-semibold text-ink">
              {trip.badge}
            </span>
          )}

          {trip.maxAltitudeM != null && (
            <span className="absolute bottom-3 right-3 rounded bg-ink/80 px-2 py-1 font-mono text-xs text-paper tabular">
              {trip.maxAltitudeM.toLocaleString('en-US')} m
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-5">
          {trip.activity && (
            <p className="text-xs uppercase tracking-wide text-muted">
              {trip.activity.name}
            </p>
          )}

          <h3 className="mt-1 font-display text-lg font-extrabold tracking-display">
            {trip.title}
          </h3>

          <p className="mt-2 font-mono text-sm text-muted tabular">
            {trip.durationDays} days · {trip.difficulty}
          </p>

          <div className="mt-4 flex flex-1 items-end justify-between gap-3">
            <p className="min-w-[7rem] font-mono text-lg font-semibold tabular">
              <span className="text-xs font-normal text-muted">from </span>
              {usd.format(fromPrice)}
              <span className="ml-1 text-xs font-normal text-muted">pp</span>
            </p>
            <span className="text-sm font-semibold underline-offset-4 group-hover:underline">
              View trip
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
