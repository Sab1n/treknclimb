/**
 * Creates the first admin account from environment variables.
 *
 *   npx tsx --env-file=.env.local scripts/seed-admin.ts
 *   npx tsx --env-file=.env.local scripts/seed-admin.ts --reset-password
 *
 * Reads:
 *
 *   ADMIN_EMAIL     the sign-in address
 *   ADMIN_PASSWORD  the initial password
 *   ADMIN_NAME      shown in the admin header
 *
 * **There is no public registration route and there will not be one.** A site
 * with exactly one operator does not need self-service signup, and a signup
 * endpoint on an admin surface is a way in that has to be defended forever. The
 * account is created here, once, by someone with shell access and the database
 * connection string.
 *
 * ## The password is never stored, logged or echoed
 *
 * It is read from the environment, hashed at bcrypt cost 12, and the hash is
 * what goes to MongoDB. Nothing prints it back. **Remove `ADMIN_PASSWORD` from
 * `.env.local` once this has run** — leaving a working admin password in a file
 * next to the database URI is the one step people skip.
 *
 * ## Re-running
 *
 * Refuses to overwrite an existing account by default, because a script that
 * silently resets the admin password every time it runs is a foot-gun in a
 * deploy pipeline. `--reset-password` is the explicit opt-in, and it bumps
 * `tokenVersion` so every existing session dies with the old password — which
 * is the whole reason that field exists.
 */

import mongoose from 'mongoose';
import { connectDB } from '../lib/db';
import Admin from '../models/Admin';
import { hashPassword } from '../lib/adminAuth';

/**
 * Minimum length for the seeded password.
 *
 * Enforced here rather than at login: this is where a password is *chosen*,
 * which is the only place a length rule protects anything. Twelve characters
 * with no composition rules — a longer passphrase beats a short one with a
 * symbol in it, and complexity rules mostly produce `Password1!`.
 */
const MIN_PASSWORD_LENGTH = 12;

async function seedAdmin() {
  const reset = process.argv.includes('--reset-password');

  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim();

  const missing = [
    !email && 'ADMIN_EMAIL',
    !password && 'ADMIN_PASSWORD',
    !name && 'ADMIN_NAME',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    // Not needed by this script, but an account that cannot be signed in to is
    // worth catching now rather than at the login screen.
    throw new Error(
      'JWT_SECRET is missing or shorter than 32 characters. Set it before creating an admin, or sign-in will fail.'
    );
  }

  if (password!.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }

  await connectDB();

  const existing = await Admin.findOne({ email: email! });

  if (existing && !reset) {
    console.log(`An admin already exists for ${email}. Nothing changed.`);
    console.log(
      'Re-run with --reset-password to set a new password and sign out every existing session.'
    );
    await mongoose.disconnect();
    return;
  }

  // Hashing is deliberately slow at cost 12 — about a quarter of a second.
  const passwordHash = await hashPassword(password!);

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.name = name!;
    /*
     * Every token carries the version it was signed under, so incrementing this
     * invalidates all of them at once — no session store to purge. A password
     * change that left old sessions alive would be a password change that does
     * not actually lock anyone out.
     */
    existing.tokenVersion += 1;
    existing.resetTokenHash = null;
    existing.resetTokenExpiresAt = null;

    await existing.save();

    console.log(`Reset the password for ${email}.`);
    console.log(
      `tokenVersion is now ${existing.tokenVersion} — every existing session has been signed out.`
    );
  } else {
    await Admin.create({
      email: email!,
      passwordHash,
      name: name!,
      tokenVersion: 0,
    });

    console.log(`Created the admin account for ${email}.`);
  }

  const total = await Admin.countDocuments();

  if (total > 1) {
    console.warn(
      `\nThere are now ${total} admin accounts. CLAUDE.md specifies a single admin role — if that is not deliberate, remove the extras.`
    );
  }

  await mongoose.disconnect();

  console.log('\nSign in at /admin/login.');
  console.log(
    'Now remove ADMIN_PASSWORD from .env.local — it is no longer needed and it is a working credential sitting in a file.'
  );
}

seedAdmin().catch(async (error) => {
  // The message only, never the stack: a thrown Mongoose error can carry the
  // document it failed on, and this script handles a password.
  console.error(
    'Admin seed failed:',
    error instanceof Error ? error.message : error
  );
  await mongoose.disconnect();
  process.exit(1);
});
