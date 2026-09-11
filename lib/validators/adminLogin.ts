import { z } from 'zod';

/**
 * The admin login schema, shared by the form and the route handler.
 *
 * Deliberately loose on the password: **no minimum length, no complexity
 * rules.** Those belong on a password *change* form, where they stop someone
 * choosing a bad secret. Applying them at login only tells an attacker which
 * guesses are not worth making, and rejects a legitimate admin whose password
 * predates the rule.
 *
 * The cap exists for one reason: bcrypt hashing cost scales with input, so an
 * unbounded password field is a cheap way to make the server do expensive work.
 */
export const adminLoginSchema = z.object({
  email: z.email('Enter the email address for your admin account').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
});

export type AdminLoginValues = z.input<typeof adminLoginSchema>;
