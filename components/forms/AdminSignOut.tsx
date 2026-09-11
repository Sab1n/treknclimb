'use client';

import { useState } from 'react';

/**
 * Sign out.
 *
 * A form POST rather than a link, because a GET logout can be fired by any
 * `<img src>` on any site — see the note in the logout route. A button in a
 * form is also what a keyboard and a screen reader expect an action to be.
 *
 * `window.location.assign` rather than a router push, for the mirror of the
 * reason the login form uses it: the cookie has just been cleared, and a
 * client-side navigation would render from a cache built while signed in.
 */
export default function AdminSignOut() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);

    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      // Navigate whatever happened. If the request failed the cookie may still
      // be set, and the login page will simply send them back in — better than
      // leaving them on a page with a stuck "Signing out…" button.
      /*
       * A full page load, not router.push. The session cookie has just been
       * cleared, and a client-side navigation would render the next page from
       * the router cache built while signed in — showing admin content to a
       * signed-out browser until something happened to refresh it.
       */
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/login');
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="rounded-full border border-hairline px-4 py-2 text-sm font-semibold transition-colors hover:border-ink disabled:opacity-60"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
