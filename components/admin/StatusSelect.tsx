'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  BOOKING_STATUSES,
  type BookingStatus,
} from '../../models/shared/bookingStatus';
import { STATUS_STYLES } from './ui';

/**
 * Inline status change.
 *
 * Used in the inquiry table and again on the detail page. Saving on `change`
 * with no separate Save button is the right trade here specifically because
 * there is one field and four values: the alternative is a table where every
 * row has its own unsaved state, and a staff member who filters the list loses
 * edits they thought they had made.
 *
 * ## Optimistic, with a real rollback
 *
 * The select shows the new value immediately and reverts if the request fails.
 * Not `useOptimistic` — that resets when the surrounding transition settles,
 * which here means the value would snap back to the server's on a successful
 * save too, producing a visible flicker on every change. Plain state plus an
 * explicit revert is less clever and behaves correctly.
 *
 * `router.refresh()` re-runs the server component so the "Pending" count and
 * the status filter agree with what the row now says. It is wrapped in a
 * transition so the page does not blank while it re-renders.
 */
export default function StatusSelect({
  id,
  status,
  label,
}: {
  id: string;
  status: BookingStatus;
  /** Screen-reader label. A table of these all reading "Status" is useless. */
  label: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<BookingStatus>(status);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();

  async function change(next: BookingStatus) {
    const previous = value;

    setValue(next);
    setError(false);
    setSaving(true);

    try {
      const response = await fetch(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });

      if (!response.ok) {
        setValue(previous);
        setError(true);
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      setValue(previous);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label={`Status for ${label}`}
        value={value}
        disabled={saving}
        onChange={(event) => change(event.target.value as BookingStatus)}
        className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60 ${STATUS_STYLES[value]}`}
      >
        {BOOKING_STATUSES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {/*
        `role="status"` rather than `role="alert"`: a save confirmation should
        not interrupt a screen reader mid-sentence. The failure below does use
        alert, because losing a status change silently is the thing to avoid.
      */}
      {(saving || pending) && (
        <span role="status" className="text-xs text-muted">
          Saving…
        </span>
      )}

      {error && (
        <span role="alert" className="text-xs text-error">
          Not saved
        </span>
      )}
    </span>
  );
}
