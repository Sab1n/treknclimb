import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  parseBlocks,
  type InlineNode,
} from '../../lib/markdownSubset';

/**
 * Renders `BlogPost.body`, `Destination.activitiesIntro` and the company story.
 *
 * ## Why this is not `dangerouslySetInnerHTML`
 *
 * The obvious implementation is one line, and it is the stored-XSS hole
 * CLAUDE.md names under Security. These bodies are admin-authored rich text on
 * public, statically generated pages, so injected markup would be baked into
 * the HTML and served to every visitor. "Only staff can edit it" is not a
 * defence: that is precisely the account worth stealing.
 *
 * So this renders a **small Markdown subset as React elements**. Nothing is
 * ever handed to the browser as raw HTML, which makes the whole class of
 * injection structurally impossible rather than filtered — no sanitiser to
 * keep current, no dependency to audit.
 *
 * ## The block parsing lives in `lib/markdownSubset.ts`, not here
 *
 * It used to live here, and it moved when the admin rich-text editor was built.
 * The editor has to load a stored body, let someone edit it, and write back the
 * same subset — so it needs the same notion of "what is a block" that this
 * component uses. Two implementations would drift, and the way they would drift
 * is the editor quietly dropping formatting the site still displays.
 *
 * One parser, two consumers. `lib/markdownSubset.test.ts` asserts that every
 * body in the database survives a round trip through it byte-for-byte.
 *
 * ## The subset
 *
 *     ## Heading            h2
 *     ### Heading           h3
 *     - item                ul / li
 *     > quote               blockquote
 *     blank-line separated  p
 *     **bold**              strong
 *     *italic*              em
 *     ***both***            strong + em
 *     [text](url)           a link, scheme-checked
 *
 * Anything unrecognised renders as literal text. Failing visible beats failing
 * silent: a stray `<script>` shows up on the page as the characters
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

/** Inline nodes to React. Marks are applied outermost-first. */
function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-i${index}`;

    if (node.type === 'break') {
      /*
       * A soft line break inside a paragraph is a space, as in Markdown. The
       * newline is kept in storage — the editor round-trips it — but it is not
       * a visual break.
       */
      return ' ';
    }

    if (node.type === 'link') {
      if (!isSafeHref(node.href)) {
        // Rejected scheme: keep the words, drop the link. The reader still gets
        // the sentence and nothing executes.
        return node.text;
      }

      // Internal links go through next/link for client-side navigation;
      // external ones get the usual rel guard on a new tab.
      return node.href.startsWith('/') || node.href.startsWith('#') ? (
        <Link
          key={key}
          href={node.href}
          className="font-semibold underline underline-offset-4"
        >
          {node.text}
        </Link>
      ) : (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-4"
        >
          {node.text}
        </a>
      );
    }

    if (node.bold && node.italic) {
      return (
        <strong key={key}>
          <em>{node.value}</em>
        </strong>
      );
    }

    if (node.bold) return <strong key={key}>{node.value}</strong>;
    if (node.italic) return <em key={key}>{node.value}</em>;

    return node.value;
  });
}

export default function PostBody({ body }: { body: string }) {
  const blocks = parseBlocks(body);

  return (
    <div className="flex flex-col gap-5 text-base leading-relaxed">
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`;

        switch (block.type) {
          case 'heading':
            return block.level === 2 ? (
              <h2
                key={key}
                className="mt-4 font-display text-2xl font-extrabold tracking-display"
              >
                {renderInline(block.content, key)}
              </h2>
            ) : (
              <h3
                key={key}
                className="mt-2 font-display text-lg font-extrabold tracking-display"
              >
                {renderInline(block.content, key)}
              </h3>
            );

          case 'list':
            return (
              <ul key={key} className="flex list-disc flex-col gap-2 pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>
                    {renderInline(item, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </ul>
            );

          case 'blockquote':
            return (
              <blockquote
                key={key}
                className="border-l-2 border-marigold pl-4 italic text-muted"
              >
                {block.lines.map((line, lineIndex) => (
                  <span key={`${key}-${lineIndex}`}>
                    {lineIndex > 0 && ' '}
                    {renderInline(line, `${key}-${lineIndex}`)}
                  </span>
                ))}
              </blockquote>
            );

          case 'paragraph':
            return <p key={key}>{renderInline(block.content, key)}</p>;
        }
      })}
    </div>
  );
}
