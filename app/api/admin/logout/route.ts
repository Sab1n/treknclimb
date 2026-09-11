import { NextResponse } from 'next/server';

import { ADMIN_SESSION_COOKIE, sessionCookieOptions } from '../../../../lib/auth';

/**
 * POST /api/admin/logout
 *
 * POST, not GET. A GET logout can be triggered by any `<img src>` on any page
 * on the internet, which is a nuisance CSRF — not dangerous, but it means an
 * admin can be signed out by visiting the wrong site. `SameSite=Lax` blocks the
 * cookie on a cross-site POST, so this is safe from the same trick.
 *
 * Deliberately reachable without a valid session: the whole point is to be able
 * to clear a cookie, and refusing to do so for someone whose token has already
 * expired would leave a dead cookie in the browser for twelve hours.
 *
 * The server has no session state to discard — that is what a stateless JWT
 * buys and costs. Clearing the cookie ends the session for this browser; to end
 * it everywhere, bump `Admin.tokenVersion`.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });

  // maxAge 0 with the same options the cookie was set with. A clearing cookie
  // whose path or sameSite differs does not match, and the browser keeps the
  // original — a logout that silently does nothing.
  response.cookies.set(ADMIN_SESSION_COOKIE, '', sessionCookieOptions(0));

  return response;
}
