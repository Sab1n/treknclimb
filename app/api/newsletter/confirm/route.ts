import { NextResponse } from 'next/server';

import { connectDB } from '../../../../lib/db';
import NewsletterSubscriber from '../../../../models/NewsletterSubscriber';
import { syncSubscriber } from '../../../../lib/newsletterProvider';

/** Outcomes the thank-you page knows how to render. */
type ConfirmOutcome = 'confirmed' | 'already' | 'expired' | 'invalid';

function redirectTo(outcome: ConfirmOutcome, request: Request) {
  // Built from our own constant plus a fixed string — never from anything in
  // the request. An open redirect on a link we email to strangers would be a
  // ready-made phishing tool wearing our domain.
  const url = new URL('/newsletter/confirmed', new URL(request.url).origin);
  url.searchParams.set('status', outcome);

  return NextResponse.redirect(url, { status: 303 });
}

/**
 * GET /api/newsletter/confirm?token=…
 *
 * The second half of double opt-in. Clicking this is the consent record — the
 * only step that proves the address belongs to whoever typed it — so this is
 * where `confirmedAt` is set and the only place a contact is pushed to the
 * marketing provider.
 *
 * ## Why a redirect rather than a rendered page
 *
 * The token is in the URL. Rendering here would leave it in the address bar,
 * in browser history, and in the `Referer` header of every asset the page
 * loads. A 303 to a clean `/newsletter/confirmed?status=…` spends the token and
 * gets it out of the URL in one step.
 *
 * ## Single use
 *
 * The token is nulled on success, so a second click lands on `invalid` rather
 * than re-confirming. That also means a link forwarded on, or sitting in an
 * archived mailbox, cannot be replayed.
 *
 * ## The known weakness of GET confirmation
 *
 * Some corporate mail scanners fetch every link in an incoming message, which
 * can auto-confirm a subscription nobody clicked. That is inherent to a
 * one-click emailed link and is accepted here: the alternative is a landing
 * page with a button, which costs a step for every real subscriber to defend
 * against a case where the address is genuinely the person's own anyway.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');

  if (!token) return redirectTo('invalid', request);

  await connectDB();

  try {
    const subscriber = await NewsletterSubscriber.findOne({
      confirmToken: token,
    });

    if (!subscriber) {
      // Either never existed, or already spent. Both are 'invalid' — there is
      // nothing useful to tell someone holding a token we do not recognise.
      return redirectTo('invalid', request);
    }

    if (subscriber.status === 'confirmed') return redirectTo('already', request);

    const expiresAt = subscriber.confirmTokenExpiresAt;

    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      // Leave the record pending. The purge script clears it, and the person
      // can sign up again — which issues a fresh token.
      return redirectTo('expired', request);
    }

    subscriber.status = 'confirmed';
    subscriber.confirmedAt = new Date();
    // Spend the token. This is what makes the link single-use.
    subscriber.confirmToken = null;
    subscriber.confirmTokenExpiresAt = null;

    await subscriber.save();

    /*
     * Sync to the marketing provider — after the local write, and never in a
     * way that can fail the request.
     *
     * A failed sync leaves `syncedAt` null, which is exactly what the retry
     * script looks for. Someone who has just clicked "confirm" must see a
     * thank-you page whether or not a third-party API was reachable in that
     * second; they did their part.
     */
    const sync = await syncSubscriber(subscriber.email, subscriber.source);

    if (sync.ok) {
      subscriber.providerContactId = sync.contactId ?? null;
      subscriber.syncedAt = new Date();
      await subscriber.save();
    } else if (!sync.skipped) {
      console.error(
        `[newsletter] ${subscriber.email} confirmed but NOT synced to the provider — retry later:`,
        sync.error
      );
    }

    return redirectTo('confirmed', request);
  } catch (error) {
    console.error('[newsletter] Confirmation failed:', error);

    return redirectTo('invalid', request);
  }
}

