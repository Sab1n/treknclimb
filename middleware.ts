import { NextResponse, type NextRequest } from 'next/server';

import {
  ADMIN_SESSION_COOKIE,
  ABSOLUTE_SESSION_TTL_SECONDS,
  verifySessionToken,
  refreshSessionToken,
  shouldRefresh,
  sessionCookieOptions,
} from './lib/auth';

/**
 * Admin route guard, and the sliding half of the session.
 *
 * ## What this can and cannot check
 *
 * Middleware runs on the **Edge runtime**: no Node `crypto`, no TCP, so no
 * Mongoose. It can verify that a token is authentically signed and unexpired —
 * which is enough to turn away every forged or stale cookie before a request
 * costs a database round trip — but it **cannot check whether the session has
 * been revoked**, because that needs the `tokenVersion` on the admin record.
 *
 * So this is a filter, not the authorisation model. `getAdminSession()` in
 * `lib/adminAuth.ts` is the authority, and every admin page and route handler
 * calls it. Two gates: a matcher is one config edit away from missing a route,
 * and a signature check is one database write away from being out of date.
 *
 * `./lib/auth` is imported; `./lib/adminAuth` must never be. The first is
 * edge-safe by construction, the second pulls in Mongoose and bcrypt.
 *
 * ## Sliding refresh
 *
 * This runs on every admin request, which makes it the natural place to push
 * the expiry forward. A token past halfway through its two hours is re-signed
 * with a new `exp` and the **same `sst`**, so activity extends the session but
 * never past twelve hours from the original login. `refreshSessionToken`
 * returns null at the cap and the session simply ends.
 *
 * ## 404, not 401
 *
 * An authentication challenge confirms the route exists and is worth attacking.
 * An unauthenticated request to `/api/admin/...` gets the same 404 an unmapped
 * URL would. Pages are the exception: a **redirect to the login form**, because
 * an admin whose two hours ran out mid-task should land somewhere they can do
 * something about it, and the existence of `/admin` is not a secret worth
 * protecting from someone who is about to type a password into it.
 */

/**
 * Paths that must stay reachable without a session, or nobody can ever get one.
 *
 * Exact matches, not prefixes. A `startsWith` check here would let
 * `/admin/login-does-not-exist` — or worse, `/admin/loginx/secret` — through
 * the guard, which is a classic way to open a hole while adding an allow-list.
 */
const PUBLIC_ADMIN_PATHS = new Set([
  '/admin/login',
  '/api/admin/login',
  '/api/admin/logout',
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const claims = await verifySessionToken(token);

  if (!claims) {
    // API routes get nothing. Pages get sent somewhere useful.
    if (pathname.startsWith('/api/')) {
      return new NextResponse(null, { status: 404 });
    }

    const loginUrl = new URL('/admin/login', request.url);

    /*
     * Where to return to after signing in. Stored as a path only and
     * re-validated on the way out — a full URL here would be an open redirect
     * on the one page where someone is about to type a password.
     */
    loginUrl.searchParams.set('next', pathname);

    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();

  if (shouldRefresh(claims)) {
    const refreshed = await refreshSessionToken(claims);

    if (refreshed) {
      /*
       * The cookie's `maxAge` is the *absolute* remaining time, not the token's
       * two hours. If the browser kept the cookie for two hours past the cap it
       * would keep sending a token that every check rejects, and the admin
       * would see redirects to a login page they are apparently already past.
       */
      const remaining =
        claims.sst + ABSOLUTE_SESSION_TTL_SECONDS - Math.floor(Date.now() / 1000);

      response.cookies.set(
        ADMIN_SESSION_COOKIE,
        refreshed,
        sessionCookieOptions(Math.max(remaining, 0))
      );
    }
    // No refresh means the absolute cap has passed. The request is still served
    // — the token is valid for a few more minutes — and the next one, or
    // `getAdminSession()`, will end the session. Cutting it off mid-response
    // would mean a half-rendered page for the sake of a few minutes.
  }

  return response;
}

export const config = {
  /*
   * Both trees. `/api/admin` is what actually returns the data, so guarding
   * only the pages would leave the newsletter CSV export wide open — the
   * classic version of this mistake.
   */
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
