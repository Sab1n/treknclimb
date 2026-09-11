'use client';

import { useEffect } from 'react';

import { formatDateTime } from '../../../lib/adminTime';
import type { StaleCopyWarning } from '../../../lib/staleCopy';

/**
 * The sticky save bar.
 *
 * Sticky because the editor is long enough that the save button would
 * otherwise be several screens from whatever is being typed, and an admin who
 * has to hunt for it is an admin who navigates away without pressing it.
 *
 * It carries three things that all answer "is my work safe?": the publish
 * status, when it was last saved, and whether there are unsaved changes. That
 * question is the reason a save bar exists at all — a bare button answers none
 * of it.
 *
 * ## Two different unsaved-work guards
 *
 * `beforeunload` here covers closing the tab, reloading and leaving the site.
 * It does **not** fire on an App Router navigation, because the router swaps
 * pages without the browser unloading — so `UnsavedChangesGuard` handles that
 * separately by intercepting in-app link clicks. Two mechanisms because the
 * platform genuinely offers no single one.
 */
export default function TripSaveBar({
  dirty,
  saving,
  status,
  savedAt,
  updatedAt,
  errorCount,
  formError,
  warnings,
  onDismissWarnings,
  onGoToField,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  status: string;
  /** Set after a save in this session; null until then. */
  savedAt: string | null;
  /** What the database had when the page loaded. */
  updatedAt: string;
  errorCount: number;
  formError: string | null;
  /** Advisory, and only ever present after a *successful* save. */
  warnings: StaleCopyWarning[];
  onDismissWarnings: () => void;
  onGoToField: (field: string) => void;
  onSave: () => void;
}) {
  useEffect(() => {
    if (!dirty) return;

    function warn(event: BeforeUnloadEvent) {
      /*
       * `preventDefault()` is the modern spelling; assigning `returnValue` is
       * what older browsers check. Both are needed, and no custom message is
       * possible — every browser shows its own wording and has for years.
       */
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', warn);

    // Removed when the form goes clean as well as on unmount, or a saved form
    // would keep warning about changes that are no longer there.
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const lastSaved = savedAt ?? updatedAt;

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-hairline bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <StatusChip status={status} />

          <p className="text-xs text-muted">
            {savedAt ? 'Saved' : 'Last saved'} {formatDateTime(new Date(lastSaved))}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {dirty && !saving && (
            <span className="text-sm font-semibold text-muted">
              Unsaved changes
            </span>
          )}

          {!dirty && !saving && savedAt && (
            <span role="status" className="text-sm font-semibold text-confirmed">
              Saved
            </span>
          )}

          <button
            type="button"
            onClick={onSave}
            /*
             * Disabled when clean. A save button that is always live invites
             * pressing it to check whether it worked, which on a published
             * trip means a pointless revalidation of five cached pages.
             */
            disabled={saving || !dirty}
            className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save trip'}
          </button>
        </div>
      </div>

      {formError && (
        <p role="alert" className="mt-2 text-sm text-error">
          {formError}
          {errorCount > 0 && (
            <>
              {' '}
              {errorCount} {errorCount === 1 ? 'field needs' : 'fields need'}{' '}
              attention — the tabs holding them are marked.
            </>
          )}
        </p>
      )}

      {/*
        Stale-copy warnings. Rendered after a successful save, never as part of
        a failure — the trip is already written. A price change leaves the old
        figure in the answer block and the meta description, which are the
        AI-extraction target and the search snippet: the two worst places for a
        number the company no longer charges, and the two furthest from the
        field that was just edited.

        Each names its field and offers to open the tab holding it, because
        "some copy is out of date" would send the admin reading everything.
      */}
      {warnings.length > 0 && (
        <div
          role="status"
          className="mt-2 rounded border border-marigold/40 bg-marigold/10 px-4 py-3 text-sm"
        >
          <p className="font-semibold">
            Saved — but the price changed and the copy did not.
          </p>

          <ul className="mt-1 flex flex-col gap-1">
            {warnings.map((warning) => (
              <li key={warning.field}>
                {warning.message}{' '}
                <button
                  type="button"
                  onClick={() => onGoToField(warning.field)}
                  className="underline underline-offset-4"
                >
                  Open the {warning.label}
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onDismissWarnings}
            className="mt-2 text-xs text-muted underline underline-offset-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {dirty && (
        <p className="mt-2 text-xs text-muted">
          Nothing is written until you press Save. Leaving this page will ask
          before discarding these changes.
        </p>
      )}
    </div>
  );
}

/**
 * The publish status, shown as a chip rather than buried in the Basic tab.
 *
 * Whether the thing being edited is live is the most consequential fact on the
 * screen: it decides whether a half-finished sentence is visible to customers.
 * It stays in view because the tab holding the control does not.
 */
function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: 'border-confirmed/30 bg-confirmed/10 text-confirmed',
    draft: 'border-marigold/40 bg-marigold/10 text-ink',
    archived: 'border-hairline bg-white text-muted',
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
        styles[status] ?? styles.draft
      }`}
    >
      {status === 'published' ? 'Live on the site' : status}
    </span>
  );
}
