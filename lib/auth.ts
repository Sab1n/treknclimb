import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * Admin session tokens.
 *
 * ## This module must stay edge-safe
 *
 * `middleware.ts` runs on the Edge runtime, where there is no Node `crypto`,
 * no filesystem and no TCP — so no Mongoose and no bcrypt. **Nothing in this
 * file may import either, directly or transitively**, or the middleware stops
 * building. That is why signing and verification live here on their own and the
 * database half lives in `lib/adminAuth.ts`.
 *
 * `jose` rather than `jsonwebtoken` for the same reason: `jsonwebtoken` is
 * built on Node's `crypto` module and does not run on the edge. Using `jose`
 * on **both** sides is deliberate — two JWT libraries in one codebase means two
 * sets of defaults for algorithm, clock skew and expiry handling, and the day
 * they disagree is the day a token verifies in one place and not the other.
 *
 * ## What the token carries, and what it does not
 *
 * The payload is an identifier, a token version and two timestamps. **It is not
 * a place to cache the admin's name or email** — a JWT is signed, not
 * encrypted, so anything in it is readable by anyone holding the cookie, and
 * anything cached in it is stale the moment the record changes.
 *
 * `tv` (token version) is the revocation mechanism. Every token is signed with
 * the version current at login; bumping `Admin.tokenVersion` on a password
 * change invalidates every issued token at once with no session store to
 * purge. **The check itself needs the database, so it happens in
 * `lib/adminAuth.ts`, not here and not in middleware.**
 *
 * ## Sliding refresh with an absolute cap
 *
 * Two clocks, which is the whole design:
 *
 * - `exp` — two hours, pushed forward on activity. Someone working in the
 *   admin is not logged out mid-edit.
 * - `sst` (session started) — fixed at login and carried unchanged through
 *   every refresh. Twelve hours after it, no refresh is issued regardless of
 *   activity, and the session ends.
 *
 * Without the cap, "sliding" means a stolen cookie is valid forever as long as
 * it is used. The cap is what makes a compromised session expire on its own.
 */

/** The session cookie. `__Host-` is not used — see `sessionCookieOptions`. */
export const ADMIN_SESSION_COOKIE = 'tnc_admin_session';

/** Rolling window. Refreshed on activity. */
export const ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60;

/** Hard ceiling from first login. No refresh is issued past it. */
export const ABSOLUTE_SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * Refresh only when the token is more than halfway through its life.
 *
 * Re-signing on every request would mean a `Set-Cookie` on every navigation and
 * an admin whose session effectively never ends while a tab is open polling.
 * Half the TTL keeps the refresh cheap and the sliding behaviour intact.
 */
export const REFRESH_THRESHOLD_SECONDS = ACCESS_TOKEN_TTL_SECONDS / 2;

export interface AdminTokenClaims extends JWTPayload {
  /** Admin document id, as a string. */
  sub: string;
  /** Token version at issue. Checked against the database in adminAuth. */
  tv: number;
  /** Session start, epoch seconds. Fixed at login, carried through refreshes. */
  sst: number;
}

/**
 * The signing key.
 *
 * Read at call time rather than at module load: an import-time throw in an
 * edge module fails the whole middleware for every request including public
 * ones, and it fails during `next build` too. Throwing at call time means a
 * missing secret breaks admin auth loudly and leaves the public site alone.
 */
function signingKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or shorter than 32 characters. Admin authentication cannot run.'
    );
  }

  return new TextEncoder().encode(secret);
}

/** Issues a token for a fresh login. `sst` starts now. */
export async function createSessionToken(
  adminId: string,
  tokenVersion: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ tv: tokenVersion, sst: now })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(signingKey());
}

/**
 * Issues a refreshed token, carrying `sst` and `tv` forward unchanged.
 *
 * Returns `null` when the absolute cap has passed — the caller treats that as
 * "session over", not as an error.
 */
export async function refreshSessionToken(
  claims: AdminTokenClaims
): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);

  if (now >= claims.sst + ABSOLUTE_SESSION_TTL_SECONDS) return null;

  return new SignJWT({ tv: claims.tv, sst: claims.sst })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(signingKey());
}

/**
 * Verifies a token's signature, expiry and absolute cap.
 *
 * **This does not check the token version** — that needs the database. A token
 * that passes here is authentic and unexpired; whether the session behind it
 * is still valid is `lib/adminAuth.ts`'s question.
 *
 * Returns `null` for every failure rather than throwing, and never says which
 * failure it was. A forged signature, an expired token and a malformed string
 * are all the same answer to whoever sent them.
 */
export async function verifySessionToken(
  token: string | undefined
): Promise<AdminTokenClaims | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ['HS256'],
    });

    const { sub, tv, sst } = payload;

    // `jwtVerify` guarantees the signature and `exp`; the shape of our own
    // claims is still ours to check, because a token signed with this secret
    // for some other purpose would otherwise pass.
    if (typeof sub !== 'string' || typeof tv !== 'number' || typeof sst !== 'number') {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);

    // The absolute cap, enforced on read as well as on refresh. A token whose
    // `exp` is still in the future but whose session began more than twelve
    // hours ago is dead — otherwise the last-issued token of a long session
    // would outlive the cap by up to two hours.
    if (now >= sst + ABSOLUTE_SESSION_TTL_SECONDS) return null;

    return { ...payload, sub, tv, sst };
  } catch {
    return null;
  }
}

/** True when a valid token is close enough to expiry to be worth re-issuing. */
export function shouldRefresh(claims: AdminTokenClaims): boolean {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = claims.exp ?? 0;

  return expiresAt - now < REFRESH_THRESHOLD_SECONDS;
}

/**
 * Cookie options for the session.
 *
 * - **`httpOnly`** — the token is never readable from JavaScript, so an XSS on
 *   an admin page cannot exfiltrate the session.
 * - **`secure` in production only.** Locally the dev server is plain HTTP and a
 *   Secure cookie would simply never be stored, which looks exactly like a
 *   broken login.
 * - **`sameSite: 'lax'`** — per CLAUDE.md. It blocks the cookie on cross-site
 *   POSTs, which is the CSRF vector that matters, while still sending it when
 *   an admin follows a link into the admin from elsewhere. `strict` would log
 *   them out every time they arrived from an external link.
 * - **`path: '/'`** rather than `/admin`, so the logout endpoint under
 *   `/api/admin` and any future admin route share one cookie. A path-scoped
 *   cookie that does not match the clearing request is a session that cannot be
 *   ended.
 *
 * The `__Host-` prefix is deliberately not used: it requires `Secure`, which
 * rules out local HTTP development, and the protection it adds over these
 * options is against subdomain cookie-shadowing on a domain that has no
 * subdomains.
 */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
