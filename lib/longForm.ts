/**
 * Splits an `activitiesIntro` body into sections for the composed long-form
 * layout.
 *
 * The Markdown subset already supports `##` headings and `>` blockquotes;
 * this reads structure out of them rather than asking for a second field.
 *
 * ## Pull quotes are marked, never chosen
 *
 * A section's pull quote is the **first `>` blockquote in it**, lifted out of
 * the body so it does not render twice. That is an authoring decision, not a
 * heuristic: picking "one striking line per section" automatically means
 * guessing which sentence matters, and the guess is wrong often enough to be
 * embarrassing — a pull quote is the largest text on the page and lands on
 * whatever it lands on.
 *
 * A section with no `>` line simply gets no pull quote. That is a fine state,
 * and better than a mediocre sentence set at 24px.
 *
 * Anything before the first `##` is the lede and comes back separately, so the
 * layout can run it full width above the two-column grid.
 */

export interface LongFormSection {
  /** Anchor id, from the heading. Also the table-of-contents target. */
  id: string;
  heading: string;
  /** The section body with the pull quote removed. */
  body: string;
  /** The `>` line, if the author marked one. */
  pullQuote: string | null;
}

export interface LongFormDocument {
  /** Everything above the first `##` heading. */
  lede: string;
  sections: LongFormSection[];
}

/**
 * Heading text to an anchor id.
 *
 * Deliberately not just `toLowerCase().replace(/\s/g, '-')`: headings contain
 * apostrophes, em dashes and commas, and a raw `#What's here` fragment breaks
 * on some browsers. `slugify` is also why the collision guard below exists —
 * two sections called "Permits" would otherwise share an id and the table of
 * contents would send both links to the first.
 */
function slugify(heading: string): string {
  return (
    heading
      .toLowerCase()
      .normalize('NFKD')
      // Strip combining marks left by the decomposition.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

export function parseLongForm(body: string): LongFormDocument {
  const normalised = body.replace(/\r\n/g, '\n');

  // Split on level-two headings, keeping the heading text.
  const parts = normalised.split(/\n(?=## )/);

  const lede = parts[0].startsWith('## ') ? '' : parts[0].trim();
  const rest = parts[0].startsWith('## ') ? parts : parts.slice(1);

  const usedIds = new Set<string>();

  const sections: LongFormSection[] = rest.map((part) => {
    const [headingLine, ...bodyLines] = part.split('\n');
    const heading = headingLine.replace(/^##\s*/, '').trim();

    let id = slugify(heading);
    let suffix = 2;
    while (usedIds.has(id)) id = `${slugify(heading)}-${suffix++}`;
    usedIds.add(id);

    const sectionBody = bodyLines.join('\n');

    /*
     * The first blockquote block. `>` lines can wrap across several lines, so
     * this matches a run of them rather than a single line.
     */
    const quoteMatch = sectionBody.match(/(^|\n)((?:> ?.*(?:\n|$))+)/);

    const pullQuote = quoteMatch
      ? quoteMatch[2]
          .split('\n')
          .map((line) => line.replace(/^>\s?/, '').trim())
          .filter(Boolean)
          .join(' ')
      : null;

    const withoutQuote = quoteMatch
      ? sectionBody.replace(quoteMatch[2], '')
      : sectionBody;

    return {
      id,
      heading,
      body: withoutQuote.trim(),
      pullQuote,
    };
  });

  return { lede, sections };
}
