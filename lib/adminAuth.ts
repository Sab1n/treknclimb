import { cookies } from 'next/headers';
import { cache } from 'react';
import bcrypt from 'bcryptjs';

import { connectDB } from './db';
import Admin, { IAdmin } from '../models/Admin';
import { ADMIN_SESSION_COOKIE, verifySessionToken } from './auth';

/**
 * The database half of admin authentication.
 *
 * **Node runtime only.** This imports Mongoose and bcrypt, neither of which
 * runs on the edge, so `middleware.ts` must never import it — see the note at
 * the top of `lib/auth.ts` for why the split exists.
 *
 * ## Two gates, and why both
 *
 * The middleware verifies the token's signature and expiry before a request
 * reaches a route. That is a cheap filter, not an authorisation model: a
 * middleware matcher is one config edit away from missing a route, and it
 * cannot reach the database to ask whether the session has been revoked.
 *
 * So every page and route handler that touches admin data calls this as well.
 * A route added under a path the matcher does not cover still fails closed, and
 * **token revocation is enforced here** — the version in the token is compared
 * against the version on the record, so bumping `Admin.tokenVersion` ends every
 * session at the next request.
 */

/** bcrypt cost, per CLAUDE.md. */
export const BCRYPT_ROUNDS = 12;

export interface AdminSession {
  id: string;
  email: string;
  name: string;
}

/**
 * The signed-in admin, or `null`.
 *
 * Wrapped in React's `cache()` so a page that checks the session in its body,
 * its metadata and a layout does one database read rather than three. The cache
 * is per-request, so it cannot leak a session between visitors.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  await connectDB();

  const admin = await Admin.findById(claims.sub)
    .select('email name tokenVersion')
    .lean<Pick<IAdmin, '_id' | 'email' | 'name' | 'tokenVersion'>>()
    .exec();

  // Deleted account: the token is authentic but there is nobody behind it.
  if (!admin) return null;

  /*
   * Revocation. The token was signed with the version current at login; if the
   * record has moved on — a password change, a forced sign-out — every token
   * issued before it is now worthless without anything having to be stored or
   * purged.
   */
  if (admin.tokenVersion !== claims.tv) return null;

  return {
    id: String(admin._id),
    email: admin.email,
    name: admin.name,
  };
});

export async function hasAdminSession(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

/**
 * Throws unless the caller is an authenticated admin.
 *
 * For route handlers, which have no rendering path to fall back to. Pages
 * should call `getAdminSession()` and redirect instead, so an admin whose
 * session expired mid-session lands on the login form rather than an error.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) throw new Error('Admin authentication required.');

  return session;
}

/**
 * Hashes a password at the configured cost.
 *
 * Cost 12 is roughly a quarter-second of CPU per hash with `bcryptjs`, which is
 * a pure-JS implementation and slower than the native one. That is a feature at
 * login and a nuisance in a seed script; it is not worth swapping for a native
 * binding on a site with one admin account.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Checks a password against a stored hash.
 *
 * `bcrypt.compare` is constant-time with respect to the hash, so it does not
 * leak how much of a wrong password was right. The login handler still has to
 * deal with the *other* timing channel — an unknown email returning instantly
 * while a known one takes 250ms — and does; see the route.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
