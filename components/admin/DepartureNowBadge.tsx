import { departureNowLabel, type DepartureNow } from '../../lib/bookingDeparture';

/**
 * Where an inquiry's departure stands **now** — shared by the inquiry list and
 * the inquiry detail, so the two say it in the same words and colours.
 *
 * Green only for "still available": the one state where the office can simply
 * say yes. Every state that means "offer another date" is red, because that is
 * the action it calls for. "Departed" is neither — nothing can be done about
 * a date that has passed, and it is not an error.
 */
export default function DepartureNowBadge({ now }: { now: DepartureNow }) {
  const tone =
    now.state === 'bookable'
      ? 'border-confirmed/30 bg-confirmed/10 text-confirmed'
      : now.state === 'departed'
        ? 'border-hairline bg-paper text-muted'
        : 'border-error/30 bg-error/5 text-error';

  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {departureNowLabel(now)}
    </span>
  );
}
