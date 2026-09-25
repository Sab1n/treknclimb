import { NextResponse } from 'next/server';

import { connectDB } from '../../../lib/db';
import NewsletterSubscriber from '../../../models/NewsletterSubscriber';
import {
  newsletterSubmissionSchema,
  MIN_COMPLETION_MS,
} from '../../../lib/validators/newsletter';
import { checkNewsletterRateLimit, clientIp } from '../../../lib/rateLimit';
import { verifyTurnstile } from '../../../lib/turnstile';
import { logRejection } from '../../../lib/rejections';
import {
  createConfirmToken,
  sendNewsletterConfirmation,
} from '../../../lib/newsletterEmail';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://treknclimb.com';

/**
 * How long before a pending signup will send another confirmation email.
 *
 * Without this, resubmitting the same address is an unlimited "send mail to
 * this stranger" button. The IP rate limit bounds one attacker; this bounds one
 * *victim*, which is the part that matters — an attacker rotating IPs still
 * cannot make us send the same person more than one email every ten minutes.
 */
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * The response every caller gets, whatever actually happened.
 *
 * **Identical for a new address, an already-pending one, an already-confirmed
 * one and a previously-unsubscribed one.** Any difference — wording, status
 * code, or a measurably different response time — turns this endpoint into an
 * oracle for "is this person subscribed to Trek & Climb", which is a fact about
 * someone else that we have no business disclosing to whoever asks.
 *
 * It is deliberately vague about what will happen next for the same reason: it
 * says to check your inbox, not "we have sent you an email", because for an
 * already-confirmed address we have not.
 */
const UNIFORM_RESPONSE = {
  ok: true,
  message:
    'Thank you. If that address needs confirming, there is a link waiting in your inbox.',
};

/**
 * POST /api/newsletter
 *
 * ## Order of operations
 *
 *   1. Parse and validate            — free
 *   2. Honeypot and time trap        — free
 *   3. Turnstile                     — network, before any write
 *   4. Rate limit                    — network, 3 per IP per hour
 *   5. Upsert the local record       — the point of no return
 *   6. Send the confirmation email   — after the write, never before
 *
 * Nothing here syncs to the marketing provider. **Only confirmed subscribers
 * sync**, and confirmation happens in the GET handler when the link is
 * clicked. An address typed in by someone else must never reach the marketing
 * platform.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);

  /* ---------------- 1. parse and validate ---------------- */

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const parsed = newsletterSubmissionSchema.safeParse(payload);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }

    // A malformed email is the one thing worth telling the sender, because it
    // is their own typo and reveals nothing about anyone else.
    return NextResponse.json(
      { error: 'Please check that address.', fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  /* ---------------- 2. honeypot and time trap ---------------- */

  if (data.company && data.company.trim() !== '') {
    console.warn(`[newsletter] Honeypot filled from ${ip} — discarded.`);

    await logRejection({
      form: 'newsletter',
      reason: 'honeypot',
      detail: `company="${data.company.trim().slice(0, 80)}"`,
      request,
      ip,
      payload: data,
    });

    return NextResponse.json(UNIFORM_RESPONSE, { status: 200 });
  }

  const elapsed = Date.now() - data.renderedAt;

  if (elapsed < MIN_COMPLETION_MS) {
    console.warn(`[newsletter] Submitted in ${elapsed}ms from ${ip} — discarded.`);

    await logRejection({
      form: 'newsletter',
      reason: 'time-trap',
      detail: `completed in ${elapsed}ms, threshold ${MIN_COMPLETION_MS}ms`,
      request,
      ip,
      payload: data,
    });

    return NextResponse.json(UNIFORM_RESPONSE, { status: 200 });
  }

  /* ---------------- 3. Turnstile ---------------- */

  const turnstile = await verifyTurnstile(data.turnstileToken, ip);

  if (!turnstile.ok) {
    await logRejection({
      form: 'newsletter',
      reason: 'turnstile',
      detail: turnstile.errorCodes?.join(', ') ?? 'verification failed',
      request,
      ip,
      payload: data,
    });

    return NextResponse.json(
      {
        // Not "reload": the form resets the check in place. See the booking route.
        error:
          'We could not confirm that you are a person. The check has been reset — please try again.',
      },
      { status: 400 }
    );
  }

  /* ---------------- 4. rate limit ---------------- */

  const rateLimit = await checkNewsletterRateLimit(ip);

  if (!rateLimit.allowed) {
    await logRejection({
      form: 'newsletter',
      reason: 'rate-limit',
      detail: rateLimit.limit,
      request,
      ip,
      payload: data,
    });

    // Still the uniform response. A 429 here would tell a script that its
    // earlier guesses were being processed, and a subscriber cannot do
    // anything useful with the information anyway.
    return NextResponse.json(UNIFORM_RESPONSE, { status: 200 });
  }

  if (rateLimit.degraded) {
    console.warn('[newsletter] Rate limit not enforced for this signup.');
  }

  /* ---------------- 5. upsert locally ---------------- */

  await connectDB();

  const email = data.email.toLowerCase().trim();

  try {
    const existing = await NewsletterSubscriber.findOne({ email });

    if (existing?.status === 'confirmed') {
      // Already on the list. Nothing to do, nothing to send, and the caller
      // gets the same response as everyone else.
      return NextResponse.json(UNIFORM_RESPONSE, { status: 200 });
    }

    if (existing) {
      // Pending, or previously unsubscribed and coming back. Both get a fresh
      // token and a fresh email — subject to the cooldown, so a repeat submit
      // cannot be used to bombard the address.
      const lastTouched = existing.updatedAt?.getTime() ?? 0;

      if (Date.now() - lastTouched < RESEND_COOLDOWN_MS) {
        console.warn(`[newsletter] Resend cooldown active for ${email}.`);
        return NextResponse.json(UNIFORM_RESPONSE, { status: 200 });
      }

      const { token, expiresAt } = createConfirmToken();

      existing.status = 'pending';
      existing.confirmToken = token;
      existing.confirmTokenExpiresAt = expiresAt;
      existing.confirmedAt = null;
      existing.unsubscribedAt = null;
      if (data.source) existing.source = data.source;

      // findOne → assign → save(), per the convention. Nothing here has a
      // validate hook, but staying consistent is cheaper than remembering
      // which models are safe to shortcut.
      await existing.save();

      await sendNewsletterConfirmation(email, token, SITE_URL);

      return NextResponse.json(UNIFORM_RESPONSE, { status: 200 });
    }

    const { token, expiresAt } = createConfirmToken();

    await NewsletterSubscriber.create({
      email,
      status: 'pending',
      confirmToken: token,
      confirmTokenExpiresAt: expiresAt,
      source: data.source,
    });

    /* ---------------- 6. email, after the write ---------------- */

    await sendNewsletterConfirmation(email, token, SITE_URL);

    return NextResponse.json(UNIFORM_RESPONSE, { status: 200 });
  } catch (error) {
    console.error('[newsletter] Failed to record a signup:', error);

    // The one case that is not the uniform response: something genuinely broke
    // on our side, and telling the person to try again is more useful than
    // pretending it worked. It leaks nothing — it is true for any address.
    return NextResponse.json(
      { error: 'Something went wrong on our side. Please try again in a moment.' },
      { status: 500 }
    );
  }
}
