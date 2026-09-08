/**
 * Server-side verification of a Cloudflare Turnstile token.
 *
 * The widget in the browser proves nothing on its own — the token it produces
 * only means something once Cloudflare has confirmed it, which can only happen
 * server-side with the secret key. A form that renders the widget and never
 * verifies is decoration.
 *
 * Degrades to "not configured": with no secret key the check is skipped and
 * the submission proceeds, so the form is testable before the Cloudflare
 * account exists. It logs loudly, because shipping in that state means the
 * form has no bot protection beyond the honeypot and time trap.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerdict {
  ok: boolean;
  /** True when no verification happened because no secret is configured. */
  skipped: boolean;
  errorCodes?: string[];
}

export async function verifyTurnstile(
  token: string | undefined,
  ip: string
): Promise<TurnstileVerdict> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.warn(
      '[turnstile] TURNSTILE_SECRET_KEY not set — bot verification SKIPPED.'
    );
    return { ok: true, skipped: true };
  }

  if (!token) return { ok: false, skipped: false, errorCodes: ['missing-input-response'] };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip !== 'unknown') body.set('remoteip', ip);

    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      // Never cache a one-time-use token check.
      cache: 'no-store',
    });

    const result = (await response.json()) as {
      success: boolean;
      'error-codes'?: string[];
    };

    return {
      ok: result.success === true,
      skipped: false,
      errorCodes: result['error-codes'],
    };
  } catch (error) {
    // Cloudflare being unreachable is an infrastructure failure, not evidence
    // of a bot. Same reasoning as the rate limiter: fail open on the one
    // endpoint whose job is to not lose inquiries.
    console.error('[turnstile] Verification request failed — allowing:', error);
    return { ok: true, skipped: true };
  }
}
