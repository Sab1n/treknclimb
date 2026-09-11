'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

import type { ActivityComparisonRow } from '../../types/dto';

/**
 * Activities side by side, sortable.
 *
 * ## Every column is derived
 *
 * All four come from one `$group` over the activity's published trips — see
 * `getActivityStats`. Nothing here is a field an admin has to remember to fill
 * in, which is the point: a comparison built from authored columns is a
 * comparison that goes stale silently, one activity at a time, and reads as
 * confident data while being wrong.
 *
 * There was a fifth column, technical skill, and it was the only authored one.
 * That information now lives in the activity's `description` on the card, as
 * prose — "rope, crampons and an ice axe" is a sentence someone reads, not an
 * enum someone maintains.
 *
 * All four describe the routes **currently published** under an activity, so
 * they move as the catalogue does. The caption under the table says so.
 *
 * ## Sorting
 *
 * A Client Component for exactly this reason, which is why the rows arrive as
 * `ActivityComparisonRow` DTOs rather than Mongoose documents.
 *
 * Each column carries a **sort key alongside its display string**. Sorting on
 * the rendered text would order "11–14 days" after "5 days", and fitness
 * alphabetically — "Challenging, Easy, Extreme, Moderate" — which is worse than
 * not sorting at all because it looks deliberate.
 *
 * Rows with no published trips have `null` keys and sort **last in both
 * directions**. An unknown is not a small value, and burying the empty rows at
 * the bottom is what someone scanning the table actually wants either way.
 *
 * ## Sticky header, and the CSS trap under it
 *
 * The wrapper is `overflow-auto` with a `max-h`, not `overflow-x-auto`.
 *
 * That is not a style preference. `overflow-x: auto` with a visible y axis
 * computes `overflow-y` to `auto` as well, which makes the wrapper a scroll
 * container — and `position: sticky` resolves against the nearest scroll
 * container, not the viewport. So `sticky top-0` inside an `overflow-x-auto`
 * div sticks to a box that never scrolls vertically, and silently does nothing.
 * Giving the wrapper a height it can actually scroll within is what makes the
 * header stick at all.
 *
 * At four rows the table is shorter than the cap, so nothing scrolls and the
 * sticky header is inert — correct, and invisible. At twenty it earns itself.
 *
 * ## Past about twenty rows
 *
 * **The next move is grouping, not more sorting.** Sorting twenty rows by
 * altitude is still readable; sorting sixty means scrolling a wall of numbers
 * looking for the boundary between two kinds of thing. At that point the
 * answer is a grouped table — by technical character, by region, by whatever
 * the client has actually accumulated — with each group sorted within itself,
 * or splitting the taxonomy so a destination never carries sixty activities.
 * Not built, and it should not be built until the shape of the excess is known.
 */

type SortKey = 'name' | 'altitude' | 'length' | 'fitness' | 'tripCount';
type Direction = 'asc' | 'desc';

interface Column {
  key: SortKey;
  label: string;
  /** Numeric columns right-align and use tabular figures. */
  numeric: boolean;
  /** The direction a first click should apply. */
  initialDirection: Direction;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Activity', numeric: false, initialDirection: 'asc' },
  // Altitude, length and fitness default to descending: the interesting end of
  // each is the top, and "show me the hardest first" is the question people
  // actually arrive with.
  { key: 'altitude', label: 'Altitude', numeric: true, initialDirection: 'desc' },
  { key: 'length', label: 'Typical length', numeric: true, initialDirection: 'desc' },
  { key: 'fitness', label: 'Fitness', numeric: false, initialDirection: 'desc' },
  { key: 'tripCount', label: 'Trips', numeric: true, initialDirection: 'desc' },
];

function sortValue(row: ActivityComparisonRow, key: SortKey): number | string | null {
  switch (key) {
    case 'name':
      return row.name;
    case 'altitude':
      return row.sortAltitude;
    case 'length':
      return row.sortLength;
    case 'fitness':
      return row.sortFitness;
    case 'tripCount':
      return row.tripCount;
  }
}

export default function ActivityComparison({
  rows,
  destinationName,
}: {
  rows: ActivityComparisonRow[];
  destinationName: string;
}) {
  /**
   * `null` means "as the admin ordered them", which is the honest default —
   * display order is an editorial decision and the table should not silently
   * override it before anyone has clicked anything.
   */
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction } | null>(
    null
  );

  const sorted = useMemo(() => {
    if (!sort) return rows;

    const factor = sort.direction === 'asc' ? 1 : -1;

    return [...rows].sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);

      // Nulls last regardless of direction — see the note above.
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;

      if (typeof left === 'string' && typeof right === 'string') {
        return left.localeCompare(right) * factor;
      }

      return ((left as number) - (right as number)) * factor;
    });
  }, [rows, sort]);

  function toggle(column: Column) {
    setSort((current) =>
      current?.key === column.key
        ? {
            key: column.key,
            direction: current.direction === 'asc' ? 'desc' : 'asc',
          }
        : { key: column.key, direction: column.initialDirection }
    );
  }

  if (rows.length < 2) return null;

  return (
    <div className="max-h-128 overflow-auto rounded-lg border border-hairline bg-white">
      <table className="w-full min-w-2xl border-collapse text-left text-sm">
        <caption className="sr-only">
          {destinationName} activities compared by altitude, typical length,
          fitness required and number of trips. Column headers sort the table.
        </caption>

        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const active = sort?.key === column.key;

              return (
                <th
                  key={column.key}
                  scope="col"
                  /*
                    `aria-sort` on the header cell is what tells a screen reader
                    the table is sorted and by which column — the arrow glyph is
                    decorative and announces nothing.
                  */
                  aria-sort={
                    active
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className={`sticky top-0 z-10 border-b border-hairline bg-paper p-0 font-semibold ${
                    column.numeric ? 'text-right' : 'text-left'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(column)}
                    className={`flex w-full items-center gap-1.5 px-5 py-4 font-semibold transition-colors hover:text-ink ${
                      column.numeric ? 'justify-end' : 'justify-start'
                    } ${active ? 'text-ink' : 'text-muted'}`}
                  >
                    {column.label}
                    <span aria-hidden="true" className="font-mono text-xs">
                      {active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className="border-b border-hairline last:border-0">
              <th scope="row" className="px-5 py-4 font-semibold">
                <Link href={row.href} className="underline-offset-4 hover:underline">
                  {row.name}
                </Link>
              </th>

              <td className="px-5 py-4 text-right font-mono text-muted tabular">
                {row.altitude}
              </td>
              <td className="px-5 py-4 text-right font-mono text-muted tabular">
                {row.length}
              </td>
              <td className="px-5 py-4 text-muted">{row.fitness}</td>
              <td className="px-5 py-4 text-right font-mono text-muted tabular">
                {row.tripCount > 0 ? row.tripCount : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
