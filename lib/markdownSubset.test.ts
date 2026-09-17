import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  parseBlocks,
  serialiseBlocks,
  roundTrip,
  type Block,
} from './markdownSubset';
import { parseLongForm } from './longForm';

/**
 * The acceptance criterion for the rich-text editor.
 *
 * The editor is only safe to ship if loading a stored body and saving it
 * unchanged produces the same bytes. The failure it guards against is silent:
 * open an old post, press save, lose a heading — and nobody notices until the
 * page is read.
 *
 * So these fixtures are **copies of the real content**, not examples written to
 * pass. `lib/__fixtures__/markdown/` holds every Markdown-bearing field in the
 * database at the time the editor was built: four blog bodies, Nepal's
 * `activitiesIntro`, and the SiteSettings company story.
 */

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'markdown');

function fixtures(): { name: string; body: string }[] {
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => ({
      name: file.replace(/\.md$/, ''),
      // utf8 explicitly: the content is full of em dashes and curly quotes, and
      // a latin-1 read would round-trip byte-identically while being wrong.
      body: fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'),
    }));
}

describe('round-trip: every stored body', () => {
  for (const { name, body } of fixtures()) {
    test(`${name} survives parse → serialise unchanged`, () => {
      const out = roundTrip(body);

      if (out !== body) {
        // A diff that names the first divergent line, because "strings differ"
        // on a 4,000-character body is not a usable failure message.
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

  test('the fixtures are actually present', () => {
    // A test suite that silently passes because it found no files is worse
    // than one that fails.
    assert.ok(fixtures().length >= 6, 'expected at least six fixture bodies');
  });
});

describe('round-trip: a second pass changes nothing further', () => {
  for (const { name, body } of fixtures()) {
    test(`${name} is idempotent`, () => {
      const once = roundTrip(body);

      /*
       * Separate from the byte-identity test on purpose. If the serialiser
       * were non-canonical — emitting a form it does not itself parse back the
       * same way — the first pass could match and the second drift. That would
       * mean an editor that is safe once and lossy on the second save.
       */
      assert.equal(roundTrip(once), once);
    });
  }
});

describe('the structures parseLongForm keys on survive', () => {
  /*
   * Two things in `lib/longForm.ts` break silently if the serialiser changes
   * their spelling, and neither would show up as a parse error:
   *
   *  - sections are split on `\n(?=## )`, so an h2 emitted any other way
   *    collapses the whole article into one section
   *  - a section's pull quote is its first `>` block, lifted out of the body;
   *    a quote emitted without the marker stops being a pull quote and starts
   *    being an ordinary paragraph, in the middle of the text it was lifted from
   */
  const intro = fixtures().find((f) => f.name === 'intro--nepal');

  test('the long-form fixture exists', () => {
    assert.ok(intro, 'intro--nepal fixture is missing');
  });

  test('section headings and pull quotes are identical after a round trip', () => {
    const before = parseLongForm(intro!.body);
    const after = parseLongForm(roundTrip(intro!.body));

    assert.equal(after.lede, before.lede, 'the lede changed');
    assert.equal(
      after.sections.length,
      before.sections.length,
      'the number of sections changed — the ## split broke'
    );

    for (const [index, section] of before.sections.entries()) {
      assert.equal(after.sections[index].heading, section.heading);
      assert.equal(after.sections[index].id, section.id, 'an anchor id moved');
      assert.equal(
        after.sections[index].pullQuote,
        section.pullQuote,
        `the pull quote changed in "${section.heading}"`
      );
      assert.equal(after.sections[index].body, section.body);
    }
  });

  test('the fixture really does exercise both mechanisms', () => {
    const doc = parseLongForm(intro!.body);

    // Otherwise the assertions above would pass on content that has neither.
    assert.ok(doc.sections.length > 1, 'expected several ## sections');
    assert.ok(
      doc.sections.some((section) => section.pullQuote !== null),
      'expected at least one > pull quote'
    );
  });
});

describe('every construct in the subset', () => {
  const cases: [string, string][] = [
    ['h2', '## A heading'],
    ['h3', '### A subheading'],
    ['paragraph', 'Just some words.'],
    ['bold', 'Some **bold** words.'],
    ['italic', 'Some *italic* words.'],
    ['bold and italic', 'Some ***both*** words.'],
    ['internal link', 'See [the trips](/trips) page.'],
    ['external link', 'See [TAAN](https://taanpokhara.org).'],
    ['list', '- one\n- two\n- three'],
    ['list with marks', '- **Spring.** Warmer days.\n- **Autumn.** Clear air.'],
    ['blockquote', '> A quoted line.'],
    ['multi-line blockquote', '> First line.\n> Second line.'],
    ['soft-wrapped paragraph', 'A line\nand its continuation.'],
    ['several blocks', '## One\n\nText.\n\n- a\n- b\n\n> Quote.\n\n### Two\n\nMore.'],
    ['adjacent marks', '**a***b*'],
    ['link beside bold', '**Bold** then [a link](/x).'],
  ];

  for (const [name, source] of cases) {
    test(name, () => {
      assert.equal(roundTrip(source), source);
    });
  }
});

describe('block typing', () => {
  test('a list needs every line prefixed, as the renderer requires', () => {
    // One unprefixed line makes the whole block a paragraph — matching
    // PostBody, which uses `lines.every(...)`.
    const blocks = parseBlocks('- one\nnot an item');

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'paragraph');
  });

  test('heading levels are read, not guessed', () => {
    const blocks = parseBlocks('## Two\n\n### Three');

    assert.deepEqual(
      blocks.map((b) => (b.type === 'heading' ? b.level : b.type)),
      [2, 3]
    );
  });

  test('a lone # is not a heading, because the renderer has no h1', () => {
    const blocks = parseBlocks('# Not a heading');

    assert.equal(blocks[0].type, 'paragraph');
    assert.equal(roundTrip('# Not a heading'), '# Not a heading');
  });

  test('bold is matched before italic, so *** is one token', () => {
    const blocks = parseBlocks('***x***') as Block[];

    assert.equal(blocks[0].type, 'paragraph');

    const node = blocks[0].type === 'paragraph' ? blocks[0].content[0] : null;

    assert.deepEqual(node, { type: 'text', value: 'x', bold: true, italic: true });
  });
});

describe('known non-canonical input is reported, not silently rewritten', () => {
  /*
   * These are the cases where the round trip legitimately does not hold. They
   * are asserted as *changes* so the behaviour is recorded rather than
   * discovered: if someone makes the serialiser preserve them, this suite says
   * so instead of quietly passing.
   *
   * None of them appear in the stored content — that is why the suite above is
   * byte-exact.
   */
  test('a quote marker without a space is NOT a quote, and round-trips as-is', () => {
    /*
     * `PostBody` requires `'> '` with the space, so `>tight` is a paragraph and
     * survives untouched. Asserted because it is the opposite of what it looks
     * like, and because of the divergence below.
     */
    assert.equal(parseBlocks('>tight')[0].type, 'paragraph');
    assert.equal(roundTrip('>tight'), '>tight');
  });

  test('DIVERGENCE: parseLongForm treats >tight as a quote and PostBody does not', () => {
    /*
     * A pre-existing inconsistency, found by this suite and recorded rather
     * than silently corrected — changing either side changes what renders.
     *
     *   PostBody / parseBlocks:  block.startsWith('> ')   — space required
     *   parseLongForm:           /(?:> ?.*)+/             — space optional
     *
     * So a hand-written `>tight` line is lifted out as a pull quote by the
     * long-form layout while the renderer would have shown it as literal text.
     * No stored content uses the tight form, and the serialiser only ever emits
     * `'> '`, so nothing authored in the editor can hit it. It is asserted here
     * so that if either parser is touched, the mismatch surfaces as a failing
     * test rather than as a paragraph that quietly became a pull quote.
     */
    const source = '## Section\n\n>tight quote\n\nBody text.';

    assert.deepEqual(
      parseBlocks(source).map((block) => block.type),
      ['heading', 'paragraph', 'paragraph'],
      'PostBody should see two paragraphs'
    );

    assert.equal(
      parseLongForm(source).sections[0].pullQuote,
      'tight quote',
      'parseLongForm should still see a pull quote'
    );

    // Whichever way they disagree, the bytes survive the editor.
    assert.equal(roundTrip(source), source);
  });

  test('three blank lines between blocks collapse to one', () => {
    assert.equal(roundTrip('a\n\n\n\nb'), 'a\n\nb');
  });

  test('leading and trailing blank lines are dropped', () => {
    assert.equal(roundTrip('\n\nbody\n\n'), 'body');
  });

  test('trailing spaces on a line are trimmed at the block edge', () => {
    assert.equal(roundTrip('a paragraph   '), 'a paragraph');
  });
});

describe('serialiseBlocks accepts what parseBlocks produces', () => {
  test('an empty document is an empty string, not a crash', () => {
    assert.equal(serialiseBlocks(parseBlocks('')), '');
    assert.equal(serialiseBlocks([]), '');
  });

  test('whitespace-only input yields no blocks', () => {
    assert.deepEqual(parseBlocks('   \n\n  \n'), []);
  });
});
