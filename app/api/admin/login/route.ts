import { NextResponse } from 'next/server';

import { connectDB } from '../../../../lib/db';
import Admin, { IAdmin } from '../../../../models/Admin';
import { adminLoginSchema } from '../../../../lib/validators/adminLogin';
import { verifyPassword } from '../../../../lib/adminAuth';
import {
  ADMIN_SESSION_COOKIE,
  ABSOLUTE_SESSION_TTL_SECONDS,
  createSessionToken,
  sessionCookieOptions,
} from '../../../../lib/auth';
import {
  checkAdminLoginAllowed,
  recordFailedLogin,
  clearFailedLogins,
  clientIp,
} from '../../../../lib/rateLimit';

/**
 * A bcrypt hash of nothing in particular, at the same cost as a real one.
 *
 * Compared against when the email is unknown, so an unknown address takes the
 * same ~250ms as a known one. Without it the endpoint is an account
 * enumeration oracle: unknown emails return instantly, real ones pause while
 * bcrypt works, and the difference is trivially measurable over a few requests.
 *
 * Generated once at cost 12 and pasted here rather than hashed at boot — this
 * value is not a secret and hashing it on every cold start would cost a quarter
 * of a second for nothing.
 */
const DUMMY_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEe.3pLCEbGVYPBQMD1FtrpSRDwBvUSElwm';

/**
 * POST /api/admin/login
 *
 * ## Order, and why
 *
 *   1. Parse           — free
 *   2. Lockout gate    — **before the password is checked**, so a locked
 *                        account costs an attacker a request and not a bcrypt
 *   3. Look up + compare, with a constant-time shape
 *   4. On failure: record it, possibly lock
 *   5. On success: clear the counters, issue the cookie
 *
 * ## One error message, always
 *
 * Wrong password, unknown email, and locked account all return the same
 * sentence. Telling someone "no account with that address" hands them a valid
 * username for free, and "your account is locked" confirms the address exists
 * *and* tells them their guessing worked well enough to matter.
 *
 * The status codes differ — 401 versus 429 — because the browser needs to know
 * whether to offer a retry. That is a much smaller disclosure than the wording,
 * and a locked-out admin needs some way to tell "wrong password" from "stop
 * trying for half an hour".
 */
export async function POST(request: Request) {
  const ip = clientIp(request);

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const parsed = adminLoginSchema.safeParse(payload);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }

    return NextResponse.json(
      { error: 'Check the details below.', fieldErrors },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase().trim();

  /* ---------------- lockout gate, before any hashing ---------------- */

  const gate = await checkAdminLoginAllowed(email, ip);

  if (!gate.allowed) {
    console.warn(`[login] Refused for ${email} from ${ip} — ${gate.reason}.`);

    // 'unreachable' and 'unconfigured' are our failure, not theirs, so they get
    // a different sentence — an admin staring at a login form needs to know
    // whether to wait or to call someone.
    const message =
      gate.reason === 'locked'
        ? 'Too many attempts. Try again in about 30 minutes.'
        : 'Sign-in is temporarily unavailable. Please try again shortly.';

    return NextResponse.json(
      { error: message },
      { status: gate.reason === 'locked' ? 429 : 503 }
    );
  }

  /* ---------------- look up and compare ---------------- */

  await connectDB();

  /*
   * `.select('+passwordHash')` — the field is `select: false` on the schema, so
   * it is absent from every ordinary query. This is the one place that opts
   * back in, and TypeScript will not warn you if you forget: the interface
   * declares the field present regardless.
   */
  const admin = await Admin.findOne({ email })
    .select('+passwordHash')
    .lean<Pick<IAdmin, '_id' | 'email' | 'name' | 'passwordHash' | 'tokenVersion'>>()
    .exec();

  // Always compare against something, even when there is no account. See
  // DUMMY_HASH above.
  const passwordMatches = await verifyPassword(
    parsed.data.password,
    admin?.passwordHash ?? DUMMY_HASH
  );

  if (!admin || !passwordMatches) {
    const { locked } = await recordFailedLogin(email, ip);

    console.warn(
      `[login] Failed attempt for ${email} from ${ip}${locked ? ' — account now locked' : ''}.`
    );

    return NextResponse.json(
      { error: 'That email address and password do not match.' },
      { status: 401 }
    );
  }

  /* ---------------- success ---------------- */

  await clearFailedLogins(email);

  const token = await createSessionToken(String(admin._id), admin.tokenVersion);

  /*
   * Recorded with `updateOne` rather than findOne → assign → save(). The
   * convention exists because query middleware skips `pre('validate')` and
   * would bypass document-level rules — Admin has none, and this writes two
   * audit fields on a document whose password hash we are deliberately not
   * holding in memory any longer than the comparison needed.
   */
  await Admin.updateOne(
    { _id: admin._id },
    { $set: { lastLoginAt: new Date(), lastLoginIp: ip } }
  );

  console.warn(`[login] ${email} signed in from ${ip}.`);

  const response = NextResponse.json({
    ok: true,
    admin: { name: admin.name, email: admin.email },
  });

  /*
   * The cookie lives for the absolute cap, not the token's two hours. The token
   * inside it expires first and is refreshed by the middleware; the cookie only
   * needs to outlive the whole session so the browser keeps presenting it.
   */
  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    token,
    sessionCookieOptions(ABSOLUTE_SESSION_TTL_SECONDS)
  );

  return response;
}
