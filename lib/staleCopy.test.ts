import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findStalePriceCopy } from './staleCopy';

const base = { previousPrice: 1295, newPrice: 2222 };

test('finds the comma-grouped spelling an editor actually types', () => {
  const [warning] = findStalePriceCopy({
    ...base,
    answerBlock: 'The trek costs from USD 1,295 per person and takes 14 days.',
  });

  assert.equal(warning.field, 'answerBlock');
  assert.equal(warning.found, '1,295');
  assert.equal(warning.message, 'Your answer block still says USD 1,295.');
});

test('finds the plain spelling too', () => {
  const [warning] = findStalePriceCopy({ ...base, answerBlock: 'From USD 1295.' });

  assert.equal(warning.found, '1295');
});

test('reports both fields independently', () => {
  const warnings = findStalePriceCopy({
    ...base,
    answerBlock: 'Costs 1,295 per person.',
    metaDescription: 'A 14-day trek from USD 1295.',
  });

  assert.equal(warnings.length, 2);
  assert.deepEqual(warnings.map((w) => w.field), ['answerBlock', 'metaDescription']);
});

test('silent when the price did not change', () => {
  const warnings = findStalePriceCopy({
    previousPrice: 1295,
    newPrice: 1295,
    answerBlock: 'Costs 1,295 per person.',
  });

  assert.deepEqual(warnings, []);
});

test('silent when the copy never mentioned the price', () => {
  const warnings = findStalePriceCopy({
    ...base,
    answerBlock: 'A 14-day trek reaching 5,364 m at base camp.',
  });

  assert.deepEqual(warnings, []);
});

/*
 * The boundary cases. A shorter price must not match inside a longer number —
 * this is exactly what a naive `includes()` or `\b` check gets wrong, because
 * `\b` treats a comma as a word boundary and fires inside "1,295".
 */
test('295 does not match inside 1,295', () => {
  const warnings = findStalePriceCopy({
    previousPrice: 295,
    newPrice: 300,
    answerBlock: 'The upgrade costs 1,295 per person.',
  });

  assert.deepEqual(warnings, []);
});

test('295 does not match inside 2950', () => {
  const warnings = findStalePriceCopy({
    previousPrice: 295,
    newPrice: 300,
    answerBlock: 'Reaching 2950 m on day four.',
  });

  assert.deepEqual(warnings, []);
});

test('1295 does not match inside 1295.50', () => {
  const warnings = findStalePriceCopy({
    ...base,
    answerBlock: 'Exactly 1295.50 including tax.',
  });

  assert.deepEqual(warnings, []);
});

test('matches at the very start and end of the text', () => {
  assert.equal(
    findStalePriceCopy({ ...base, answerBlock: '1,295 is the price' }).length,
    1
  );
  assert.equal(
    findStalePriceCopy({ ...base, answerBlock: 'the price is 1,295' }).length,
    1
  );
});

test('an altitude that happens to equal the old price is still reported', () => {
  /*
   * Deliberate: 1,295 m and USD 1,295 are indistinguishable to this check. A
   * false positive costs the admin one glance; a false negative ships a stale
   * price on the extraction target. The warning quotes the figure so the
   * mistake is obvious at a look.
   */
  const warnings = findStalePriceCopy({
    ...base,
    answerBlock: 'Starting at 1,295 m above sea level.',
  });

  assert.equal(warnings.length, 1);
});

test('missing fields are skipped rather than crashing', () => {
  assert.deepEqual(findStalePriceCopy(base), []);
  assert.deepEqual(findStalePriceCopy({ ...base, answerBlock: '' }), []);
});
