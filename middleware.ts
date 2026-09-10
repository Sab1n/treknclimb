import { NextResponse, type NextRequest } from 'next/server';

/**
 * Admin route guard.
 *
 * **Fails closed, and right now that means everything under `/admin` and
 * `/api/admin` returns 404 — including for you.** That is deliberate, not an
 * oversight.
 *
 * The admin newsletter screen lists real subscriber email addresses and
 * exports them as CSV. Shipping that reachable would be a data breach waiting
 * for someone to guess a URL, and the admin authentication described in
 * CLAUDE.md — bcrypt, JWT in an httpOnly cookie, token versioning — is not
 * built yet. The two options were to leave the pages open until it is, or to
 * lock them until it is. Locking is the only one that is defensible.
 *
 * **A cookie's presence is not authentication**, so this does not pretend
 * otherwise: anyone can set a cookie. The presence check below is a cheap
 * first gate that runs on the edge; the real verification belongs in
 * `lib/auth.ts` and is called by the pages themselves. Until that exists,
 * `hasVerifiedAdminSession()` returns false and nothing behind this guard
 * serves.
 *
 * ## Unlocking it
 *
 * When admin auth lands, replace the body of `hasVerifiedAdminSession()` with
 * a real signature check (an edge-compatible JWT library — `jsonwebtoken` does
 * not run on the edge runtime), and remove `requireAdmin()`'s hard stop in
 * `lib/adminAuth.ts`. Both are marked.
 *
 * 404 rather than 401 or a redirect: an authentication challenge confirms the
 * route exists. A 404 tells an unauthenticated visitor nothing at all.
 */

const ADMIN_SESSION_COOKIE = 'tnc_admin_session';

function hasVerifiedAdminSession(request: NextRequest): boolean {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) return false;

  /*
   * TODO(admin-auth): verify the JWT signature and expiry here.
   *
   * Returning false unconditionally is the correct behaviour until that
   * exists. Changing this line to `return true` would make every admin page
   * reachable by anyone who sets one cookie — the failure this comment is here
   * to prevent.
   */
  return false;
}

export function middleware(request: NextRequest) {
  if (hasVerifiedAdminSession(request)) return NextResponse.next();

  console.warn(
    `[middleware] Blocked ${request.nextUrl.pathname} — admin authentication is not built yet.`
  );

  return new NextResponse(null, { status: 404 });
}

export const config = {
  /*
   * Both trees. `/api/admin` is the one that actually returns the data, so
   * guarding only the pages would leave the CSV export wide open — the classic
   * version of this mistake.
   */
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
