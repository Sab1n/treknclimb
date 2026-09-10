import crypto from 'node:crypto';
import { Resend } from 'resend';

/**
 * The double-opt-in confirmation email.
 *
 * **This one stays on Resend**, unlike the broadcasts. It is transactional —
 * one message, triggered by one person's action, and it has to arrive or the
 * signup dies. Routing it through the marketing provider would put a message
 * the flow depends on behind a bulk-sending queue.
 *
 * Like the booking mail, nothing here throws. The local record is written
 * first, so a mail failure leaves a `pending` row that the purge script clears
 * after seven days rather than a broken request.
 */

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;

const resend = apiKey ? new Resend(apiKey) : null;

/** How long a confirmation link stays valid. Matches the pending purge window. */
export const CONFIRM_TOKEN_TTL_DAYS = 7;

/**
 * A single-use confirmation token.
 *
 * `randomBytes`, not `Math.random()`. This value is the only thing standing
 * between a stranger and confirming someone else's address, so it has to come
 * from a CSPRNG — 32 bytes is 256 bits of entropy, which is not guessable and
 * not worth trying.
 */
export function createConfirmToken(): {
  token: string;
  expiresAt: Date;
} {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CONFIRM_TOKEN_TTL_DAYS);

  return { token: crypto.randomBytes(32).toString('hex'), expiresAt };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ConfirmEmailOutcome {
  sent: boolean;
  /** True when nothing was sent because Resend is not configured. */
  skipped: boolean;
}

export async function sendNewsletterConfirmation(
  email: string,
  token: string,
  siteUrl: string
): Promise<ConfirmEmailOutcome> {
  const confirmUrl = `${siteUrl}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;

  const html = `
    <p>Hello,</p>
    <p>Someone — we hope you — asked for our field notes from Pokhara. One click confirms it:</p>
    <p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#F0A02A;color:#0F1A24;padding:12px 22px;border-radius:999px;font-weight:600;text-decoration:none">Confirm your subscription</a></p>
    <p style="color:#5E7180;font-size:13px">Or paste this into your browser:<br>${escapeHtml(confirmUrl)}</p>
    <p style="color:#5E7180;font-size:13px">The link works for ${CONFIRM_TOKEN_TTL_DAYS} days.</p>
    <p><strong>If this was not you, do nothing.</strong> We will not add you to anything and the request is deleted automatically.</p>
    <p>— Trek &amp; Climb Adventure, Pokhara</p>
  `;

  if (!resend || !from) {
    console.warn(
      `[newsletter] Resend not configured — would have emailed a confirmation link to ${email}.`,
      { confirmUrl }
    );
    return { sent: false, skipped: true };
  }

  try {
    await resend.emails.send({
      from,
      to: email,
      subject: 'Confirm your subscription to Trek & Climb field notes',
      html,
    });

    return { sent: true, skipped: false };
  } catch (error) {
    console.error(
      `[newsletter] Confirmation email FAILED for ${email} — the pending record stands and will be purged in ${CONFIRM_TOKEN_TTL_DAYS} days:`,
      error
    );

    return { sent: false, skipped: false };
  }
}
