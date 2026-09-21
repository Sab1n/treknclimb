'use client';

import { useId, useState } from 'react';

import Calendar from '../ui/Calendar';

/**
 * The inquiry list's "received between" filter, on the shared calendar's
 * range mode.
 *
 * This is the use `components/ui/Calendar.tsx` was built for alongside the
 * trip page: the chosen span highlighted, every day choosable
 * (`unmarkedDays="selectable"`), and the past allowed — inquiries are all in
 * the past. One calendar for both, so the keyboard handling and the date
 * arithmetic cannot drift.
 *
 * ## Still a plain GET form underneath
 *
 * The list page's filter form needs no JavaScript to submit, and this keeps
 * it that way: the chosen bounds are two hidden inputs named `from` and `to`,
 * submitted with the form like the inputs they replace. The server parses and
 * validates them exactly as before (`parseInquiryFilters`), including the
 * swap of an inverted range — which this component cannot produce, but a
 * hand-edited URL can.
 *
 * ## Choosing a range
 *
 * First click sets the start, second sets the end; clicking a day before the
 * start makes it the start instead. Clicking the same day twice is a one-day
 * range. A third click begins a new range. The line above the grid says which
 * click is next, because a calendar that silently waits for a second click
 * looks broken after the first.
 */

const labelFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/* Calendar dates as UTC midnights, read back in UTC. */
function label(date: string): string {
  return labelFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

export default function InquiryDateRange({
  from: initialFrom,
  to: initialTo,
  today,
}: {
  /** `YYYY-MM-DD` or `''`, as parsed from the query string. */
  from: string;
  to: string;
  /**
   * Pokhara's date, from the server — the same day the filter bounds are
   * read in (`startOfNepalDay`). A prop rather than read here, so the server
   * render and hydration cannot disagree across midnight.
   */
  today: string;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [open, setOpen] = useState(false);

  const panelId = useId();

  function choose(date: string) {
    if (!from || to) {
      setFrom(date);
      setTo('');
    } else if (date < from) {
      setTo(from);
      setFrom(date);
    } else {
      setTo(date);
    }
  }

  const summary =
    from && to
      ? from === to
        ? label(from)
        : `${label(from)} – ${label(to)}`
      : from
        ? `From ${label(from)}`
        : to
          ? `Up to ${label(to)}`
          : 'Any date';

  /*
   * Only a start chosen: the server treats a lone `from` as "from then on",
   * which is what the summary says, so it is submitted as-is.
   */
  const range = from && to ? { from, to } : null;

  return (
    // `relative` so the panel can float over the table rather than push the
    // rest of the filter row down while it is open.
    <div className="relative">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />

      <p className="text-sm font-semibold" id={`${panelId}-label`}>
        Received
      </p>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-describedby={`${panelId}-label`}
        onClick={() => setOpen((current) => !current)}
        className="mt-1.5 flex min-w-56 items-center justify-between gap-3 rounded border border-hairline bg-white px-3 py-2 text-left text-sm"
      >
        <span className="font-mono tabular">{summary}</span>
        <span aria-hidden="true" className="text-muted">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute left-0 top-full z-20 mt-2 w-80 rounded-lg border border-hairline bg-white p-3 shadow-lg"
        >
          <p aria-live="polite" className="mb-2 text-sm text-muted">
            {!from || to ? 'Choose the first day.' : 'Now choose the last day.'}
          </p>

          <Calendar
            label="Inquiries received between"
            today={today}
            initialDate={to || from || today}
            unmarkedDays="selectable"
            allowPast
            // Nothing arrives in the future, so there is nothing to page to.
            maxMonth={today.slice(0, 7)}
            range={range}
            selected={range ? null : from || null}
            onSelect={choose}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              disabled={!from && !to}
              className="text-sm underline underline-offset-4 disabled:opacity-40 disabled:no-underline"
            >
              Clear dates
            </button>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold underline underline-offset-4"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
