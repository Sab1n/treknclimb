'use client';

import { useState } from 'react';

/**
 * Deleting one inquiry, permanently.
 *
 * ## Why this exists
 *
 * The privacy policy tells customers their data can be deleted on request.
 * Before this, honouring that meant someone with database access running a
 * query — a promise the system could not keep on its own. This is the screen
 * that keeps it.
 *
 * ## The confirmation names the reference
 *
 * `window.confirm`, like the trip editor's delete: synchronous, so it can
 * actually stop the action, and the dialog people already read as "this is
 * irreversible". It quotes the **reference number** rather than asking "delete
 * this inquiry?" — the admin may have two tabs open, and the only way to be
 * sure they are erasing the one they meant is to show which one.
 *
 * Success navigates back to the list with a full page load, not a router push:
 * the record the current screen is about no longer exists, and re-rendering it
 * from the router cache would show a page that cannot be reloaded.
 */
export default function DeleteInquiry({
  id,
  reference,
  name,
}: {
  id: string;
  reference: string;
  /** The customer's name, so the dialog is recognisable as the right person. */
  name: string;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(
        `Permanently delete inquiry ${reference} from ${name}?\n\n` +
          'This erases the name, email, phone number, message and consent record. ' +
          'It cannot be undone, and the inquiry cannot be recovered from this screen or any other.\n\n' +
          `The reference number ${reference} will not be reused.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/bookings/${id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));

        setError(
          result.error ??
            `The inquiry was not deleted (HTTP ${response.status}). Nothing has been changed.`
        );
        setDeleting(false);
        return;
      }

      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/inquiries');
    } catch {
      setError('Could not reach the server. Nothing was deleted.');
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-lg border border-error/30 bg-error/5 p-6">
      <h2 className="font-display text-base font-extrabold tracking-display">
        Delete this inquiry
      </h2>

      <p className="mt-1 max-w-prose text-sm text-muted">
        For a customer who asks for their data to be removed. This erases the
        whole record — name, email, phone, message and the consent timestamp —
        permanently, and it is not recoverable. Everything else is kept:
        inquiries are a record of the only conversion event the site has, so
        delete one because someone asked, not to tidy the list.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={remove}
        disabled={deleting}
        className="mt-4 rounded-full border-2 border-error px-5 py-2 text-sm font-semibold text-error transition-colors hover:bg-error hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {deleting ? 'Deleting…' : 'Delete permanently'}
      </button>
    </section>
  );
}
