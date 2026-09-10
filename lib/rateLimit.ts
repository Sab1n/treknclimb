import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiting for public form submissions, against Upstash Redis.
 *
 * The counter has to live in shared storage: on serverless hosting every
 * invocation is a separate process with its own memory, so an in-memory
 * counter would reset constantly and enforce nothing.
 *
 * **The booking endpoint fails open.** If Upstash is unreachable, or simply
 * not configured yet, the submission is allowed and the reason is logged.
 * Losing a real inquiry is worse than letting spam through — this is the one
 * conversion event on the site. Admin login will fail *closed*, for the
 * opposite reason.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

/** Null until both env vars exist, so the form is testable before Upstash is. */
const redis = url && token ? new Redis({ url, token }) : null;

if (!redis) {
  console.warn(
    '[rateLimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — rate limiting is DISABLED. Fine locally, not acceptable in production.'
  );
}

/**
 * Three independent limits per CLAUDE.md. A submission has to pass all of
 * them, and each has its own Redis key prefix so they count separately.
 */
const limiters = redis
  ? {
      ipHourly: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 h'),
        prefix: 'tnc:booking:ip:h',
        analytics: false,
      }),
      ipDaily: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, '24 h'),
        prefix: 'tnc:booking:ip:d',
        analytics: false,
      }),
      emailDaily: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(3, '24 h'),
        prefix: 'tnc:booking:email:d',
        analytics: false,
      }),
    }
  : null;

export interface RateLimitVerdict {
  allowed: boolean;
  /** True when no check actually happened — unconfigured or unreachable. */
  degraded: boolean;
  /** Which limit rejected the request, for logging. Never shown to the visitor. */
  limit?: 'ip-hourly' | 'ip-daily' | 'email-daily';
}

export async function checkBookingRateLimit(
  ip: string,
  email: string
): Promise<RateLimitVerdict> {
  if (!limiters) return { allowed: true, degraded: true };

  try {
    const [ipHourly, ipDaily, emailDaily] = await Promise.all([
      limiters.ipHourly.limit(ip),
      limiters.ipDaily.limit(ip),
      limiters.emailDaily.limit(email.toLowerCase()),
    ]);

    if (!ipHourly.success) {
      return { allowed: false, degraded: false, limit: 'ip-hourly' };
    }
    if (!ipDaily.success) {
      return { allowed: false, degraded: false, limit: 'ip-daily' };
    }
    if (!emailDaily.success) {
      return { allowed: false, degraded: false, limit: 'email-daily' };
    }

    return { allowed: true, degraded: false };
  } catch (error) {
    // Fail open, loudly. An inquiry lost to an infrastructure wobble is a
    // customer lost; spam is an inbox annoyance.
    console.error(
      '[rateLimit] Upstash unreachable — allowing the submission (fail open):',
      error
    );

    return { allowed: true, degraded: true };
  }
}

/**
 * The client IP, as seen through whatever proxy is in front of the app.
 *
 * `request.ip` no longer exists in recent Next versions, so this reads the
 * forwarding headers. The first entry of `x-forwarded-for` is the original
 * client; the rest are proxies.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Newsletter signups: 3 per IP per hour.
 *
 * Tighter than the booking limit, and for a different reason. A booking form
 * is the conversion event and the cost of blocking a real one is a lost
 * customer, so it is generous and fails open. A newsletter signup is worth far
 * less, and the abuse it enables is worse: each submission sends a
 * confirmation email to an address the sender chose, so an unbounded endpoint
 * is a mail bomb aimed at a third party using our sending reputation.
 *
 * It still fails open on an Upstash outage. The honeypot, the time trap and
 * Turnstile all remain in front of it, and the per-address resend cooldown in
 * the route handler bounds the damage independently of Redis being reachable.
 */
const newsletterLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 h'),
      prefix: 'tnc:newsletter:ip:h',
      analytics: false,
    })
  : null;

export async function checkNewsletterRateLimit(
  ip: string
): Promise<RateLimitVerdict> {
  if (!newsletterLimiter) return { allowed: true, degraded: true };

  try {
    const result = await newsletterLimiter.limit(ip);

    return result.success
      ? { allowed: true, degraded: false }
      : { allowed: false, degraded: false, limit: 'ip-hourly' };
  } catch (error) {
    console.error(
      '[rateLimit] Upstash unreachable for a newsletter signup — allowing:',
      error
    );

    return { allowed: true, degraded: true };
  }
}
