'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { formatDateTime } from '../../lib/adminTime';

/**
 * The sticky save bar, shared by the editors that are not the trip editor.
 *
 * Sticky because these forms are long enough that the save button would
 * otherwise be several screens from whatever is being typed, and an admin who
 * has to hunt for it is an admin who navigates away without pressing it.
 *
 * It answers one question — "is my work safe?" — with three facts: when it was
 * last saved, whether there are unsaved changes, and whatever `status` the
 * caller passes. A bare button answers none of them.
 *
 * ## Two different unsaved-work guards
 *
 * `beforeunload` here covers closing the tab, reloading and leaving the site.
 * It does **not** fire on an App Router navigation, because the router swaps
 * pages without the browser unloading — `UnsavedChangesGuard` handles that by
 * intercepting in-app link clicks. Two mechanisms, because the platform offers
 * no single one.
 *
 * The trip editor keeps `TripSaveBar` rather than using this: it carries a
 * publish-status chip, per-tab error counts and the stale-copy warnings, none
 * of which the other editors have. Merging them would mean four optional props
 * that are unset on three of four call sites.
 */
export default function SaveBar({
  dirty,
  saving,
  savedAt,
  updatedAt,
  formError,
  errorCount,
  onSave,
  label,
  status,
}: {
  dirty: boolean;
  saving: boolean;
  /** Set after a save in this session; null until then. */
  savedAt: string | null;
  /** What the database held when the page loaded. */
  updatedAt: string;
  formError: string | null;
  errorCount: number;
  onSave: () => void;
  /** What this record is, for the button and the messages. */
  label: string;
  /** Optional chip — a publish status, where the record has one. */
  status?: ReactNode;
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
    // keeps warning about changes that are no longer there.
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const lastSaved = savedAt ?? updatedAt;

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-hairline bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          {status}

          <p className="text-xs text-muted">
            {savedAt ? 'Saved' : 'Last saved'}{' '}
            {formatDateTime(new Date(lastSaved))}
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
             * pressing it to check whether it worked, which here means a
             * pointless revalidation of every page the record appears on.
             */
            disabled={saving || !dirty}
            className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : `Save ${label}`}
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
              attention.
            </>
          )}
        </p>
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
