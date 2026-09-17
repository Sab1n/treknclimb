import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import BulletList from '@tiptap/extension-bullet-list';
import ListItem from '@tiptap/extension-list-item';
import Blockquote from '@tiptap/extension-blockquote';
import HardBreak from '@tiptap/extension-hard-break';
import { UndoRedo } from '@tiptap/extensions';
import Link from '@tiptap/extension-link';
import type { Extensions } from '@tiptap/core';

import {
  parseBlocks,
  serialiseBlocks,
  type Block,
  type InlineNode,
} from './markdownSubset';

/**
 * The editor's schema and its Markdown conversion, with no React in it.
 *
 * Split out of `components/admin/RichTextEditor.tsx` so the round trip can be
 * tested. The component is a Client Component that imports `@tiptap/react`;
 * importing it from a Node test would drag in the rendering layer and a DOM
 * that does not exist there. Everything below is framework-agnostic —
 * `getSchema` and `Schema.nodeFromJSON` are pure `prosemirror-model` — which is
 * what lets `lib/richText.test.ts` exercise the **real** schema rather than a
 * stand-in.
 *
 * That distinction matters. Converting Markdown to a plain object and back
 * proves the conversion functions agree with each other. Running that object
 * through ProseMirror's own schema proves the editor will not normalise it into
 * something different the moment it loads — which is where a silent formatting
 * loss would actually come from.
 */

/**
 * Every extension the editor registers, and nothing else.
 *
 * **The schema is the constraint, not the toolbar.** `StarterKit` would bring
 * code blocks, horizontal rules, strikethrough, ordered lists and headings one
 * through six — all of which `PostBody` renders as literal characters or not at
 * all. Leaving a button off the toolbar does not stop a paste or a keyboard
 * shortcut producing the node; leaving the extension out does, because
 * ProseMirror coerces anything it cannot represent into the nearest thing it
 * can.
 *
 * `UndoRedo` is here despite producing no markup: undo is not a formatting
 * feature, and an editor without it loses work.
 */
export const richTextExtensions: Extensions = [
  Document,
  Paragraph,
  Text,
  // `PostBody` renders ## and ### only — a body sits under the page's own h1.
  Heading.configure({ levels: [2, 3] }),
  Bold,
  Italic,
  BulletList,
  ListItem,
  Blockquote,
  HardBreak,
  // TipTap 3 renamed the History extension to UndoRedo and moved it into
  // @tiptap/extensions. It produces no markup; undo is not a formatting
  // feature, and an editor without it loses work.
  UndoRedo,
  Link.configure({
    openOnClick: false,
    // A bare URL should not silently become a link: the subset has one link
    // spelling and it is explicit.
    autolink: false,
    // The same closed scheme list the renderer enforces, one layer earlier so
    // the bad value never reaches the database.
    protocols: ['http', 'https', 'mailto'],
  }),
];

/**
 * ProseMirror JSON, loosely typed.
 *
 * Every node is built by the functions below from a shape this file controls,
 * so a looser type costs nothing and keeps the conversion readable.
 */
export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

/** Inline nodes from the subset into ProseMirror text nodes with marks. */
function inlineToPm(nodes: InlineNode[]): PmNode[] {
  return nodes.map((node): PmNode => {
    if (node.type === 'break') return { type: 'hardBreak' };

    if (node.type === 'link') {
      return {
        type: 'text',
        text: node.text,
        marks: [{ type: 'link', attrs: { href: node.href } }],
      };
    }

    const marks: PmNode['marks'] = [];

    if (node.bold) marks.push({ type: 'bold' });
    if (node.italic) marks.push({ type: 'italic' });

    return marks.length
      ? { type: 'text', text: node.value, marks }
      : { type: 'text', text: node.value };
  });
}

/** Markdown in the subset to a ProseMirror document. */
export function markdownToDoc(markdown: string): PmNode {
  const content = parseBlocks(markdown).map((block): PmNode => {
    switch (block.type) {
      case 'heading':
        return {
          type: 'heading',
          attrs: { level: block.level },
          content: inlineToPm(block.content),
        };

      case 'list':
        return {
          type: 'bulletList',
          content: block.items.map((item) => ({
            type: 'listItem',
            // A list item wraps a paragraph in ProseMirror; a subset item is a
            // single line, so one paragraph each.
            content: [{ type: 'paragraph', content: inlineToPm(item) }],
          })),
        };

      case 'blockquote':
        return {
          type: 'blockquote',
          /*
           * Each source line becomes its own paragraph, so the serialiser can
           * put the `> ` marker back on all of them. Joining them into one
           * paragraph would collapse a two-line quote and change the bytes.
           */
          content: block.lines.map((line) => ({
            type: 'paragraph',
            content: inlineToPm(line),
          })),
        };

      case 'paragraph':
        return { type: 'paragraph', content: inlineToPm(block.content) };
    }
  });

  // An empty document still needs one paragraph, or ProseMirror rejects it.
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  };
}

/** ProseMirror text nodes back into the subset's inline model. */
function pmToInline(nodes: PmNode[] | undefined): InlineNode[] {
  if (!nodes) return [];

  return nodes.flatMap((node): InlineNode[] => {
    if (node.type === 'hardBreak') return [{ type: 'break' }];

    if (node.type !== 'text' || node.text === undefined) return [];

    const link = node.marks?.find((mark) => mark.type === 'link');

    if (link) {
      return [{ type: 'link', text: node.text, href: String(link.attrs?.href ?? '') }];
    }

    const bold = node.marks?.some((mark) => mark.type === 'bold');
    const italic = node.marks?.some((mark) => mark.type === 'italic');

    return [
      {
        type: 'text',
        value: node.text,
        ...(bold ? { bold: true } : {}),
        ...(italic ? { italic: true } : {}),
      },
    ];
  });
}

/** A ProseMirror document back to Markdown. */
export function docToMarkdown(doc: PmNode): string {
  const blocks: Block[] = [];

  for (const node of doc.content ?? []) {
    switch (node.type) {
      case 'heading': {
        const level = Number(node.attrs?.level) === 3 ? 3 : 2;
        blocks.push({ type: 'heading', level, content: pmToInline(node.content) });
        break;
      }

      case 'bulletList':
        blocks.push({
          type: 'list',
          items: (node.content ?? []).map((item) =>
            pmToInline(item.content?.[0]?.content)
          ),
        });
        break;

      case 'blockquote':
        blocks.push({
          type: 'blockquote',
          lines: (node.content ?? []).map((line) => pmToInline(line.content)),
        });
        break;

      case 'paragraph': {
        const content = pmToInline(node.content);

        /*
         * An empty paragraph is dropped. ProseMirror keeps one at the end of
         * most documents as somewhere to put the cursor, and serialising it
         * would append a blank line to every body on every save — a diff on a
         * document nobody edited.
         */
        if (content.length > 0) blocks.push({ type: 'paragraph', content });
        break;
      }

      default:
        /*
         * Unreachable with the extension list above, and deliberately silent
         * rather than throwing: an unknown node must not make a save fail on
         * content the admin cannot see or fix.
         */
        break;
    }
  }

  return serialiseBlocks(blocks);
}
