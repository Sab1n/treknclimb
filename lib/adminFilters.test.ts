import test from 'node:test';
import assert from 'node:assert/strict';

import { parseInquiryFilters, toListOptions } from './adminFilters';

/**
 * The inquiry screen's date range.
 *
 * The bug: an end date before the start date was accepted. Both bounds go into
 * one query, so it matched nothing — and an empty table is indistinguishable
 * from a genuinely quiet week, with the inputs still showing what was typed and
 * nothing anywhere saying the range was impossible.
 *
 * Pure input parsing, so no database and no DOM. Everything here comes from a
 * query string a person can hand-edit, which is the other reason it is worth
 * testing directly.
 */

test('a valid range is left alone', () => {
  const filters = parseInquiryFilters({ from: '2026-09-01', to: '2026-09-30' });

  assert.equal(filters.fromInput, '2026-09-01');
  assert.equal(filters.toInput, '2026-09-30');
  assert.equal(filters.datesSwapped, false);
});

test('an inverted range is swapped, and says so', () => {
  const filters = parseInquiryFilters({ from: '2026-09-30', to: '2026-09-01' });

  assert.equal(filters.fromInput, '2026-09-01');
  assert.equal(filters.toInput, '2026-09-30');
  assert.equal(filters.datesSwapped, true);
});

test('the swapped range actually produces a usable query', () => {
  const options = toListOptions(
    parseInquiryFilters({ from: '2026-09-30', to: '2026-09-01' })
  );

  assert.ok(options.from, 'expected a lower bound');
  assert.ok(options.to, 'expected an upper bound');

  /*
   * The real assertion. Before the fix this was inverted, and `from > to`
   * matches nothing however the bounds are built.
   */
  assert.ok(
    options.from!.getTime() < options.to!.getTime(),
    'the lower bound must be earlier than the upper bound'
  );
});

test('a single day is not treated as inverted', () => {
  /*
   * The bounds are start-of-day and end-of-day in Nepal time, so the same date
   * on both sides is a valid one-day range — comparing the raw strings would
   * be fine here, but comparing the *instants* is what makes this correct, and
   * this is the case that would break if the comparison used `>=`.
   */
  const filters = parseInquiryFilters({ from: '2026-09-15', to: '2026-09-15' });

  assert.equal(filters.datesSwapped, false);
  assert.equal(filters.fromInput, '2026-09-15');
  assert.equal(filters.toInput, '2026-09-15');

  const options = toListOptions(filters);

  assert.ok(options.from!.getTime() < options.to!.getTime());
});

test('one bound alone is never swapped', () => {
  const onlyFrom = parseInquiryFilters({ from: '2026-09-30' });
  assert.equal(onlyFrom.datesSwapped, false);
  assert.equal(onlyFrom.fromInput, '2026-09-30');
  assert.equal(onlyFrom.toInput, '');

  const onlyTo = parseInquiryFilters({ to: '2026-09-01' });
  assert.equal(onlyTo.datesSwapped, false);
  assert.equal(onlyTo.toInput, '2026-09-01');
  assert.equal(onlyTo.fromInput, '');
});

test('junk dates are dropped rather than swapped', () => {
  /*
   * A hand-edited URL. An unparseable bound is discarded, which leaves nothing
   * to compare — the swap must not fire on a value that was never a date.
   */
  const filters = parseInquiryFilters({
    from: 'not-a-date',
    to: '2026-09-01',
  });

  assert.equal(filters.fromInput, '');
  assert.equal(filters.toInput, '2026-09-01');
  assert.equal(filters.datesSwapped, false);
});

test('an unknown status or sort field falls back rather than reaching Mongo', () => {
  const filters = parseInquiryFilters({
    status: '{"$ne":null}',
    sort: 'dropDatabase',
    dir: 'sideways',
  });

  assert.equal(filters.status, undefined);
  assert.equal(filters.sort, 'createdAt');
  assert.equal(filters.direction, 'desc');
});
