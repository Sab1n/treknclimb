/**
 * The marketing-email provider.
 *
 * ## Why this is not Resend
 *
 * Resend sends the transactional mail this site depends on: the booking
 * notification to the office and the acknowledgement to the customer. A
 * newsletter broadcast is thousands of sends in a few minutes, and if it shares
 * an account with the booking pipeline it can exhaust the quota or damage the
 * sending reputation that inquiry email rides on. **A marketing send must never
 * be able to stop a booking notification**, and the only reliable way to
 * guarantee that is a separate provider with a separate quota.
 *
 * The double-opt-in confirmation email is the exception and stays on Resend: it
 * is transactional, one message per signup, and it has to arrive.
 *
 * ## Degrading
 *
 * With no credentials configured, every call here returns `skipped` and logs
 * loudly. **Sync failure must never fail the request** — the local record is
 * written first and a failed sync leaves `syncedAt: null`, which the retry
 * script picks up. Losing a signup because a third-party API had a bad minute
 * would be the same mistake as losing an inquiry to an email failure.
 *
 * ## Neither integration has been run against a live account
 *
 * There is no provider account yet. The request shapes below are written from
 * each provider's documented API, but they are **unverified** — the first real
 * signup is the test. The `skipped` path is what has actually been exercised.
 */

export type NewsletterProviderName = 'emailoctopus' | 'brevo';

const providerName = (
  process.env.NEWSLETTER_PROVIDER ?? 'emailoctopus'
).toLowerCase() as NewsletterProviderName;

const apiKey = process.env.NEWSLETTER_API_KEY;
const listId = process.env.NEWSLETTER_LIST_ID;

const configured = Boolean(apiKey && listId);

if (!configured) {
  console.warn(
    '[newsletter] NEWSLETTER_API_KEY / NEWSLETTER_LIST_ID not set — confirmed subscribers will be stored locally and NOT synced to any marketing provider.'
  );
}

export interface SyncResult {
  ok: boolean;
  /** True when nothing was attempted because no provider is configured. */
  skipped: boolean;
  /** The provider's contact id, when it gives one back. */
  contactId?: string;
  error?: string;
}

/**
 * Adds a confirmed subscriber to the marketing list.
 *
 * Only ever called for `confirmed` records. A pending address has not proved it
 * belongs to the person who typed it, and pushing it to a marketing platform
 * would make us the ones who spammed them.
 */
export async function syncSubscriber(
  email: string,
  source?: string
): Promise<SyncResult> {
  if (!configured) {
    console.warn(
      `[newsletter] Not configured — would have synced ${email} to the marketing list.`
    );
    return { ok: false, skipped: true };
  }

  try {
    switch (providerName) {
      case 'brevo':
        return await syncToBrevo(email, source);
      case 'emailoctopus':
      default:
        return await syncToEmailOctopus(email, source);
    }
  } catch (error) {
    // Network-level failure. Same shape as an API rejection: the caller logs
    // it, leaves syncedAt null, and the retry script picks it up later.
    console.error(`[newsletter] Sync threw for ${email}:`, error);

    return {
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

/**
 * EmailOctopus v2. Bearer token, list id in the path.
 *
 * `status: SUBSCRIBED` because we have already run double opt-in ourselves —
 * asking EmailOctopus to send its own confirmation would mean two confirmation
 * emails for one signup, and a second chance to drop out of a list they have
 * already joined.
 */
async function syncToEmailOctopus(
  email: string,
  source?: string
): Promise<SyncResult> {
  const response = await fetch(
    `https://api.emailoctopus.com/lists/${listId}/contacts`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email_address: email,
        status: 'SUBSCRIBED',
        fields: source ? { SignupSource: source } : undefined,
      }),
      cache: 'no-store',
    }
  );

  const payload = (await response.json().catch(() => null)) as {
    id?: string;
  } | null;

  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      error: `EmailOctopus responded ${response.status}`,
    };
  }

  return { ok: true, skipped: false, contactId: payload?.id };
}

/**
 * Brevo v3. `api-key` header, list ids in the body.
 *
 * `updateEnabled: true` so re-adding an address that is already on the list is
 * an update rather than a 400 — which is the ordinary case when someone
 * re-subscribes after unsubscribing.
 */
async function syncToBrevo(
  email: string,
  source?: string
): Promise<SyncResult> {
  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'api-key': apiKey as string,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      listIds: [Number(listId)],
      updateEnabled: true,
      attributes: source ? { SIGNUP_SOURCE: source } : undefined,
    }),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as {
    id?: number;
  } | null;

  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      error: `Brevo responded ${response.status}`,
    };
  }

  return {
    ok: true,
    skipped: false,
    contactId: payload?.id ? String(payload.id) : undefined,
  };
}

/** Which provider is configured, for the admin screen's status line. */
export function providerStatus(): {
  name: NewsletterProviderName;
  configured: boolean;
} {
  return { name: providerName, configured };
}
