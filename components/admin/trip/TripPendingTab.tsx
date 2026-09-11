import type { ReactNode } from 'react';

/**
 * A tab whose editor is not built yet.
 *
 * Rendered rather than hidden, for the same reason the sidebar shows disabled
 * screens: a tab that appears later, in a place nobody was told to expect it,
 * is worse than one that is visibly pending. It also shows what the trip
 * already holds — "12 days" is the difference between "this is empty" and
 * "this is full and I cannot reach it", and those call for opposite reactions.
 *
 * A Server Component. It holds no state, so it ships no JavaScript.
 */
export default function TripPendingTab({
  title,
  count,
  noun,
  summary,
  note,
}: {
  title: string;
  count: number;
  /** Singular; pluralised below. */
  noun: string;
  summary: string;
  note?: ReactNode;
}) {
  return (
    <div className="max-w-2xl rounded-lg border border-hairline bg-white p-6">
      <h2 className="font-display text-lg font-extrabold tracking-display">
        {title}
      </h2>

      <p className="mt-2 font-mono text-sm tabular">
        {count} {noun}
        {count === 1 ? '' : 's'} stored
      </p>

      <p className="mt-3 text-sm text-muted">{summary}</p>

      {note && <p className="mt-3 text-sm text-muted">{note}</p>}

      <p className="mt-4 rounded border border-dashed border-hairline px-4 py-3 text-sm text-muted">
        This editor is the next pass. Saving from the other tabs leaves whatever
        is stored here untouched — the save sends only the fields it can edit,
        so nothing on this tab can be lost by saving.
      </p>
    </div>
  );
}
