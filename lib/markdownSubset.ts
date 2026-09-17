/**
 * The Markdown subset, as a document model.
 *
 * ## Why this module exists
 *
 * `components/content/PostBody.tsx` renders admin-authored bodies by parsing a
 * small Markdown subset into React elements — never through
 * `dangerouslySetInnerHTML`, which makes stored XSS structurally impossible
 * rather than filtered. That decision means a rich-text editor for the admin
 * **must emit this subset**, because an editor producing HTML would have its
 * output thrown away by the renderer.
 *
 * So the editor needs two things the renderer never did: a way to turn stored
 * Markdown into a structure it can edit, and a way to turn that structure back
 * into byte-identical Markdown. Both live here, with no DOM and no React, which
 * is what lets the round-trip guarantee be a plain unit test.
 *
 * **`PostBody` renders from `parseBlocks` too.** That is the point of putting
 * it here rather than beside the editor: if the renderer and the editor
 * disagreed about what a block is, the editor would silently drop formatting
 * the site displays — the exact failure this is built to prevent. One parser,
 * two consumers.
 *
 * ## The subset
 *
 *     ## Heading             h2
 *     ### Heading            h3
 *     - item                 ul / li
 *     > quote                blockquote
 *     blank-line separated   p
 *     **bold**               strong
 *     *italic*               em
 *     ***both***             strong + em
 *     [text](url)            link, scheme-checked at render time
 *
 * Anything else is literal text, by design. A stray `<script>` in a body shows
 * up on the page as the characters `<script>`, which is both safe and obvious
 * enough to get fixed.
 *
 * ## Round-tripping is the contract
 *
 * `serialise(parseBlocks(md))` must equal `md` for every body already in the
 * database. `lib/markdownSubset.test.ts` asserts exactly that against committed
 * copies of the real content. The failure it guards against is quiet: open an
 * old post in the editor, save it without touching anything, and lose a
 * heading.
 *
 * That holds because the serialiser is **canonical** — one spelling per
 * construct — and the stored content already uses those spellings. Where an
 * input is not canonical (`>text` without a space, `*  item`), the output is
 * the canonical form and therefore differs. The test reports that as a failure
 * rather than hiding it, because a silent rewrite is the thing being prevented.
 */

/** A run of text, with the marks that apply to it. */
export interface InlineText {
  type: 'text';
  value: string;
  bold?: boolean;
  italic?: boolean;
}

/**
 * A link. Its text carries no marks.
 *
 * Not a limitation invented here: `PostBody`'s link pattern captures
 * `[^\]]+` and renders it as a raw string, so `[**bold**](url)` would display
 * the asterisks. The model refuses to represent what the renderer cannot show.
 */
export interface InlineLink {
  type: 'link';
  text: string;
  href: string;
}

/** A soft line break inside a paragraph. Rendered as a space, stored as `\n`. */
export interface InlineBreak {
  type: 'break';
}

export type InlineNode = InlineText | InlineLink | InlineBreak;

export type Block =
  | { type: 'heading'; level: 2 | 3; content: InlineNode[] }
  | { type: 'paragraph'; content: InlineNode[] }
  | { type: 'list'; items: InlineNode[][] }
  | { type: 'blockquote'; lines: InlineNode[][] };

/**
 * The inline grammar.
 *
 * **Order matters and is the whole correctness of this regex.** Alternation is
 * ordered, so the three-asterisk form has to be tried before the two-asterisk
 * form, which has to be tried before the one. Without that, `***both***` is
 * matched by the `**` branch as bold-containing-an-asterisk and the trailing
 * `*` is orphaned — which is what the original two-branch pattern did.
 */
const INLINE_PATTERN =
  /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Splits one line of text into marked runs. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // A fresh lastIndex per call — the regex is module-scope and `g` is stateful.
  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushText(nodes, text.slice(lastIndex, match.index));
    }

    const [full, both, bold, italic, linkText, href] = match;

    if (both !== undefined) {
      nodes.push({ type: 'text', value: both, bold: true, italic: true });
    } else if (bold !== undefined) {
      nodes.push({ type: 'text', value: bold, bold: true });
    } else if (italic !== undefined) {
      nodes.push({ type: 'text', value: italic, italic: true });
    } else if (linkText !== undefined && href !== undefined) {
      nodes.push({ type: 'link', text: linkText, href });
    } else {
      pushText(nodes, full);
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) pushText(nodes, text.slice(lastIndex));

  return nodes;
}

/**
 * Appends plain text, splitting on newlines into break nodes.
 *
 * A paragraph in the source can wrap across lines. `PostBody` renders those as
 * a space, but the *stored* form keeps the newline — so the model has to carry
 * it or a save would reflow every wrapped paragraph in the database.
 */
function pushText(nodes: InlineNode[], value: string): void {
  const parts = value.split('\n');

  parts.forEach((part, index) => {
    if (index > 0) nodes.push({ type: 'break' });
    if (part !== '') nodes.push({ type: 'text', value: part });
  });
}

/**
 * Splits a document into blocks.
 *
 * The rules are `PostBody`'s, because they were `PostBody`'s first: blocks are
 * separated by one or more blank lines, each is trimmed, and empty ones are
 * dropped. A list is a block whose **every** line begins with `- `; a
 * blockquote is a block whose first line begins with `> `.
 */
export function parseBlocks(markdown: string): Block[] {
  const blocks = markdown
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block): Block => {
    if (block.startsWith('## ')) {
      return { type: 'heading', level: 2, content: parseInline(block.slice(3)) };
    }

    if (block.startsWith('### ')) {
      return { type: 'heading', level: 3, content: parseInline(block.slice(4)) };
    }

    const lines = block.split('\n');

    if (lines.every((line) => line.startsWith('- '))) {
      return {
        type: 'list',
        items: lines.map((line) => parseInline(line.slice(2))),
      };
    }

    if (block.startsWith('> ')) {
      return {
        type: 'blockquote',
        // `^> ?` per line, matching the renderer: a quote can wrap, and the
        // marker is repeated on each line.
        lines: lines.map((line) => parseInline(line.replace(/^>\s?/, ''))),
      };
    }

    return { type: 'paragraph', content: parseInline(block) };
  });
}

/** One inline node back to its Markdown spelling. */
export function serialiseInline(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'break') return '\n';

      if (node.type === 'link') return `[${node.text}](${node.href})`;

      /*
       * Marks are emitted outermost-first and the three-asterisk form is a
       * single token, never `**` wrapped around `*`. `***x***` is what the
       * parser reads back; `***x***` written as `** *x* **` is not the same
       * string and would not round-trip.
       */
      if (node.bold && node.italic) return `***${node.value}***`;
      if (node.bold) return `**${node.value}**`;
      if (node.italic) return `*${node.value}*`;

      return node.value;
    })
    .join('');
}

/**
 * Blocks back to Markdown.
 *
 * Canonical: `## ` for h2, `- ` for a list item, `> ` for a quote line, and
 * exactly one blank line between blocks. Content already in the database uses
 * these spellings, which is why the round trip is byte-exact rather than merely
 * equivalent.
 */
export function serialiseBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `${'#'.repeat(block.level)} ${serialiseInline(block.content)}`;

        case 'list':
          return block.items
            .map((item) => `- ${serialiseInline(item)}`)
            .join('\n');

        case 'blockquote':
          return block.lines
            .map((line) => `> ${serialiseInline(line)}`)
            .join('\n');

        case 'paragraph':
          return serialiseInline(block.content);
      }
    })
    .join('\n\n');
}

/** The whole round trip, for tests and for the editor's save path. */
export function roundTrip(markdown: string): string {
  return serialiseBlocks(parseBlocks(markdown));
}
