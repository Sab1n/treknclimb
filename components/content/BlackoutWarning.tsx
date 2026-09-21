import type { BlackoutView } from '../../lib/departures';

/**
 * "We can't start a private trip on …" — shown when a private-trip date falls
 * in a blackout period.
 *
 * ## Where it is used
 *
 * - **Trip page booking rail**, private mode (`tone="dark"`).
 * - **Inquiry form**, private trip (`tone="light"`).
 *
 * A warning, not a block. The visitor may be flexible by a day or two, and an
 * inquiry the office can answer with "how about the 27th?" is worth more than
 * a form that refuses to send.
 *
 * `role="status"` rather than `alert`: it appears as a result of the visitor's
 * own input and should be read when they pause, not cut across what the
 * screen reader is saying about the field. The caller wires `id` to the date
 * input's `aria-describedby`.
 */

const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const shortDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/* UTC: these are calendar dates stored as UTC midnights. */
function format(value: string, formatter: Intl.DateTimeFormat): string {
  return formatter.format(new Date(`${value}T00:00:00.000Z`));
}

export default function BlackoutWarning({
  id,
  date,
  blackout,
  tone,
}: {
  id: string;
  date: string;
  blackout: BlackoutView;
  tone: 'dark' | 'light';
}) {
  return (
    <p
      id={id}
      role="status"
      className={`mt-2 rounded border border-marigold/50 bg-marigold/15 px-3 py-2 text-sm ${
        tone === 'dark' ? 'text-paper' : 'text-ink'
      }`}
    >
      We can&rsquo;t start a private trip on {format(date, longDate)}
      {blackout.reason ? <> &mdash; {blackout.reason}</> : null}. Dates from{' '}
      {format(blackout.start, shortDate)} to {format(blackout.end, longDate)} are
      unavailable. You can still send the inquiry and we&rsquo;ll suggest the
      nearest date that works.
    </p>
  );
}
