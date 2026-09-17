import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getSchema } from '@tiptap/core';

import {
  richTextExtensions,
  markdownToDoc,
  docToMarkdown,
  type PmNode,
} from './richText';
import { parseLongForm } from './longForm';

/**
 * The acceptance criterion: a body loaded into the editor and saved again is
 * byte-identical.
 *
 * ## Why this runs the real schema
 *
 * `markdownSubset.test.ts` proves the parser and serialiser agree with each
 * other. That is necessary and not sufficient: the editor puts a third thing in
 * the middle. ProseMirror validates a document against the schema when it loads
 * it and **normalises it** — merging adjacent text nodes that carry identical
 * marks, dropping attributes the schema does not declare, coercing a node it
 * cannot represent into the nearest one it can.
 *
 * So the conversion could be perfectly self-consistent and the editor still
 * change the document the instant it opened it. `getSchema` and
 * `Schema.nodeFromJSON` are pure `prosemirror-model` with no DOM in them, so
 * the real schema — the same extension list the component registers — can be
 * exercised here.
 *
 * The path under test is therefore the whole of it:
 *
 *     stored Markdown
 *       → markdownToDoc          our conversion
 *       → schema.nodeFromJSON    ProseMirror validates and normalises
 *       → node.toJSON            what the editor would hand back
 *       → docToMarkdown          our conversion
 *       → Markdown
 *
 * What it does not cover is the editing surface itself — selection, paste
 * handling, input rules — which needs a DOM. That is stated rather than
 * papered over.
 */

const schema = getSchema(richTextExtensions);

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'markdown');

function fixtures(): { name: string; body: string }[] {
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => ({
      name: file.replace(/\.md$/, ''),
      body: fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'),
    }));
}

/** The full path a body takes through the editor, without an editing surface. */
function throughEditor(markdown: string): string {
  const json = markdownToDoc(markdown);

  // Throws if the document violates the schema — which is itself a useful
  // assertion, since a silently-coerced document is the failure mode here.
  const node = schema.nodeFromJSON(json);

  return docToMarkdown(node.toJSON() as PmNode);
}

describe('editor round-trip: every stored body', () => {
  for (const { name, body } of fixtures()) {
    test(`${name} is byte-identical after loading and saving`, () => {
      const out = throughEditor(body);

      if (out !== body) {
        const a = body.split('\n');
        const b = out.split('\n');
        const at = a.findIndex((line, index) => line !== b[index]);

        assert.fail(
          `${name} changed at line ${at + 1}\n` +
            `  stored: ${JSON.stringify(a[at])}\n` +
            `  after:  ${JSON.stringify(b[at])}`
        );
      }

      assert.equal(out, body);
    });
  }

  test('the fixtures are present', () => {
    assert.ok(fixtures().length >= 6, 'expected at least six fixture bodies');
  });

  test('every fixture is non-trivial', () => {
    // A zero-length fixture would pass every assertion above.
    for (const { name, body } of fixtures()) {
      assert.ok(body.length > 300, `${name} is suspiciously short`);
    }
  });
});

describe('editor round-trip: saving twice changes nothing further', () => {
  for (const { name, body } of fixtures()) {
    test(`${name} is idempotent`, () => {
      const once = throughEditor(body);
      assert.equal(throughEditor(once), once);
    });
  }
});

describe('the two structures parseLongForm keys on', () => {
  const intro = fixtures().find((f) => f.name === 'intro--nepal')!;

  test('## section splitting survives the editor', () => {
    const before = parseLongForm(intro.body);
    const after = parseLongForm(throughEditor(intro.body));

    assert.equal(
      after.sections.length,
      before.sections.length,
      'the number of sections changed — the ## split broke'
    );

    assert.deepEqual(
      after.sections.map((section) => section.heading),
      before.sections.map((section) => section.heading)
    );

    assert.deepEqual(
      after.sections.map((section) => section.id),
      before.sections.map((section) => section.id),
      'an anchor id moved, which breaks every table-of-contents link'
    );
  });

  test('> pull quotes survive the editor', () => {
    const before = parseLongForm(intro.body);
    const after = parseLongForm(throughEditor(intro.body));

    assert.deepEqual(
      after.sections.map((section) => section.pullQuote),
      before.sections.map((section) => section.pullQuote)
    );

    // And the bodies they were lifted out of.
    assert.deepEqual(
      after.sections.map((section) => section.body),
      before.sections.map((section) => section.body)
    );
  });

  test('the fixture exercises both mechanisms', () => {
    const doc = parseLongForm(intro.body);

    assert.ok(doc.sections.length > 1, 'expected several ## sections');
    assert.ok(
      doc.sections.filter((section) => section.pullQuote !== null).length > 1,
      'expected more than one > pull quote'
    );
  });
});

describe('the schema refuses what the renderer cannot show', () => {
  /*
   * These assert the *constraint*, not the conversion. If someone swaps the
   * extension list for StarterKit, the toolbar would still look right and
   * bodies would start acquiring nodes `PostBody` renders as literal text.
   */
  test('there is no code block, strike, or ordered list node', () => {
    for (const absent of ['codeBlock', 'orderedList', 'horizontalRule', 'image']) {
      assert.equal(
        schema.nodes[absent],
        undefined,
        `${absent} is in the schema and the renderer cannot show it`
      );
    }

    assert.equal(schema.marks.strike, undefined);
    assert.equal(schema.marks.code, undefined);
  });

  test('the nodes and marks the renderer does support are present', () => {
    for (const present of [
      'doc',
      'paragraph',
      'text',
      'heading',
      'bulletList',
      'listItem',
      'blockquote',
      'hardBreak',
    ]) {
      assert.ok(schema.nodes[present], `${present} is missing from the schema`);
    }

    for (const mark of ['bold', 'italic', 'link']) {
      assert.ok(schema.marks[mark], `${mark} is missing from the schema`);
    }
  });

  test('headings are limited to levels 2 and 3', () => {
    assert.deepEqual(schema.nodes.heading.spec.attrs?.level?.default, 1);

    // The configured range is what the toolbar and the input rules honour; the
    // serialiser clamps anything else to h2 rather than emitting a `#`.
    assert.equal(docToMarkdown(headingDoc(1)), '## One');
    assert.equal(docToMarkdown(headingDoc(2)), '## One');
    assert.equal(docToMarkdown(headingDoc(3)), '### One');
    assert.equal(docToMarkdown(headingDoc(6)), '## One');
  });

  function headingDoc(level: number): PmNode {
    return {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: 'One' }],
        },
      ],
    };
  }
});

describe('ProseMirror normalisation does not change stored content', () => {
  test('an empty trailing paragraph is not written back', () => {
    const doc: PmNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Body.' }] },
        // ProseMirror keeps one of these as a cursor target.
        { type: 'paragraph' },
      ],
    };

    assert.equal(docToMarkdown(doc), 'Body.');
  });

  test('a document with no blocks serialises to an empty string', () => {
    assert.equal(throughEditor(''), '');
  });

  test('marks survive the schema unmerged where they differ', () => {
    const source = 'A **bold** and *italic* and ***both*** run.';
    assert.equal(throughEditor(source), source);
  });

  test('a link keeps its href through the schema', () => {
    const source = 'See [the trips](/trips) and [TAAN](https://taanpokhara.org).';
    assert.equal(throughEditor(source), source);
  });

  test('a soft-wrapped paragraph keeps its newline', () => {
    const source = 'A line\nand its continuation.';
    assert.equal(throughEditor(source), source);
  });

  test('a multi-line blockquote keeps one marker per line', () => {
    const source = '> First line.\n> Second line.';
    assert.equal(throughEditor(source), source);
  });
});
