'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';

import Turnstile, { type TurnstileHandle } from './Turnstile';

/**
 * Newsletter signup.
 *
 * One component, three placements: the footer on every page, the foot of a
 * blog post, and the blog index. Plus a fourth shape — `requireCheckbox` — for
 * the inquiry confirmation page, where the offer sits beside other content and
 * an unticked box is the right way to ask.
 *
 * **Not on trip pages.** Nothing competes with the inquiry CTA there; a second
 * form asking for an email address on the page whose whole job is to produce a
 * booking inquiry is a way of converting a customer into a mailing-list entry.
 *
 * ## Inline result, never a redirect
 *
 * Subscribing is a side errand. Someone doing it from the foot of a blog post
 * is in the middle of reading, and navigating them away to a thank-you page
 * loses the thing they actually came for. So success and failure both render
 * in place, and the form is replaced by a short confirmation.
 *
 * The *confirmation link* in the email does redirect, to `/newsletter/confirmed`
 * — different moment, different context, and by then there is no page to lose.
 *
 * ## Turnstile
 *
 * Through the shared `Turnstile` component, rendered explicitly. This form is
 * in the footer of every page, which is exactly where the implicit script
 * failed: it scans once on load, so after any client-side navigation the
 * footer widget was never drawn and a subscription could not be verified.
 *
 * ## Consent
 *
 * The consent text is always visible, never buried in a link. In the checkbox
 * placement the box is unticked and has to be ticked; in the inline placements
 * submitting under the visible text is the agreement. Neither is the consent
 * *record* — clicking the link in the confirmation email is, because it is the
 * only step that proves the address belongs to whoever typed it.
 */
export default function NewsletterSignup({
  variant = 'inline',
  requireCheckbox = false,
  turnstileSiteKey,
  heading = 'Field notes from Pokhara',
  blurb = 'Permit changes, route conditions and season advice, a few times a year. Written by the guides, not by a marketing team.',
}: {
  /** `dark` sits on the ink footer; `inline` on a paper background. */
  variant?: 'inline' | 'dark';
  /** Renders an unticked consent checkbox that must be ticked to submit. */
  requireCheckbox?: boolean;
  turnstileSiteKey?: string;
  heading?: string;
  blurb?: string;
}) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const turnstileRef = useRef<TurnstileHandle>(null);

  const fieldId = useId();
  const emailId = `${fieldId}-email`;
  const consentId = `${fieldId}-consent`;
  const errorId = `${fieldId}-error`;
  const renderedAtId = `${fieldId}-rendered-at`;

  /**
   * The render timestamp, written into a hidden input after mount.
   *
   * `Date.now()` during render is impure — a React rule violation and a real
   * hydration hazard, because the server pass and the browser would disagree.
   * Writing it to the DOM in an effect keeps every read and write outside
   * render, and the value lives where form values belong.
   */
  useEffect(() => {
    const node = document.getElementById(renderedAtId);
    if (node instanceof HTMLInputElement) node.value = String(Date.now());
  }, [renderedAtId]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (requireCheckbox && !consent) {
      setError('Please tick the box so we know you want these.');
      document.getElementById(consentId)?.focus();
      return;
    }

    setState('sending');

    const form = event.currentTarget;

    // Waits for the token rather than sending without one; see the Turnstile
    // component. Null means the check cannot run, which it says itself.
    let token: string | undefined;

    if (turnstileSiteKey) {
      const resolved = await turnstileRef.current?.getToken();

      if (!resolved) {
        setError('We could not confirm that you are a person, so nothing was sent.');
        setState('idle');
        return;
      }

      token = resolved;
    }

    const renderedAt = Number(
      form.querySelector<HTMLInputElement>(`#${CSS.escape(renderedAtId)}`)?.value || 0
    );

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          // Inline placements: submitting under the visible text is the act.
          consent: true,
          renderedAt,
          turnstileToken: token,
          source: window.location.pathname,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // The token is spent whatever the reason; get a fresh one.
        turnstileRef.current?.reset();
        setError(
          result.fieldErrors?.email ??
            result.error ??
            'Something went wrong. Please try again.'
        );
        setState('idle');
        return;
      }

      /*
       * The server returns the same response for a new address, one already
       * pending and one already confirmed — deliberately, so this endpoint
       * cannot be used to find out whether someone is subscribed. So this
       * message has to be true in all three cases, which is why it says "if
       * that address needs confirming" rather than "check your email".
       */
      setState('done');
    } catch {
      turnstileRef.current?.reset();
      setError('We could not reach the server. Please try again in a moment.');
      setState('idle');
    }
  }

  const isDark = variant === 'dark';

  if (state === 'done') {
    return (
      <div className={isDark ? 'text-paper' : ''}>
        <p className="font-display text-lg font-extrabold tracking-display">
          Almost there
        </p>
        <p className={`mt-2 text-sm ${isDark ? 'text-paper/70' : 'text-muted'}`}>
          Check your inbox for a confirmation link — the subscription only
          starts once you click it. If nothing arrives, look in spam before
          trying again.
        </p>
      </div>
    );
  }

  return (
    <div className={isDark ? 'text-paper' : ''}>
      <p className="font-display text-lg font-extrabold tracking-display">
        {heading}
      </p>
      <p className={`mt-2 text-sm ${isDark ? 'text-paper/70' : 'text-muted'}`}>
        {blurb}
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-4">
        {/* Honeypot: off-screen rather than display:none, hidden from AT. */}
        <div
          aria-hidden="true"
          className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden"
        >
          <label htmlFor={`${fieldId}-company`}>Company</label>
          <input
            id={`${fieldId}-company`}
            name="company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <input type="hidden" id={renderedAtId} name="renderedAt" />

        <label htmlFor={emailId} className="text-sm font-semibold">
          Email address
          <span
            className={`ml-2 font-normal ${isDark ? 'text-paper/60' : 'text-muted'}`}
          >
            Required
          </span>
        </label>

        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={`w-full rounded border bg-white px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-ink ${
              error ? 'border-error' : 'border-hairline'
            }`}
          />

          <button
            type="submit"
            disabled={state === 'sending'}
            /*
              Never marigold. Marigold means "the one action on this page", and
              on every page this appears the one action is the inquiry CTA.
            */
            className={`shrink-0 rounded-full border-2 px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
              isDark
                ? 'border-paper text-paper hover:bg-paper hover:text-ink'
                : 'border-ink text-ink hover:bg-ink hover:text-paper'
            }`}
          >
            {state === 'sending' ? 'Sending…' : 'Subscribe'}
          </button>
        </div>

        {requireCheckbox && (
          <div className="mt-3 flex items-start gap-3">
            <input
              id={consentId}
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <label htmlFor={consentId} className="text-sm">
              Yes, send me occasional field notes. I can unsubscribe from any
              email.
            </label>
          </div>
        )}

        <p
          className={`mt-3 text-xs leading-relaxed ${isDark ? 'text-paper/60' : 'text-muted'}`}
        >
          {requireCheckbox
            ? 'We only use your address for this. '
            : 'By subscribing you agree to us emailing you occasional field notes. We never sell your address, and every email has an unsubscribe link. '}
          <Link
            href="/privacy-policy"
            className="font-semibold underline underline-offset-4"
          >
            Privacy Policy
          </Link>
        </p>

        {error && (
          <p id={errorId} role="alert" className="mt-2 text-sm text-error">
            {error}
          </p>
        )}

        {/*
          With no site key the widget is skipped and the server skips
          verification to match, so the form still works before the Cloudflare
          account exists.
        */}
        {turnstileSiteKey && (
          <Turnstile
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            tone={isDark ? 'dark' : 'light'}
            action="so we cannot sign you up"
          />
        )}
      </form>
    </div>
  );
}

