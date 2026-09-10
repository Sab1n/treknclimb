/**
 * The server-side half of the admin guard.
 *
 * `middleware.ts` blocks unauthenticated requests before they reach a route,
 * but middleware alone is not an authorisation model — it is a matcher over
 * paths, and a matcher is one config edit away from missing a route. Anything
 * that reads admin data calls this as well, so a page added under a path the
 * matcher does not cover still fails closed.
 *
 * **Returns false unconditionally today**, because admin authentication is not
 * built. See `middleware.ts` for what unlocks it.
 */
export async function hasAdminSession(): Promise<boolean> {
  /*
   * TODO(admin-auth): read the session cookie, verify its signature and expiry
   * against JWT_SECRET, and check the token version on the Admin document.
   */
  return false;
}

/**
 * Throws unless the caller is an authenticated admin.
 *
 * Used by admin route handlers, which have no rendering path to fall back to.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await hasAdminSession())) {
    throw new Error('Admin authentication is required and is not configured.');
  }
}
