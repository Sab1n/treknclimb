'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { addDays, fromIsoDate } from '../../lib/departures';

/**
 * A month-grid calendar, shared across the public site and the admin.
 *
 * ## Where it is used, and where it is meant to be
 *
 * - **Trip page booking rail** (`components/content/TripBookingRail.tsx`) —
 *   departure dates generated from seasons, as marked days showing **state
 *   only**: available, full, closed or past. Only available days can be
 *   chosen, and choosing one *selects* it; the rail shows that date's range
 *   and price below the grid. Prices are never drawn in a cell — see
 *   `CalendarMark.note`.
 *   The inquiry form uses the same layer, through `DeparturePicker`.
 * - **Admin booking inquiries date filter**
 *   (`components/admin/InquiryDateRange.tsx`) — the chosen span highlighted,
 *   which is what `range` is for, with `unmarkedDays="selectable"` and
 *   `allowPast`, because every day is a valid bound and inquiries are, by
 *   definition, in the past. With `allowPast` a past day is not drawn or
 *   announced as past. Any further date picker builds on this rather than a
 *   second calendar; two would drift in keyboard handling and in how they
 *   treat dates, and the date handling is the part that is easy to get subtly
 *   wrong.
 *
 * ## Dates are `YYYY-MM-DD` strings throughout
 *
 * Every prop and callback deals in calendar-date strings, never `Date`. A
 * `Date` is an instant, and rendering one as a day means choosing a time zone
 * — the wrong choice moves a departure to the previous day for anyone west of
 * UTC. All arithmetic here is done in UTC on `YYYY-MM-DD` values, so the grid
 * is identical in every browser.
 *
 * `today` is a prop rather than `new Date()` inside the component, for the
 * same reason: the server renders this into static HTML, and a component that
 * read the clock during render would produce different markup on the server
 * and in the browser — a hydration mismatch on every day cell near midnight.
 * The caller decides whose "today" it is (the rail uses Pokhara's).
 *
 * ## Keyboard
 *
 * One Tab stop for the whole grid (a "roving tabindex"): the focused day has
 * `tabIndex=0`, every other day `-1`. Arrow keys move by day and week, Home and
 * End to the start and end of the week, Page Up and Page Down by month, and
 * moving off the visible month turns the page. Without this, a month where
 * every day is selectable — the admin filter — would be thirty Tab presses to
 * cross.
 *
 * Days that cannot be chosen are `aria-disabled` rather than `disabled`. A
 * `disabled` button is skipped by the keyboard and, in several screen readers,
 * not announced at all — and "12 October, Full" is exactly the information a
 * visitor needs to hear rather than have silently removed.
 */

export interface CalendarMark {
  /**
   * `available` renders green and can be chosen. `unavailable` is shown —
   * with its note — but cannot be. Full and closed departures are both
   * `unavailable`: shown as such, never hidden.
   */
  tone: 'available' | 'unavailable';
  /**
   * A short **state word** inside the cell — `Full`, `Closed`. Six characters
   * at most.
   *
   * Not a price. A price in every cell turns a month into a table of numbers
   * to compare, when what a visitor is doing is picking a date; and a figure
   * drawn in a 40-pixel cell is too small to read reliably anyway. The caller
   * shows the price once, for the date being chosen.
   */
  note?: string;
  /** Read after the date by a screen reader — "Available", "Full". */
  description: string;
}

export interface CalendarProps {
  /** Accessible name for the grid, e.g. "Group departure dates". */
  label: string;
  /** `YYYY-MM-DD`. Days before it are greyed. */
  today: string;
  /** Any `YYYY-MM-DD` in the month to open on. Defaults to `today`. */
  initialDate?: string;
  /** Per-date marks, keyed `YYYY-MM-DD`. */
  marks?: Record<string, CalendarMark>;
  /**
   * What a day with no mark does. `inert` for departures — only a departure
   * date means anything. `selectable` for a free date choice such as a range
   * filter.
   */
  unmarkedDays?: 'inert' | 'selectable';
  /** Whether days before `today` can be chosen. Off for departures. */
  allowPast?: boolean;
  /** Paging stops at these months (`YYYY-MM`), when given. */
  minMonth?: string;
  maxMonth?: string;
  /** A single chosen day. */
  selected?: string | null;
  /** A chosen span, inclusive at both ends. Endpoints and interior differ. */
  range?: { from: string; to: string } | null;
  onSelect?: (date: string) => void;
  /**
   * Called with `YYYY-MM` whenever the visible month changes — by the paging
   * buttons or by the keyboard moving off the edge. Not called on mount; the
   * caller already knows the month it opened on.
   */
  onMonthChange?: (month: string) => void;
}

const WEEKDAYS = [
  ['Mo', 'Monday'],
  ['Tu', 'Tuesday'],
  ['We', 'Wednesday'],
  ['Th', 'Thursday'],
  ['Fr', 'Friday'],
  ['Sa', 'Saturday'],
  ['Su', 'Sunday'],
] as const;

/*
 * `timeZone: 'UTC'` on both formatters is not a detail. The dates are UTC
 * midnights standing in for calendar days, so they must be *read back* in UTC
 * too, or the label says the 11th on a cell for the 12th.
 */
const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const dayLabelFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `YYYY-MM` of a `YYYY-MM-DD`. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The first day of the month `offset` months from `month`. */
function shiftMonth(month: string, offset: number): string {
  const date = fromIsoDate(`${month}-01`);

  date.setUTCMonth(date.getUTCMonth() + offset);

  return date.toISOString().slice(0, 7);
}

/**
 * Day `day` of `month`, clamped to the month's length — so Page Down from
 * 31 January lands on 28 February rather than rolling into March.
 */
function dayInMonth(month: string, day: number): string {
  const last = Number(addDays(`${shiftMonth(month, 1)}-01`, -1).slice(8, 10));

  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** 0 for Monday through 6 for Sunday. `getUTCDay` counts from Sunday. */
function weekdayIndex(date: string): number {
  return (fromIsoDate(date).getUTCDay() + 6) % 7;
}

/** The weeks of `month`, Monday first, with `null` for padding days. */
function weeksOf(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;

  const cells: (string | null)[] = Array(weekdayIndex(first)).fill(null);

  for (let day = first; day < next; day = addDays(day, 1)) cells.push(day);

  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];

  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return weeks;
}

export default function Calendar({
  label,
  today,
  initialDate,
  marks = {},
  unmarkedDays = 'inert',
  allowPast = false,
  minMonth,
  maxMonth,
  selected = null,
  range = null,
  onSelect,
  onMonthChange,
}: CalendarProps) {
  const [month, setMonth] = useState(monthOf(initialDate ?? selected ?? today));
  const [focused, setFocused] = useState(initialDate ?? selected ?? today);

  const gridRef = useRef<HTMLTableElement>(null);

  /*
   * Set only by the keyboard handler. Moving focus in an effect on every
   * change of `focused` would also fire on mount and on a click, pulling the
   * page's focus into the calendar when nobody asked for it.
   */
  const moveFocusAfterRender = useRef(false);

  const weeks = useMemo(() => weeksOf(month), [month]);

  const canGoBack = !minMonth || month > minMonth;
  const canGoForward = !maxMonth || month < maxMonth;

  useEffect(() => {
    if (!moveFocusAfterRender.current) return;

    moveFocusAfterRender.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
      ?.focus();
  }, [focused, month]);

  function isSelectable(date: string): boolean {
    if (!allowPast && date < today) return false;

    const mark = marks[date];

    if (mark) return mark.tone === 'available';

    return unmarkedDays === 'selectable';
  }

  /** The day that holds the Tab stop in the visible month. */
  const tabStop = monthOf(focused) === month ? focused : `${month}-01`;

  function moveTo(date: string) {
    const target = monthOf(date);

    if (minMonth && target < minMonth) return;
    if (maxMonth && target > maxMonth) return;

    moveFocusAfterRender.current = true;
    setFocused(date);

    if (target !== month) {
      setMonth(target);
      onMonthChange?.(target);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      Home: () => addDays(date, -weekdayIndex(date)),
      End: () => addDays(date, 6 - weekdayIndex(date)),
      PageUp: () => dayInMonth(shiftMonth(monthOf(date), -1), Number(date.slice(8))),
      PageDown: () => dayInMonth(shiftMonth(monthOf(date), 1), Number(date.slice(8))),
    };

    const move = moves[event.key];

    if (!move) return;

    // Arrow keys would otherwise scroll the page as well.
    event.preventDefault();
    moveTo(move());
  }

  function page(offset: number) {
    const target = shiftMonth(month, offset);

    setMonth(target);
    setFocused(dayInMonth(target, Number(focused.slice(8))));
    onMonthChange?.(target);
  }

  return (
    <div className="rounded-lg bg-white p-3 text-ink">
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() => page(-1)}
          disabled={!canGoBack}
          aria-label="Previous month"
          className="rounded-full px-2.5 py-1 text-lg leading-none transition-colors hover:bg-paper disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ‹
        </button>

        {/*
          A live region, so paging announces where you landed. Polite: it
          should wait for the button press to finish being read, not cut it off.
        */}
        <p aria-live="polite" className="font-display text-sm font-extrabold tracking-display">
          {monthFormatter.format(fromIsoDate(`${month}-01`))}
        </p>

        <button
          type="button"
          onClick={() => page(1)}
          disabled={!canGoForward}
          aria-label="Next month"
          className="rounded-full px-2.5 py-1 text-lg leading-none transition-colors hover:bg-paper disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ›
        </button>
      </div>

      <table ref={gridRef} aria-label={label} className="mt-2 w-full table-fixed border-collapse">
        <thead>
          <tr>
            {WEEKDAYS.map(([short, long]) => (
              <th
                key={long}
                scope="col"
                abbr={long}
                className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted"
              >
                {short}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {weeks.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((date, dayIndex) =>
                date === null ? (
                  <td key={`pad-${dayIndex}`} />
                ) : (
                  <td key={date} className="p-0.5">
                    <Day
                      date={date}
                      today={today}
                      /*
                       * "Past" is a state only where the past cannot be
                       * chosen. In the admin filter every inquiry is in the
                       * past, and greying the whole month — and reading
                       * "past" after every day — would say nothing.
                       */
                      past={!allowPast && date < today}
                      mark={marks[date]}
                      selectable={isSelectable(date)}
                      selected={selected === date}
                      range={range}
                      tabbable={date === tabStop}
                      onChoose={() => onSelect?.(date)}
                      onFocus={() => setFocused(date)}
                      onKeyDown={(event) => onKeyDown(event, date)}
                    />
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Day({
  date,
  today,
  past,
  mark,
  selectable,
  selected,
  range,
  tabbable,
  onChoose,
  onFocus,
  onKeyDown,
}: {
  date: string;
  today: string;
  past: boolean;
  mark: CalendarMark | undefined;
  selectable: boolean;
  selected: boolean;
  range: { from: string; to: string } | null;
  tabbable: boolean;
  onChoose: () => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const isEndpoint = !!range && (date === range.from || date === range.to);
  const inRange = !!range && date > range.from && date < range.to;

  /*
   * Precedence, highest first: chosen, in a range, past, marked, plain.
   * Past beats a mark on purpose — a departure whose date has gone renders
   * greyed like any other past day even if the page was generated before it
   * went, so a cached page can never offer yesterday as bookable.
   */
  const tone =
    selected || isEndpoint
      ? 'bg-ink text-paper'
      : inRange
        ? 'bg-ink/10 text-ink'
        : past
          ? 'text-muted/50'
          : mark?.tone === 'available'
            ? 'bg-confirmed/10 text-confirmed ring-1 ring-inset ring-confirmed/40 hover:bg-confirmed/20'
            : mark
              ? 'bg-paper text-muted'
              : selectable
                ? 'hover:bg-paper'
                : 'text-ink/70';

  const spoken = [
    dayLabelFormatter.format(fromIsoDate(date)),
    date === today ? 'today' : null,
    past ? 'past' : mark?.description,
    selected || isEndpoint ? 'selected' : inRange ? 'in selected range' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      data-date={date}
      tabIndex={tabbable ? 0 : -1}
      aria-label={spoken}
      aria-disabled={selectable ? undefined : true}
      aria-pressed={selectable ? selected || isEndpoint : undefined}
      onClick={selectable ? onChoose : undefined}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={`flex h-12 w-full flex-col items-center justify-center rounded text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marigold ${tone} ${
        selectable ? 'cursor-pointer' : 'cursor-default'
      } ${date === today && !selected && !isEndpoint ? 'font-bold underline underline-offset-2' : ''}`}
    >
      <span className="font-mono tabular leading-none">{Number(date.slice(8))}</span>
      {mark?.note && !past && (
        <span className="mt-1 font-mono text-[10px] leading-none tabular">
          {mark.note}
        </span>
      )}
    </button>
  );
}
