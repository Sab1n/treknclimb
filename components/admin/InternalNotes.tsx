'use client';

import { useState } from 'react';

/**
 * Internal notes on an inquiry.
 *
 * **An explicit Save, unlike the status dropdown.** A textarea saving on blur
 * loses work when a browser reloads or a session expires mid-sentence, and
 * autosave on a free-text field is how two staff members overwrite each other
 * without either noticing. A button is one extra click on a field that gets
 * edited rarely and read often.
 *
 * ## This is one field, not a thread
 *
 * `internalNotes` is a single string, per SRS §26. On a long follow-up an
 * append-only list of dated notes would serve staff better, but that is a
 * change to the SRS rather than an implementation detail — it is on the open
 * items in CLAUDE.md. Until it is decided, this is deliberately a plain
 * textarea, and the hint under it says so, because a box that silently replaces
 * what a colleague wrote is worth warning about.
 */
export default function InternalNotes({
  id,
  initialNotes,
}: {
  id: string;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState<string>(initialNotes);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');

  const dirty = notes !== saved;

  async function save() {
    setState('saving');

    try {
      const response = await fetch(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ internalNotes: notes }),
      });

      if (!response.ok) {
        setState('error');
        return;
      }

      // Track what the server now holds, so "Saved" is a fact about the
      // database rather than about the last button press.
      setSaved(notes);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  return (
    <div>
      <label htmlFor="internal-notes" className="text-sm font-semibold">
        Internal notes
      </label>
      <p id="internal-notes-hint" className="mt-1 text-xs text-muted">
        Staff only — never shown to the customer. One shared field: saving
        replaces whatever was here before.
      </p>

      <textarea
        id="internal-notes"
        aria-describedby="internal-notes-hint"
        value={notes}
        rows={6}
        onChange={(event) => setNotes(event.target.value)}
        className="mt-2 w-full rounded border border-hairline bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-ink"
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || state === 'saving'}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {state === 'saving' ? 'Saving…' : 'Save notes'}
        </button>

        {state === 'error' && (
          <span role="alert" className="text-sm text-error">
            Could not save. Your text is still here — try again.
          </span>
        )}

        {state === 'idle' && dirty && (
          <span className="text-sm text-muted">Unsaved changes</span>
        )}

        {state === 'idle' && !dirty && saved !== initialNotes && (
          <span role="status" className="text-sm text-confirmed">
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
