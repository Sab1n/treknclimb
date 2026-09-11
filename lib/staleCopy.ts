/**
 * Finds a superseded price still sitting in authored prose.
 *
 * ## Why this exists
 *
 * `answerBlock` and `metaDescription` are written by hand and routinely repeat
 * the price — "costs from USD 1,295 per person". Changing the price field does
 * not touch them, so the two most consequential sentences on the page keep
 * quoting a figure the company no longer charges: the answer block is the
 * AI-extraction target, and the meta description is the search snippet. Both
 * are read by people deciding whether to click, and neither is anywhere near
 * the price field an editor just changed.
 *
 * ## A warning, never a save blocker
 *
 * Same treatment as the flat-price reconciliation. The copy might legitimately
 * mention another number, the editor might be mid-way through a rewrite, and a
 * validator that refuses the save would make the intermediate state
 * unreachable. This reports; the admin decides.
 */

export interface StaleCopyWarning {
  /** The field name, as the editor knows it. */
  field: 'answerBlock' | 'metaDescription';
  /** Human label for the message. */
  label: string;
  /** The stale figure exactly as it appears in the copy. */
  found: string;
  message: string;
}

const FIELD_LABELS: Record<StaleCopyWarning['field'], string> = {
  answerBlock: 'answer block',
  metaDescription: 'meta description',
};

/**
 * Every way a price is plausibly written in a sentence.
 *
 * 1295 appears as `1295`, `1,295`, and — because prices are stored as numbers
 * but written as money — occasionally `1295.00`. Matching only the raw digits
 * would miss the comma-grouped form, which is the one a human actually types.
 *
 * The result is a regex alternation rather than a set of `includes()` calls, so
 * one pass over the text finds whichever spelling is present and reports it
 * verbatim — quoting back the form the editor wrote is what makes the warning
 * findable.
 */
function priceSpellings(price: number): string[] {
  const plain = String(price);
  const grouped = price.toLocaleString('en-US');

  // A Set: a price under 1000 has no comma, so both spellings are identical
  // and the alternation would otherwise carry a duplicate branch.
  return [...new Set([grouped, plain])];
}

/** Escapes a string for literal use inside a regex. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the matcher for one price.
 *
 * The digit boundaries are the whole difficulty, and there are two distinct
 * traps.
 *
 * **A shorter price must not match inside a longer number.** 295 appears in
 * both "1,295" and "2950", and is neither. `\b` is no help: it treats a comma
 * as a word boundary, so `\b295\b` matches happily inside "1,295". Hence the
 * lookbehind rejecting a preceding digit, comma or point, and the lookahead
 * rejecting a following digit or comma.
 *
 * **A full stop is not a decimal point.** The obvious lookahead
 * `(?![\d.,])` also rejects "from USD 1295." — a price at the end of a
 * sentence, which is where a price in prose most often sits. So the point is
 * only disqualifying when a digit follows it: `1295.50` is a different number,
 * `1295.` is the same number followed by punctuation.
 */
function priceMatcher(price: number): RegExp {
  const alternation = priceSpellings(price).map(escapeRegex).join('|');

  return new RegExp(`(?<![\\d.,])(?:${alternation})(?![\\d,])(?!\\.\\d)`);
}

/**
 * Checks the authored copy for a price that has just been superseded.
 *
 * Returns `[]` when the price did not change — there is nothing stale if
 * nothing moved — and when the old price still appears legitimately because it
 * equals the new one.
 */
export function findStalePriceCopy(options: {
  previousPrice: number;
  newPrice: number;
  answerBlock?: string;
  metaDescription?: string;
}): StaleCopyWarning[] {
  const { previousPrice, newPrice, answerBlock, metaDescription } = options;

  if (previousPrice === newPrice) return [];

  const matcher = priceMatcher(previousPrice);

  const fields: { field: StaleCopyWarning['field']; text?: string }[] = [
    { field: 'answerBlock', text: answerBlock },
    { field: 'metaDescription', text: metaDescription },
  ];

  const warnings: StaleCopyWarning[] = [];

  for (const { field, text } of fields) {
    if (!text) continue;

    const match = matcher.exec(text);

    if (!match) continue;

    const label = FIELD_LABELS[field];

    warnings.push({
      field,
      label,
      found: match[0],
      /*
       * Names the field and quotes the figure. "Some copy may be out of date"
       * would send the admin reading every field; this sends them to one.
       */
      message: `Your ${label} still says USD ${match[0]}.`,
    });
  }

  return warnings;
}
