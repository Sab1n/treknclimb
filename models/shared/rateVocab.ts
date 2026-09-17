/**
 * The exchange-rate vocabularies, on the client side of the boundary.
 *
 * Extracted from `models/ExchangeRate.ts` for the reason CLAUDE.md records:
 * importing the model into a Client Component drags Mongoose in behind it,
 * which `require`s `net` and `tls`, and the build fails naming `tls` rather
 * than anything you wrote. Constants have no runtime dependencies, so they can
 * sit on both sides; the model re-exports these so there is still one
 * definition.
 */

export const RATE_SOURCES = ['api', 'manual'] as const;
export type RateSource = (typeof RATE_SOURCES)[number];

export const ROUNDING_RULES = [
  'none',
  'nearest-1',
  'nearest-5',
  'nearest-10',
  'nearest-100',
] as const;
export type RoundingRule = (typeof ROUNDING_RULES)[number];

/** What each rule does, for the admin select. */
export const ROUNDING_RULE_LABELS: Record<RoundingRule, string> = {
  none: 'No rounding — 1,732.41',
  'nearest-1': 'Nearest whole unit — 1,732',
  'nearest-5': 'Nearest 5 — 1,730',
  'nearest-10': 'Nearest 10 — 1,730',
  'nearest-100': 'Nearest 100 — 1,700',
};

/**
 * A sanity band for a rate, in units per 1 USD.
 *
 * **The direction is the whole point.** `rate` is units of the currency per one
 * US dollar, so NPR is about 133 and not 0.0075. Inverting it produces a number
 * that looks perfectly plausible — a price of "NPR 9.74" for a $1,300 trek
 * reads as a formatting bug rather than an inverted rate — and nothing else in
 * the system would catch it.
 *
 * So the editor warns outside this band rather than silently accepting. A
 * warning, not a validator: an unfamiliar currency can legitimately sit
 * outside it, and refusing the save would be wrong.
 */
export const RATE_SANITY = { min: 0.01, max: 100_000 };

/** Roughly where each seeded currency should land. Used only for the warning. */
export const RATE_HINTS: Record<string, { low: number; high: number }> = {
  USD: { low: 1, high: 1 },
  EUR: { low: 0.7, high: 1.5 },
  GBP: { low: 0.6, high: 1.3 },
  AUD: { low: 1.0, high: 2.5 },
  NPR: { low: 90, high: 200 },
  INR: { low: 60, high: 130 },
};
