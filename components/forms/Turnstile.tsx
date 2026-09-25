'use client';

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react';

/**
 * Cloudflare Turnstile, rendered **explicitly**, for every form on the site.
 *
 * ## Why not the implicit script
 *
 * `api.js` in its default mode scans the document for `.cf-turnstile`
 * elements **once**, when it loads, and never again. That is fatal in the App
 * Router: the footer newsletter puts the script on every page, so by the time
 * a client-side navigation reaches the inquiry form the scan has already
 * happened and the new widget is never drawn. Measured before this component
 * existed: on a fresh load of /contact both holders held a widget and a token
 * input; after navigating there from a trip page both were empty, and the
 * submission failed with "we could not verify that you are human".
 *
 * It was not only the inquiry form — the footer widget died on *every*
 * client-side navigation too, on every page it appears on.
 *
 * So the script is loaded once in `render=explicit` mode, and each widget
 * draws itself into its own container on mount and removes itself on unmount.
 * That works the same way on a first load, a client-side navigation, the back
 * button, and with two widgets on one page.
 *
 * ## The token is waited for, never assumed
 *
 * A token takes a moment to arrive and can require a click. `getToken()`
 * resolves the token the widget already has, or waits for the one it is
 * working on — a submit pressed a second too early waits instead of failing.
 * Tokens are **single use and expire after five minutes**, so the caller
 * resets the widget after every failed submission, and the widget resets
 * itself when Cloudflare says a token has expired or timed out.
 *
 * ## Never "reload the page"
 *
 * A reload loses everything typed into the form. When verification genuinely
 * fails this says so plainly and offers "Try again", which resets the widget
 * in place. The caller's error message says the same.
 */

/* ------------------------------------------------------------------ *
 * The script, loaded once per page
 * ------------------------------------------------------------------ */

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: 'light' | 'dark' | 'auto';
      callback: (token: string) => void;
      'error-callback'?: (code?: string) => void;
      'expired-callback'?: () => void;
      'timeout-callback'?: () => void;
    }
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

/*
 * `declare global` widens the `Window` type for this project. Turnstile
 * attaches itself to `window` at runtime, and without this TypeScript has no
 * idea `window.turnstile` can exist — it is optional here because until the
 * script has loaded, it genuinely does not.
 */
declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onTurnstileReady?: () => void;
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const READY_CALLBACK = 'onTurnstileReady';

/*
 * Module scope, so every widget on the page shares one load. A promise rather
 * than a boolean: two widgets mounting in the same tick both await the same
 * load instead of appending two script tags.
 */
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;

  loading = new Promise<TurnstileApi>((resolve, reject) => {
    window[READY_CALLBACK] = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile loaded without its API'));
    };

    const script = document.createElement('script');

    script.id = SCRIPT_ID;
    /*
     * `render=explicit` is the whole point: it stops api.js scanning the
     * document, so nothing depends on when the script happens to load
     * relative to when a form mounts.
     */
    script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${READY_CALLBACK}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      // Blocked by an extension, or offline. Cleared so "Try again" retries
      // the load rather than awaiting a promise that can never settle.
      loading = null;
      reject(new Error('Turnstile could not be loaded'));
    };

    document.head.appendChild(script);
  });

  return loading;
}

/* ------------------------------------------------------------------ *
 * The component
 * ------------------------------------------------------------------ */

export interface TurnstileHandle {
  /**
   * The widget's token — waiting for one if it has not solved yet, rather
   * than returning empty and letting the form fail.
   *
   * Resolves `null` only when the check genuinely cannot complete: the script
   * would not load, Cloudflare returned an error, or `timeoutMs` passed.
   */
  getToken: (timeoutMs?: number) => Promise<string | null>;
  /** Throw the spent token away and ask for a new one. */
  reset: () => void;
}

type Status = 'loading' | 'solving' | 'solved' | 'failed';

export default function Turnstile({
  siteKey,
  ref,
  tone = 'light',
  action,
}: {
  siteKey: string;
  /**
   * React 19 passes `ref` as an ordinary prop, so no `forwardRef` wrapper is
   * needed. `RefObject<T | null>` because the ref is null until this mounts.
   */
  ref?: RefObject<TurnstileHandle | null>;
  /** `dark` for the ink footer, so the widget is not a white slab on it. */
  tone?: 'light' | 'dark';
  /** Only for the status text — "before we can send your inquiry". */
  action?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  /*
   * The token lives in a ref as well as in state. State drives the status
   * line; the ref is what `getToken` reads, because a submit handler holds
   * the values from the render it started in and would see a stale token.
   */
  const tokenRef = useRef<string | null>(null);
  const waitersRef = useRef<((token: string | null) => void)[]>([]);

  const [status, setStatus] = useState<Status>('loading');
  // Bumped by "Try again": the effect below depends on it, so it re-runs.
  const [attempt, setAttempt] = useState(0);

  function settle(token: string | null) {
    tokenRef.current = token;

    if (token !== null) {
      for (const waiter of waitersRef.current) waiter(token);
      waitersRef.current = [];
    }
  }

  useEffect(() => {
    let cancelled = false;

    /*
     * No setState in the body of the effect: React's lint rule forbids it
     * because it cascades a render, and there is nothing to set here anyway —
     * the status starts at 'loading' and every move from it happens in a
     * callback below or in `resetWidget`, both of which run outside render.
     */
    loadTurnstile()
      .then((api) => {
        if (cancelled || !containerRef.current) return;

        setStatus('solving');

        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: siteKey,
          theme: tone === 'dark' ? 'dark' : 'light',
          callback: (token) => {
            settle(token);
            setStatus('solved');
          },
          'error-callback': () => {
            settle(null);
            setStatus('failed');
          },
          /*
           * A token is good for five minutes. Someone filling in a long form
           * can easily pass that, so the widget quietly gets a new one rather
           * than letting the submission fail on a token that has gone stale.
           */
          'expired-callback': () => {
            tokenRef.current = null;
            setStatus('solving');
            if (widgetIdRef.current) api.reset(widgetIdRef.current);
          },
          'timeout-callback': () => {
            tokenRef.current = null;
            setStatus('solving');
            if (widgetIdRef.current) api.reset(widgetIdRef.current);
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          settle(null);
          setStatus('failed');
        }
      });

    return () => {
      cancelled = true;

      /*
       * Removing the widget on unmount is the other half of explicit
       * rendering. Without it, navigating away leaves Cloudflare's iframe and
       * its timers behind, and coming back renders a second widget into a
       * container that already has one.
       */
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }

      tokenRef.current = null;
      // Anything still waiting is waiting for a widget that no longer exists.
      for (const waiter of waitersRef.current) waiter(null);
      waitersRef.current = [];
    };
  }, [siteKey, tone, attempt]);

  function resetWidget() {
    tokenRef.current = null;

    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      setStatus('solving');
    } else {
      // Nothing to reset — the script never loaded. Re-run the effect, which
      // tries the load again.
      setStatus('loading');
      setAttempt((current) => current + 1);
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      getToken: (timeoutMs = 15_000) =>
        new Promise<string | null>((resolve) => {
          if (tokenRef.current) return resolve(tokenRef.current);
          if (status === 'failed') return resolve(null);

          /*
           * Not solved yet: queue up. The timer is the backstop — a widget
           * that never calls back must not leave the submit button spinning
           * forever.
           */
          const waiter = (token: string | null) => {
            clearTimeout(timer);
            resolve(token);
          };

          const timer = setTimeout(() => {
            waitersRef.current = waitersRef.current.filter((w) => w !== waiter);
            resolve(null);
          }, timeoutMs);

          waitersRef.current.push(waiter);
        }),
      reset: resetWidget,
    }),
    // `status` is read inside getToken, so the handle is rebuilt when it moves.
    [status]
  );

  const muted = tone === 'dark' ? 'text-paper/60' : 'text-muted';

  return (
    <div className="mt-3">
      {/*
        Cloudflare draws into this. It is never given children by React, so
        React and the widget cannot fight over the same DOM node.
      */}
      <div ref={containerRef} />

      {/*
        `role="status"` rather than `alert`: this is progress, not an error,
        and it should be read when the screen reader pauses rather than cut
        across whatever field the visitor is filling in.
      */}
      {status !== 'solved' && (
        <p role="status" className={`mt-2 text-sm ${status === 'failed' ? 'text-error' : muted}`}>
          {status === 'failed' ? (
            <>
              The security check could not run
              {action ? ` ${action}` : ''}.{' '}
              <button
                type="button"
                onClick={resetWidget}
                className="font-semibold underline underline-offset-4"
              >
                Try again
              </button>
              , or message us on WhatsApp.
            </>
          ) : (
            <>Checking that you are a person&hellip;</>
          )}
        </p>
      )}
    </div>
  );
}
