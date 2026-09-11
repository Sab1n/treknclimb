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

/* ------------------------------------------------------------------ *
 * Admin login — the one limiter that fails CLOSED
 * ------------------------------------------------------------------ */

/**
 * Five failed attempts per 15 minutes, then a 30-minute lockout.
 *
 * **This fails closed, which is the opposite of every other limiter in this
 * file.** On the booking endpoint a blocked real customer is worse than spam
 * getting through, so an Upstash outage lets submissions past. Here the risk
 * runs the other way: an outage that disabled the limiter would turn the login
 * form into an unmetered password oracle, and the cost of being locked out of
 * the admin for the length of an incident is an inconvenience to one person.
 *
 * Two keys, because they defend against different attacks:
 *
 * - **By email.** Protects one account from being ground down. This is the
 *   lockout CLAUDE.md specifies.
 * - **By IP.** Protects against spraying — one guess each against a hundred
 *   addresses never trips a per-account counter.
 *
 * Only *failures* are counted. A busy admin signing in repeatedly from a shared
 * office IP must never lock themselves out by succeeding.
 */

const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_FAILURE_WINDOW = '15 m';
const LOCKOUT_SECONDS = 30 * 60;

const loginLimiters = redis
  ? {
      byEmail: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW),
        prefix: 'tnc:login:fail:email',
        analytics: false,
      }),
      byIp: new Ratelimit({
        redis,
        // Looser per IP than per email: an office behind one NAT address is a
        // real thing, and the per-account lockout is the tighter control.
        limiter: Ratelimit.slidingWindow(LOGIN_FAILURE_LIMIT * 4, LOGIN_FAILURE_WINDOW),
        prefix: 'tnc:login:fail:ip',
        analytics: false,
      }),
    }
  : null;

export interface LoginGateVerdict {
  allowed: boolean;
  /** Seconds remaining on an active lockout, when that is why it was refused. */
  lockedForSeconds?: number;
  /** Why the attempt was refused, for the log. Never shown to the visitor. */
  reason?: 'locked' | 'unconfigured' | 'unreachable';
}

function emailLockKey(email: string): string {
  return `tnc:login:lock:email:${email.toLowerCase()}`;
}

/**
 * A separate lockout key for the address, not the account.
 *
 * Without it the IP limiter had nowhere to put its verdict and fell back to
 * locking whichever email the sprayer happened to try last — which punishes a
 * random real account and lets the attacker carry on with the next address.
 */
function ipLockKey(ip: string): string {
  return `tnc:login:lock:ip:${ip}`;
}

/**
 * Called before a password is checked. Refuses if the account is locked, or if
 * the limiter cannot be consulted.
 *
 * The unconfigured case is split deliberately:
 *
 * - **In production, no Upstash means no login.** Failing closed has to mean
 *   closed, and "the env vars were never set" is the most likely way a limiter
 *   ends up absent on a real deployment.
 * - **In development it is allowed, loudly.** Requiring an Upstash account
 *   before anyone can sign in locally would be failing closed against the
 *   developer rather than against an attacker.
 */
export async function checkAdminLoginAllowed(
  email: string,
  ip: string
): Promise<LoginGateVerdict> {
  if (!redis || !loginLimiters) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[rateLimit] Admin login BLOCKED: Upstash is not configured and login fails closed in production. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.'
      );
      return { allowed: false, reason: 'unconfigured' };
    }

    console.warn(
      '[rateLimit] Upstash not configured — admin login brute-force protection is DISABLED. Development only; this refuses to run in production.'
    );
    return { allowed: true };
  }

  try {
    // Both locks, in one round trip. Either is enough to refuse.
    const [emailLocked, ipLocked] = await Promise.all([
      redis.get<number>(emailLockKey(email)),
      redis.get<number>(ipLockKey(ip)),
    ]);

    if (emailLocked || ipLocked) {
      const key = emailLocked ? emailLockKey(email) : ipLockKey(ip);
      const ttl = await redis.ttl(key);

      return {
        allowed: false,
        lockedForSeconds: ttl > 0 ? ttl : LOCKOUT_SECONDS,
        reason: 'locked',
      };
    }

    return { allowed: true };
  } catch (error) {
    // Fail closed. See the note above — this is the deliberate inversion.
    console.error(
      '[rateLimit] Upstash unreachable — REFUSING the admin login attempt (fails closed):',
      error
    );

    return { allowed: false, reason: 'unreachable' };
  }
}

/**
 * Records a failed attempt and locks the account if it has run out of them.
 *
 * Never throws: a limiter that cannot record a failure must not turn a wrong
 * password into a 500, which would tell an attacker their guess did something
 * different from the others.
 */
export async function recordFailedLogin(
  email: string,
  ip: string
): Promise<{ locked: boolean }> {
  if (!redis || !loginLimiters) return { locked: false };

  try {
    const [byEmail, byIp] = await Promise.all([
      loginLimiters.byEmail.limit(email.toLowerCase()),
      loginLimiters.byIp.limit(ip),
    ]);

    /*
     * `nx: true` so an existing lockout is not extended by further attempts —
     * otherwise an attacker could hold a real admin out indefinitely by
     * guessing once every few minutes.
     */
    const writes: Promise<unknown>[] = [];

    if (!byEmail.success) {
      writes.push(
        redis.set(emailLockKey(email), Date.now(), {
          ex: LOCKOUT_SECONDS,
          nx: true,
        })
      );
    }

    if (!byIp.success) {
      writes.push(
        redis.set(ipLockKey(ip), Date.now(), { ex: LOCKOUT_SECONDS, nx: true })
      );
    }

    if (writes.length > 0) {
      await Promise.all(writes);

      console.warn(
        `[rateLimit] Admin login locked for ${LOCKOUT_SECONDS / 60} min — ` +
          `${!byEmail.success ? `account ${email}` : ''}` +
          `${!byEmail.success && !byIp.success ? ' and ' : ''}` +
          `${!byIp.success ? `address ${ip}` : ''}.`
      );

      return { locked: true };
    }

    return { locked: false };
  } catch (error) {
    console.error('[rateLimit] Could not record a failed admin login:', error);
    return { locked: false };
  }
}

/** Clears the failure state after a successful sign-in. */
export async function clearFailedLogins(email: string): Promise<void> {
  if (!redis) return;

  try {
    /*
     * Only the account lock. The IP lock stays: a successful sign-in from an
     * address that has just failed twenty times against other accounts is
     * exactly the case where the sprayer has finally guessed one, and clearing
     * the IP lock there would hand them the rest of the window.
     */
    await redis.del(emailLockKey(email));
  } catch (error) {
    console.error('[rateLimit] Could not clear the admin lockout key:', error);
  }
}
