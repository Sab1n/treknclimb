'use client';

import { useEffect } from 'react';

/**
 * Warns before a client-side navigation discards unsaved work.
 *
 * ## Why this is a click interceptor and not a router hook
 *
 * `beforeunload` covers closing the tab, reloading and following a link off the
 * site. It does **not** fire on an App Router navigation — the router swaps the
 * page without the browser ever unloading — and that is the likeliest way to
 * lose an edit here, because the admin sidebar is a click away from a form
 * holding an hour of itinerary work.
 *
 * Next's App Router deliberately exposes no navigation-blocking API. There is
 * no `router.events`, no `useBlocker`; the historical workarounds all monkey-
 * patch `router.push` or throw inside a route change, and both break in ways
 * that are hard to see and harder to fix on an upgrade.
 *
 * So this does the one thing that is both supported and sufficient: a capturing
 * `click` listener on the document that catches anchor clicks heading to
 * another in-app page, and confirms. It cannot catch a back-button press or a
 * programmatic `router.push`, and it is not advertised as complete — `popstate`
 * below covers the back button as far as it can.
 *
 * ## Capture phase, and why
 *
 * The listener runs on capture so it sees the click before `next/link`'s own
 * handler does. On bubble, the router would already have started navigating and
 * `preventDefault()` would come too late.
 */
export default function UnsavedChangesGuard({
  when,
  message,
}: {
  /** Guard only while this is true. */
  when: boolean;
  message: string;
}) {
  useEffect(() => {
    if (!when) return;

    function handleClick(event: MouseEvent) {
      /*
       * Modified clicks open a new tab or window, which leaves this page — and
       * its unsaved state — exactly where it is. Interrupting those would be a
       * confirm dialog for something that loses nothing.
       */
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest('a');

      if (!anchor) return;

      const href = anchor.getAttribute('href');

      if (!href) return;

      // Downloads and new tabs do not replace this page.
      if (anchor.hasAttribute('download') || anchor.target === '_blank') return;

      /*
       * Same-origin, and actually going somewhere else. An in-page `#anchor`
       * link and a link to the current URL both leave the form mounted, so
       * neither loses anything.
       */
      const destination = new URL(href, window.location.href);

      if (destination.origin !== window.location.origin) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }

      /*
       * `confirm` rather than a styled modal. It is synchronous, which is what
       * makes it able to cancel a click at all — an async dialog would have to
       * let the navigation proceed and then try to undo it. It is also the
       * dialog people already recognise as "you are about to lose something".
       */
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    /*
     * The back button. `popstate` fires *after* the history entry has already
     * changed, so there is no cancelling it — the best available move is to
     * push the state back and then ask. If the admin confirms, going back a
     * second time works because the guard is unmounted by then or they mean it.
     *
     * This is the weakest part and it is honest about being so: a browser will
     * not let a page hold history hostage, and it should not.
     */
    function handlePopState() {
      if (window.confirm(message)) return;

      window.history.pushState(null, '', window.location.href);
    }

    // Seeds a history entry so the first back press has something to cancel
    // against rather than leaving the site immediately.
    window.history.pushState(null, '', window.location.href);

    document.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [when, message]);

  return null;
}
