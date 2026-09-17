'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import {
  richTextExtensions,
  markdownToDoc,
  docToMarkdown,
  type PmNode,
} from '../../lib/richText';

/**
 * The shared rich-text editor. Emits the Markdown subset, never HTML.
 *
 * ## Why not StarterKit
 *
 * TipTap's `StarterKit` bundles code blocks, horizontal rules, strikethrough,
 * ordered lists and headings one through six. Every one of those produces
 * something `PostBody` does not render — `~~struck~~` would come out as literal
 * tildes, a code block as a mangled paragraph — so the extensions are listed
 * individually instead. **The schema is the constraint, not the toolbar.** A
 * button can be left off and the user can still paste a heading in or hit
 * Ctrl-Shift-X; if the schema allows the node, it exists in the document and
 * the serialiser has to decide what to do with something it cannot express.
 *
 * With only these extensions registered, ProseMirror refuses the node at the
 * source: pasted HTML is coerced into the nearest thing the schema allows, and
 * there is no code-block node for a code block to become.
 *
 * ## Headings are restricted to 2 and 3
 *
 * `PostBody` renders `##` and `###` and nothing else, because a body sits under
 * the page's own `h1` and a second one would be a document-outline error rather
 * than a style choice.
 *
 * ## The round trip is the contract
 *
 * `lib/markdownSubset.ts` owns the conversion both ways, has no DOM in it, and
 * is asserted against every stored body in `lib/markdownSubset.test.ts`. This
 * component is the editing surface on top; it holds no parsing rules of its
 * own, so the guarantee cannot be true in the test and false here.
 */

export default function RichTextEditor({
  value,
  onChange,
  id,
  label,
  hint,
  error,
  required,
  minHeight = '18rem',
}: {
  /** Markdown, in the subset. */
  value: string;
  onChange: (markdown: string) => void;
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  minHeight?: string;
}) {
  /*
   * The last markdown this editor emitted, so the effect below can tell "the
   * parent changed the value" from "the parent is echoing back what we just
   * typed". Without that distinction every keystroke reloads the document and
   * puts the cursor back at the start.
   *
   * A **ref, not state**, for two reasons. It is identity tracking rather than
   * anything rendered, so a change to it must not schedule a render; and
   * holding it in state means writing that state from inside the effect, which
   * the React Compiler rejects as `set-state-in-effect` — correctly, because
   * it is a render-loop shape. The ref is only ever read and written inside
   * callbacks and effects, never during render, which is the other half of the
   * rule.
   */
  const lastEmitted = useRef(value);

  const editor = useEditor({
    /*
     * Off, and this is required rather than a preference: Next renders this
     * on the server first, and TipTap's default immediate render produces
     * markup that does not match what the client builds — a hydration mismatch
     * that React reports as a full subtree replacement.
     */
    immediatelyRender: false,

    /*
     * The shared list from `lib/richText.ts`, not a copy. That module has no
     * React in it, which is what lets `lib/richText.test.ts` build the same
     * schema and assert the round trip against it — a second list here would
     * mean the tested schema and the running one could differ.
     */
    extensions: richTextExtensions,

    content: markdownToDoc(value),

    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': `${id}-label`,
        class:
          'prose-editor min-h-full w-full px-4 py-3 text-sm leading-relaxed outline-none',
      },
    },

    onUpdate({ editor: instance }) {
      const markdown = docToMarkdown(instance.getJSON() as PmNode);

      lastEmitted.current = markdown;
      onChange(markdown);
    },
  });

  /*
   * Re-load the document when the parent's value changes for a reason other
   * than this editor — a form reset, or a record loaded after mount. Guarded on
   * `lastEmitted` so ordinary typing does not reload and lose the cursor.
   */
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;

    /*
     * `emitUpdate: false` matters: without it, loading the document fires
     * `onUpdate`, which calls `onChange`, which marks the parent form dirty —
     * so simply opening a record would report unsaved changes.
     */
    editor.commands.setContent(markdownToDoc(value), { emitUpdate: false });
    lastEmitted.current = value;
  }, [editor, value]);

  return (
    <div>
      <span id={`${id}-label`} className="text-sm font-semibold">
        {label}
        {required && <span className="ml-2 font-normal text-muted">Required</span>}
      </span>

      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}

      <div
        className={`mt-1.5 overflow-hidden rounded border bg-white ${
          error ? 'border-error' : 'border-hairline'
        }`}
      >
        <Toolbar editor={editor} />

        <div style={{ minHeight }} className="cursor-text">
          <EditorContent editor={editor} />
        </div>
      </div>

      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-error">
          {error}
        </p>
      )}

      <p className="mt-1.5 text-xs text-muted">
        Stored as Markdown. Only what the buttons above produce is rendered on
        the site — anything else is shown as the characters you typed.
      </p>
    </div>
  );
}

/**
 * The toolbar. One button per construct the renderer supports, and no others.
 *
 * "A button producing markup the renderer ignores is worse than no button" —
 * so there is no strikethrough, no code, no image, no ordered list and no
 * heading beyond level three, because `PostBody` renders none of them.
 */
function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) {
    // The editor is null on the server and for one frame after mount, because
    // `immediatelyRender` is off. A placeholder of the same height stops the
    // field jumping as it appears.
    return <div className="h-11 border-b border-hairline bg-paper" />;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-hairline bg-paper px-2 py-1.5">
      <ToolbarButton
        editor={editor}
        label="Heading 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>

      <ToolbarButton
        editor={editor}
        label="Heading 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        editor={editor}
        label="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarButton>

      <ToolbarButton
        editor={editor}
        label="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        editor={editor}
        label="Bulleted list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        List
      </ToolbarButton>

      <ToolbarButton
        editor={editor}
        label="Quote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        Quote
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        editor={editor}
        label="Link"
        active={editor.isActive('link')}
        onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run();
            return;
          }

          /*
           * `window.prompt`, deliberately. It is synchronous, which is what
           * keeps the selection intact — an async dialog would need the range
           * saved and restored, and this is the admin, used by one person.
           */
          const href = window.prompt(
            'Link to where? A path like /trips, or a full https:// URL.'
          );

          if (!href) return;

          editor.chain().focus().setLink({ href: href.trim() }).run();
        }}
      >
        Link
      </ToolbarButton>
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-hairline" />;
}

function ToolbarButton({
  editor,
  label,
  active,
  onClick,
  children,
}: {
  editor: Editor;
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  void editor;

  return (
    <button
      type="button"
      onClick={onClick}
      // The accessible name is the word, not the glyph: a screen reader
      // announcing "B" tells nobody what the button does.
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`min-w-9 rounded px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'bg-ink text-paper' : 'text-ink hover:bg-white'
      }`}
    >
      {children}
    </button>
  );
}
