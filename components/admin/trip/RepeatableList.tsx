'use client';

import { useState, type ReactNode } from 'react';

import type { EditorRow } from '../../../types/tripEditor';

/**
 * Drag-to-reorder for the repeatable editors.
 *
 * ## HTML drag and drop, not a library
 *
 * The native API is unpleasant but it is already here, it is keyboard- and
 * screen-reader-hostile in ways this component can compensate for, and it costs
 * no bundle. A drag-and-drop library would be the largest dependency in the
 * admin, added for one interaction on one screen.
 *
 * **The compensation is the important half.** Drag is a mouse-only gesture, so
 * every list here also has Move up / Move down buttons. They are not a fallback
 * nobody uses: reordering one day in a twenty-day itinerary is genuinely easier
 * with a button than by dragging across a scrolling page, and without them the
 * itinerary would be unreorderable by keyboard entirely.
 *
 * ## `dragOver` needs `preventDefault`
 *
 * The single thing that makes native drag-and-drop appear broken: an element is
 * not a valid drop target unless its `dragover` handler calls
 * `preventDefault()`. Without it the drop event never fires, and nothing about
 * the failure suggests why.
 */

export interface RepeatableListProps<T extends EditorRow> {
  rows: T[];
  onChange: (rows: T[]) => void;
  /** Screen-reader name for the list — "Itinerary days", "Gallery images". */
  label: string;
  /** Renders one row's fields. */
  children: (row: T, index: number) => ReactNode;
  /** The row's title in the drag handle and the move buttons. */
  rowLabel: (row: T, index: number) => string;
  /** Shown when there are no rows. */
  empty: ReactNode;
}

export function RepeatableList<T extends EditorRow>({
  rows,
  onChange,
  label,
  children,
  rowLabel,
  empty,
}: RepeatableListProps<T>) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length || from === to) return;

    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    onChange(next);
  }

  function handleDrop(targetKey: string) {
    const from = rows.findIndex((row) => row.key === draggingKey);
    const to = rows.findIndex((row) => row.key === targetKey);

    setDraggingKey(null);
    setOverKey(null);

    if (from === -1 || to === -1) return;

    move(from, to);
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-hairline bg-white px-4 py-8 text-center text-sm text-muted">
        {empty}
      </div>
    );
  }

  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <li
          key={row.key}
          /*
           * The whole row is draggable, but only the handle starts a drag —
           * `draggable` on the row plus `onDragStart` filtered by the handle
           * would be more code for the same result, so instead the row is
           * draggable and text inputs inside it stop propagation naturally:
           * a drag begun inside an input is a text selection, which the browser
           * handles before this sees it.
           */
          draggable
          onDragStart={() => setDraggingKey(row.key)}
          onDragEnd={() => {
            setDraggingKey(null);
            setOverKey(null);
          }}
          // Required, or the drop never fires. See the note above.
          onDragOver={(event) => {
            event.preventDefault();
            if (overKey !== row.key) setOverKey(row.key);
          }}
          onDrop={(event) => {
            event.preventDefault();
            handleDrop(row.key);
          }}
          className={`rounded-lg border bg-white transition-colors ${
            draggingKey === row.key
              ? 'border-ink opacity-50'
              : overKey === row.key && draggingKey !== null
                ? 'border-ink'
                : 'border-hairline'
          }`}
        >
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
            {/*
              `cursor-grab` and the grip glyph are the only affordance a native
              drag gets — there is no browser chrome saying a thing is
              draggable. `aria-hidden` because the move buttons beside it are
              what a screen reader should find.
            */}
            <span aria-hidden="true" className="cursor-grab text-muted select-none">
              ⠿
            </span>

            <span className="text-sm font-semibold">{rowLabel(row, index)}</span>

            <div className="ml-auto flex items-center gap-1">
              <MoveButton
                direction="up"
                label={rowLabel(row, index)}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              />
              <MoveButton
                direction="down"
                label={rowLabel(row, index)}
                disabled={index === rows.length - 1}
                onClick={() => move(index, index + 1)}
              />
              <button
                type="button"
                onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                aria-label={`Remove ${rowLabel(row, index)}`}
                className="rounded px-2 py-1 text-xs font-semibold text-error transition-colors hover:bg-error/10"
              >
                Remove
              </button>
            </div>
          </div>

          <div className="p-4">{children(row, index)}</div>
        </li>
      ))}
    </ul>
  );
}

function MoveButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: 'up' | 'down';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      /*
       * The row's name is in the accessible label. A list of buttons all
       * announcing "Move up" tells a screen-reader user nothing about which
       * row they are on.
       */
      aria-label={`Move ${label} ${direction}`}
      className="rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-paper disabled:opacity-30"
    >
      <span aria-hidden="true">{direction === 'up' ? '↑' : '↓'}</span>
    </button>
  );
}

/** The "Add another" button every repeatable editor ends with. */
export function AddRowButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
    >
      {children}
    </button>
  );
}

/**
 * Updates one row in an array immutably.
 *
 * Keyed by `key`, not by index. An index-based update is correct right up until
 * a row is dragged or removed while an input is focused, at which point the
 * change lands on whichever row now occupies that position.
 */
export function updateRow<T extends EditorRow>(
  rows: T[],
  key: string,
  patch: Partial<T>
): T[] {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}
