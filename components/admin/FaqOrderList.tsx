'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * The FAQ list, grouped by where each entry renders, reorderable within a group.
 *
 * ## Why it is grouped rather than one flat sortable table
 *
 * `displayOrder` decides the order entries appear *on a page*, and entries only
 * share a page when they share an association. Dragging a Nepal FAQ
 * above a sitewide one would be a gesture with no meaning — the two never
 * appear in the same list — and a single flat table invites exactly that.
 *
 * So the screen shows the groups the site will show: the general `/faq` page,
 * then one section per destination that has entries. Reordering is within a
 * section, and the save writes positions for that section only.
 *
 * A trip’s questions are not here at all — they live in `Trip.faqs` and are
 * ordered on the trip editor’s own FAQs tab.
 *
 * ## Drag, with buttons beside it
 *
 * Native HTML drag and drop, no library — the same choice and the same reasons
 * as `RepeatableList` in the trip editor. Drag is mouse-only, so every row also
 * has Move up / Move down, which is what makes the list reorderable by
 * keyboard at all. `dragover` must call `preventDefault()` or the drop never
 * fires, which is the single thing that makes this API look broken.
 */

export interface FaqListRow {
  id: string;
  question: string;
  category: string | null;
  status: string;
  displayOrder: number;
  destinationId: string | null;
  destinationName: string | null;
}

interface Group {
  key: string;
  title: string;
  /** Where these entries render, for the section subheading. */
  where: string;
  rows: FaqListRow[];
}

/**
 * Buckets rows the way the public site does: unattached entries to /faq, the
 * rest to the destination page they belong to.
 */
function groupRows(rows: FaqListRow[]): Group[] {
  const site: FaqListRow[] = [];
  const byKey = new Map<string, Group>();

  for (const row of rows) {
    if (!row.destinationId) {
      site.push(row);
      continue;
    }

    const key = row.destinationId;

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        title: row.destinationName ?? 'Unknown destination',
        where: 'Shown on this destination’s page',
        rows: [],
      });
    }

    byKey.get(key)!.rows.push(row);
  }

  /*
   * The general section is always present, even when empty — it is where a new
   * entry lands by default, and an absent section reads as a missing feature.
   */
  return [
    { key: 'site', title: 'General', where: 'Shown on /faq', rows: site },
    ...[...byKey.values()].sort((a, b) => a.title.localeCompare(b.title)),
  ];
}

export default function FaqOrderList({ rows }: { rows: FaqListRow[] }) {
  const router = useRouter();

  /*
   * The order being edited, keyed by group. Only groups that have been touched
   * appear here — an untouched group renders straight from `rows`, so a
   * `router.refresh()` after a save anywhere else is picked up rather than
   * shadowed by stale local state.
   */
  const [reordered, setReordered] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const groups = useMemo(() => groupRows(rows), [rows]);

  function orderedRows(group: Group): FaqListRow[] {
    const order = reordered[group.key];

    if (!order) return group.rows;

    const byId = new Map(group.rows.map((row) => [row.id, row] as const));

    return order
      .map((id) => byId.get(id))
      .filter((row): row is FaqListRow => row !== undefined);
  }

  function move(group: Group, from: number, to: number) {
    const current = orderedRows(group);

    if (to < 0 || to >= current.length || from === to) return;

    const next = current.map((row) => row.id);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    setReordered((state) => ({ ...state, [group.key]: next }));
    setError(null);
  }

  async function saveOrder(group: Group) {
    const ids = orderedRows(group).map((row) => row.id);

    setSaving(group.key);
    setError(null);

    try {
      const response = await fetch('/api/admin/faqs/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      if (response.status === 404) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin/faqs');
        return;
      }

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error ?? 'Could not save the new order.');
        return;
      }

      /*
       * Drop the local order once it is stored, so the list goes back to
       * rendering from the server's copy. Keeping it would mean a later change
       * made elsewhere is invisible behind a stale array.
       */
      setReordered((state) => {
        const next = { ...state };
        delete next[group.key];
        return next;
      });

      router.refresh();
    } catch {
      setError('Could not reach the server. The order was not saved.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {error && (
        <p
          role="alert"
          className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
        >
          {error}
        </p>
      )}

      {groups.map((group) => {
        const current = orderedRows(group);
        const dirty = reordered[group.key] !== undefined;

        return (
          <section key={group.key} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-extrabold tracking-display">
                  {group.title}
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  {group.where} · {current.length}{' '}
                  {current.length === 1 ? 'entry' : 'entries'}
                </p>
              </div>

              {dirty && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-muted">
                    Order changed
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setReordered((state) => {
                        const next = { ...state };
                        delete next[group.key];
                        return next;
                      })
                    }
                    className="text-sm underline underline-offset-4"
                  >
                    Undo
                  </button>

                  {/*
                    Explicit rather than saving on drop. A drag is easy to start
                    by accident on a list of links, and a silent write would
                    reorder a live page without anyone deciding to.
                  */}
                  <button
                    type="button"
                    onClick={() => saveOrder(group)}
                    disabled={saving !== null}
                    className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {saving === group.key ? 'Saving…' : 'Save order'}
                  </button>
                </div>
              )}
            </div>

            {current.length === 0 ? (
              <p className="rounded-lg border border-dashed border-hairline bg-white px-4 py-8 text-center text-sm text-muted">
                Nothing here yet. A new FAQ with no trip and no destination lands
                in this list.
              </p>
            ) : (
              <ul
                aria-label={`${group.title} FAQs`}
                className="flex flex-col gap-2"
              >
                {current.map((row, index) => (
                  <li
                    key={row.id}
                    draggable
                    onDragStart={() => setDragging(row.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    // Required, or the drop never fires.
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (over !== row.id) setOver(row.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();

                      const from = current.findIndex((r) => r.id === dragging);
                      const to = index;

                      setDragging(null);
                      setOver(null);

                      if (from !== -1) move(group, from, to);
                    }}
                    className={`flex items-start gap-3 rounded-lg border bg-white px-4 py-3 transition-colors ${
                      dragging === row.id
                        ? 'border-ink opacity-50'
                        : over === row.id && dragging !== null
                          ? 'border-ink'
                          : 'border-hairline'
                    }`}
                  >
                    {/*
                      The only affordance a native drag gets — there is no
                      browser chrome saying a thing is draggable. Hidden from
                      screen readers, which get the move buttons instead.
                    */}
                    <span
                      aria-hidden="true"
                      className="mt-0.5 cursor-grab select-none text-muted"
                    >
                      ⠿
                    </span>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/faqs/${row.id}`}
                        className="font-semibold underline underline-offset-4"
                      >
                        {row.question}
                      </Link>

                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                        <span
                          className={
                            row.status === 'published'
                              ? 'font-semibold text-confirmed'
                              : ''
                          }
                        >
                          {row.status}
                        </span>

                        {row.category && <span>{row.category}</span>}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(group, index, index - 1)}
                        disabled={index === 0}
                        /*
                         * The question is in the accessible name. A column of
                         * buttons all announcing "Move up" tells a screen-reader
                         * user nothing about which row they are on.
                         */
                        aria-label={`Move "${row.question}" up`}
                        className="rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-paper disabled:opacity-30"
                      >
                        <span aria-hidden="true">↑</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => move(group, index, index + 1)}
                        disabled={index === current.length - 1}
                        aria-label={`Move "${row.question}" down`}
                        className="rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-paper disabled:opacity-30"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
