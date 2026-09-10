import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Renders `BlogPost.body`.
 *
 * ## Why this is not `dangerouslySetInnerHTML`
 *
 * The obvious implementation is one line, and it is the stored-XSS hole
 * CLAUDE.md names under Security. `body` is admin-authored rich text,
 * sanitisation on save is listed as still-to-build, and this page is public
 * and statically generated — so injected markup would be baked into the HTML
 * and served to every visitor. "Only staff can edit it" is not a defence:
 * that is precisely the account worth stealing, and the admin login is not
 * built yet either.
 *
 * So this parses a **small Markdown subset into React elements**. Nothing is
 * ever handed to the browser as raw HTML, which makes the whole class of
 * injection structurally impossible rather than filtered. There is no
 * sanitiser to keep up to date and no dependency to audit.
 *
 * ## The subset
 *
 *   ## Heading            → h2
 *   ### Heading           → h3
 *   - item                → ul / li
 *   > quote               → blockquote
 *   blank-line separated  → p
 *   **bold**              → strong
 *   [text](url)           → a link, scheme-checked
 *
 * That is what the v1 prototype's post body actually uses. When a rich-text
 * editor lands in the admin, the choice is to have it emit this subset, or to
 * add a real sanitiser and swap this out — either is fine, and neither is a
 * decision this file should make on its own.
 *
 * Anything unrecognised renders as literal text. Failing visible beats failing
 * silent: a stray `<script>` in the body shows up on the page as the characters
 * `<script>`, which is both safe and obvious enough to get fixed.
 */

/**
 * Only these schemes become links. A `javascript:` or `data:` URL in an href
 * is script execution by another name, and it is the one part of Markdown that
 * is dangerous even when the markup itself is never parsed as HTML.
 */
function isSafeHref(href: string): boolean {
  const value = href.trim().toLowerCase();

  return (
    value.startsWith('/') ||
    value.startsWith('#') ||
    value.startsWith('https://') ||
    value.startsWith('http://') ||
    value.startsWith('mailto:')
  );
}

/** `**bold**` and `[text](url)`. Everything else is literal text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const [full, bold, linkText, href] = match;

    if (bold !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${index}`}>{bold}</strong>);
    } else if (linkText !== undefined && href !== undefined) {
      if (isSafeHref(href)) {
        // Internal links go through next/link for client-side navigation;
        // external ones get the usual rel guard on a new tab.
        nodes.push(
          href.startsWith('/') || href.startsWith('#') ? (
            <Link
              key={`${keyPrefix}-l${index}`}
              href={href}
              className="font-semibold underline underline-offset-4"
            >
              {linkText}
            </Link>
          ) : (
            <a
              key={`${keyPrefix}-l${index}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-4"
            >
              {linkText}
            </a>
          )
        );
      } else {
        // Rejected scheme: keep the words, drop the link. The reader still
        // gets the sentence and nothing executes.
        nodes.push(linkText);
      }
    } else {
      nodes.push(full);
    }

    lastIndex = match.index + full.length;
    index += 1;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return nodes;
}

export default function PostBody({ body }: { body: string }) {
  // Blocks are separated by a blank line. Normalise Windows line endings first
  // so a body pasted from Word does not come through as one giant paragraph.
  const blocks = body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-5 text-base leading-relaxed">
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`;

        if (block.startsWith('## ')) {
          return (
            <h2
              key={key}
              className="mt-4 font-display text-2xl font-extrabold tracking-display"
            >
              {renderInline(block.slice(3), key)}
            </h2>
          );
        }

        if (block.startsWith('### ')) {
          return (
            <h3
              key={key}
              className="mt-2 font-display text-lg font-extrabold tracking-display"
            >
              {renderInline(block.slice(4), key)}
            </h3>
          );
        }

        // A list is a block whose every line starts with "- ".
        const lines = block.split('\n');

        if (lines.every((line) => line.startsWith('- '))) {
          return (
            <ul key={key} className="flex list-disc flex-col gap-2 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={`${key}-${lineIndex}`}>
                  {renderInline(line.slice(2), `${key}-${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.startsWith('> ')) {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-marigold pl-4 italic text-muted"
            >
              {renderInline(block.replace(/^> ?/gm, ''), key)}
            </blockquote>
          );
        }

        // A soft line break inside a paragraph is a space, as in Markdown.
        return <p key={key}>{renderInline(block.replace(/\n/g, ' '), key)}</p>;
      })}
    </div>
  );
}
