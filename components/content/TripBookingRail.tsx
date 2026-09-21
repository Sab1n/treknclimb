'use client';

import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

import type { BookingRailDTO } from '../../types/dto';
import {
  blackoutOn,
  departureOnDate,
  generateDepartures,
  groupFromPrice,
  headlineFromPrice,
  nepalToday,
} from '../../lib/departures';
import { DeparturePicker, DepartureSummary, usd } from './DeparturePicker';
import BlackoutWarning from './BlackoutWarning';

/**
 * The trip page's inquiry rail: a choice between joining a group departure and
 * booking a private trip, each with its own "from" price.
 *
 * ## Two pricing paths that never collide
 *
 * A group departure has one price per person, set by its season (or by an
 * exception on that date). A private trip is priced by group size from the
 * tiers. The headline "from" is the lower of the two — the cheapest upcoming
 * *available* departure against the cheapest tier — and each option shows its
 * own figure, so a price is never shown without saying which way of travelling
 * it belongs to.
 *
 * With no upcoming departures there is nothing to join, and the rail shows the
 * private path alone. Full and closed departures *are* upcoming, so a trip
 * whose every date is full still offers the choice, and says so.
 *
 * ## The price is shown once, for the date being chosen
 *
 * The calendar cells show **state only** — available, full, closed, past.
 * Above the grid, one line gives the cheapest available price in the month on
 * screen. Clicking a date **selects** it rather than navigating away; the
 * summary below then shows that departure's date range and its price, and the
 * rail's button becomes "Continue with 13 October", which opens the inquiry
 * form with that departure — its `<season>:<date>` identity — chosen. A
 * price in every cell turned the month into a table of figures to compare,
 * when what a visitor is doing is picking a date.
 *
 * ## Why today is read twice
 *
 * The page is statically generated and cached for up to an hour, so the
 * server's "today" can be stale by the time someone reads it. The first render
 * must use the server's value — the markup has to match the HTML or React
 * reports a hydration mismatch — and every render after should use the
 * browser's own reading of Pokhara's date.
 *
 * `useSyncExternalStore` is built for that split: React uses
 * `getServerSnapshot` on the server **and during hydration**, and
 * `getSnapshot` from then on. The alternative — `useState` plus an effect
 * calling `setToday` — renders twice for nothing, and is what the lint rule
 * `react-hooks/set-state-in-effect` exists to catch. The clock notifies
 * nobody, so `subscribe` does nothing.
 *
 * ## What the links carry
 *
 * The rail hands the form a **choice**, not just a date: a group departure by
 * its identity (`?departure=<season>:<date>`), a private trip as
 * `?type=private` with the typed date if any. The form records group or
 * private as the visitor's choice; it never guesses one from a date.
 *
 * The month line, calendar, summary and blackout warning are shared with the
 * inquiry form — `DeparturePicker.tsx` and `BlackoutWarning.tsx`.
 */

/*
 * The dates are UTC midnights standing in for calendar days, so they are read
 * back in UTC — in any other zone the label can land on the previous day.
 */
const dayMonth = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

function formatDate(value: string, formatter: Intl.DateTimeFormat): string {
  return formatter.format(new Date(`${value}T00:00:00.000Z`));
}

/** The clock does not notify; see "Why today is read twice". */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * Where the rail's button goes. Group: the departure's identity. Private: the
 * choice itself, plus the date if one was typed. Neither: just the trip, and
 * the form asks.
 */
function contactHref(
  tripSlug: string,
  choice: { departure: string } | { type: 'private'; date: string } | null
): string {
  const params = new URLSearchParams({ trip: tripSlug });

  if (choice && 'departure' in choice) params.set('departure', choice.departure);

  if (choice && 'type' in choice) {
    params.set('type', choice.type);
    if (choice.date) params.set('date', choice.date);
  }

  return `/contact?${params.toString()}`;
}

export default function TripBookingRail({ rail }: { rail: BookingRailDTO }) {
  const today = useSyncExternalStore(
    subscribeToNothing,
    () => nepalToday(),
    () => rail.today
  );

  const departures = useMemo(
    () => generateDepartures(rail.seasons, rail.durationDays, today),
    [rail.seasons, rail.durationDays, today]
  );

  const groupFrom = groupFromPrice(departures);
  const headline = headlineFromPrice(groupFrom, rail.privateFrom);
  const hasGroupOption = departures.length > 0;

  const [choice, setChoice] = useState<'group' | 'private'>(
    hasGroupOption ? 'group' : 'private'
  );

  // If the last departure drops out after mount, the group option goes with it.
  const mode = hasGroupOption ? choice : 'private';

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  /*
   * Re-derived rather than stored, so a selection that stops being bookable —
   * the date passes while the page is open — simply stops being a selection
   * instead of offering a departure that no longer exists.
   */
  const selected = selectedDate ? departureOnDate(departures, selectedDate) : null;
  const chosen = selected?.status === 'available' ? selected : null;

  const [privateDate, setPrivateDate] = useState('');
  const blackout = privateDate ? blackoutOn(privateDate, rail.blackoutPeriods) : null;

  const choiceName = useId();
  const dateInputId = useId();
  const blackoutNoteId = useId();

  /*
   * The rail's single marigold button, and where it goes. One per viewport:
   * in group mode it asks about the trip generally until a date is chosen,
   * then becomes the way to continue with that date.
   */
  const cta =
    mode === 'private'
      ? {
          href: contactHref(rail.tripSlug, { type: 'private', date: privateDate }),
          label: 'Get a private quote',
        }
      : chosen
        ? {
            href: contactHref(rail.tripSlug, { departure: chosen.id }),
            label: `Continue with ${formatDate(chosen.date, dayMonth)}`,
          }
        : { href: contactHref(rail.tripSlug, null), label: 'Get my free itinerary' };

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-paper/60">From</p>
      {/*
        Fixed minimum width, per CLAUDE.md: the currency switcher will replace
        this figure client-side, and a price that changes width shifts the
        whole rail.
      */}
      <p className="mt-1 min-w-[7ch] font-mono text-4xl font-semibold tabular">
        {usd.format(headline)}
      </p>
      <p className="mt-1 text-sm text-paper/70">
        per person · {rail.durationDays} days
      </p>

      {/* ---------------- the choice ---------------- */}

      {hasGroupOption ? (
        <fieldset className="mt-5">
          <legend className="sr-only">How would you like to travel?</legend>

          <div className="grid grid-cols-2 gap-2">
            <ChoiceOption
              name={choiceName}
              value="group"
              checked={mode === 'group'}
              onChange={() => setChoice('group')}
              title="Join a group"
              price={groupFrom === null ? 'All full' : `from ${usd.format(groupFrom)}`}
            />
            <ChoiceOption
              name={choiceName}
              value="private"
              checked={mode === 'private'}
              onChange={() => setChoice('private')}
              title="Private trip"
              price={`from ${usd.format(rail.privateFrom)}`}
            />
          </div>
        </fieldset>
      ) : (
        <p className="mt-5 text-sm font-semibold">
          Private trip{' '}
          <span className="font-mono font-normal text-paper/70 tabular">
            · from {usd.format(rail.privateFrom)}
          </span>
        </p>
      )}

      {/* ---------------- group ---------------- */}

      {mode === 'group' && (
        <div className="mt-4">
          <DeparturePicker
            departures={departures}
            today={today}
            selected={chosen?.date ?? null}
            onSelect={setSelectedDate}
            tone="dark"
          />

          <div className="mt-4">
            <DepartureSummary
              departure={chosen}
              durationDays={rail.durationDays}
              tone="dark"
              empty="Choose a green date to see its dates and price."
            />
          </div>
        </div>
      )}

      {/* ---------------- private ---------------- */}

      {mode === 'private' && (
        <div className="mt-4">
          <p className="text-sm text-paper/70">
            Your own dates and your own group. The price per person depends on
            group size.
          </p>

          <label htmlFor={dateInputId} className="mt-3 block text-sm font-semibold">
            Preferred start date
          </label>
          <input
            id={dateInputId}
            type="date"
            min={today}
            value={privateDate}
            onChange={(event) => setPrivateDate(event.target.value)}
            aria-describedby={blackout ? blackoutNoteId : undefined}
            className="mt-1.5 w-full rounded border border-white/20 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-marigold"
          />

          {blackout && (
            <BlackoutWarning id={blackoutNoteId} date={privateDate} blackout={blackout} tone="dark" />
          )}
        </div>
      )}

      <Link
        href={cta.href}
        className="mt-5 block rounded-full bg-marigold px-6 py-3 text-center font-semibold text-ink transition-opacity hover:opacity-90"
      >
        {cta.label}
      </Link>
    </div>
  );
}

function ChoiceOption({
  name,
  value,
  checked,
  onChange,
  title,
  price,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  price: string;
}) {
  /*
   * Real radio inputs, visually hidden, with the label as the visible control:
   * arrow-key movement, the checked state announced and the group name read
   * from the legend, all for free.
   */
  return (
    <label
      className={`flex cursor-pointer flex-col rounded border px-3 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-marigold ${
        checked
          ? 'border-paper bg-paper text-ink'
          : 'border-white/20 text-paper hover:border-white/50'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="text-sm font-semibold">{title}</span>
      <span className={`font-mono text-xs tabular ${checked ? 'text-muted' : 'text-paper/60'}`}>
        {price}
      </span>
    </label>
  );
}
