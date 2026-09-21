'use client';

import { useState, type ReactNode } from 'react';

import Calendar, { type CalendarMark } from '../ui/Calendar';
import { departureOnDate, groupFromPrice, type Departure } from '../../lib/departures';
import { formatDepartureRange } from '../../lib/bookingDeparture';
import { DEPARTURE_STATUS_LABELS } from '../../models/shared/departures';

/**
 * Choosing a group departure: the "from $X this month" line, the calendar and
 * its legend — and, separately, the summary of the departure chosen.
 *
 * ## Where it is used
 *
 * - **Trip page booking rail** (`components/content/TripBookingRail.tsx`), on
 *   the ink rail — `tone="dark"`.
 * - **Inquiry form** (`components/forms/BookingForm.tsx`), on white —
 *   `tone="light"` — to change the departure a visitor arrived with, or pick
 *   one after choosing a trip there.
 *
 * Extracted when the form needed it, so the two cannot drift in how a month
 * is summarised, which cell stands for a date, or how a range is written.
 * The calendar itself is `components/ui/Calendar.tsx`; this is the departure
 * layer on top of it.
 *
 * ## State only in the cells, the price once
 *
 * See CLAUDE.md, "The calendar shows state, never price". The month line is
 * the only price above the grid; `DepartureSummary` shows the chosen
 * departure's own price.
 */

export const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

type Tone = 'dark' | 'light';

const TONES: Record<Tone, { muted: string; strong: string; box: string; past: string; closed: string }> = {
  dark: {
    muted: 'text-paper/70',
    strong: 'text-paper',
    box: 'border-white/15',
    past: 'bg-paper/15',
    closed: 'bg-paper/40',
  },
  light: {
    muted: 'text-muted',
    strong: 'text-ink',
    box: 'border-hairline bg-white',
    past: 'bg-hairline/60',
    closed: 'bg-hairline',
  },
};

/**
 * One mark per date, state only.
 *
 * Grouped by date first, then `departureOnDate` picks the one a cell stands
 * for — the same rule the summary uses, so the cell and the price below it
 * describe the same departure. (Overlapping seasons are now refused on save,
 * so this only matters for data written before that rule.)
 */
export function departureMarks(departures: Departure[]): Record<string, CalendarMark> {
  const byDate = new Map<string, Departure[]>();

  for (const departure of departures) {
    const list = byDate.get(departure.date) ?? [];
    list.push(departure);
    byDate.set(departure.date, list);
  }

  const marks: Record<string, CalendarMark> = {};

  for (const [date, list] of byDate) {
    const departure = departureOnDate(list, date);

    if (!departure) continue;

    marks[date] =
      departure.status === 'available'
        ? { tone: 'available', description: 'Available' }
        : {
            tone: 'unavailable',
            note: DEPARTURE_STATUS_LABELS[departure.status],
            description: DEPARTURE_STATUS_LABELS[departure.status],
          };
  }

  return marks;
}

export function DeparturePicker({
  departures,
  today,
  selected,
  onSelect,
  tone,
  label = 'Group departure dates',
}: {
  /** Generated, upcoming departures — `generateDepartures()` output. */
  departures: Departure[];
  today: string;
  /** The chosen departure's date, or null. */
  selected: string | null;
  onSelect: (date: string) => void;
  tone: Tone;
  label?: string;
}) {
  const colours = TONES[tone];

  const firstBookable =
    departures.find((departure) => departure.status === 'available') ?? departures[0];

  /*
   * Opens on the chosen date's month when there is one — "Change date" should
   * show the month of the date being changed — else the first bookable one.
   */
  const openOn = selected ?? firstBookable?.date ?? today;

  const [visibleMonth, setVisibleMonth] = useState(openOn.slice(0, 7));

  const monthFrom = groupFromPrice(departures, visibleMonth);
  const monthHasDepartures = departures.some((departure) =>
    departure.date.startsWith(visibleMonth)
  );

  return (
    <div>
      {/*
        Live, so paging to another month reads the new line out. It is the
        only place a price appears above the grid, and it is about the month
        on screen.
      */}
      <p aria-live="polite" className={`mb-2 text-sm ${colours.muted}`}>
        {monthFrom !== null ? (
          <>
            Group departures from{' '}
            <span className={`font-mono font-semibold tabular ${colours.strong}`}>
              {usd.format(monthFrom)}
            </span>{' '}
            this month.
          </>
        ) : monthHasDepartures ? (
          'Every group departure this month is full or closed.'
        ) : (
          'No group departures this month.'
        )}
      </p>

      <Calendar
        label={label}
        today={today}
        initialDate={openOn}
        minMonth={today.slice(0, 7)}
        maxMonth={departures[departures.length - 1]?.date.slice(0, 7)}
        marks={departureMarks(departures)}
        selected={selected}
        onSelect={onSelect}
        onMonthChange={setVisibleMonth}
      />

      <ul className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${colours.muted}`}>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-confirmed" />
          Available
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2.5 rounded-sm ${colours.closed}`} />
          Full or closed
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2.5 rounded-sm ${colours.past}`} />
          Past
        </li>
      </ul>
    </div>
  );
}

/**
 * The chosen departure: its dates, its length and its price — the one place
 * a departure's price is shown. `aria-live` so choosing a date reads them out
 * without the visitor having to go looking.
 *
 * `children` is the caller's actions: the form puts "Change date" and "Switch
 * to a private trip" there; the rail has none, because its button is the
 * rail's own.
 */
export function DepartureSummary({
  departure,
  durationDays,
  tone,
  heading,
  empty,
  children,
}: {
  departure: Pick<Departure, 'date' | 'endDate' | 'pricePerPerson'> | null;
  durationDays: number;
  tone: Tone;
  /** A small label above the dates — "Your departure". */
  heading?: string;
  /** What to say when nothing is chosen. */
  empty: ReactNode;
  children?: ReactNode;
}) {
  const colours = TONES[tone];

  return (
    <div aria-live="polite" className={`rounded border px-4 py-3 ${colours.box}`}>
      {departure ? (
        <>
          {heading && (
            <p className={`text-xs font-semibold uppercase tracking-wide ${colours.muted}`}>
              {heading}
            </p>
          )}
          <p className={`text-sm font-semibold ${heading ? 'mt-1' : ''} ${colours.strong}`}>
            {formatDepartureRange(departure.date, departure.endDate)}
          </p>
          <p className={`mt-1 text-sm ${colours.muted}`}>
            {durationDays} days ·{' '}
            <span className={`font-mono font-semibold tabular ${colours.strong}`}>
              {usd.format(departure.pricePerPerson)}
            </span>{' '}
            per person
          </p>
          {children}
        </>
      ) : (
        <p className={`text-sm ${colours.muted}`}>{empty}</p>
      )}
    </div>
  );
}
