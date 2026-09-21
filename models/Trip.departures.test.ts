import test from 'node:test';
import assert from 'node:assert/strict';

import Trip from './Trip';
import { fromIsoDate } from '../lib/departures';

/**
 * The season rules, enforced by the **model** — with Zod bypassed entirely.
 *
 * CLAUDE.md's rule for any save-blocking rule: verify it at the model, because
 * the Zod schema only guards the admin route, and a migration or a seed writes
 * straight through Mongoose.
 *
 * No database is needed. Trip's `pre('validate')` hook looks up the
 * destination and returns early when there is none, so these documents are
 * built without one; the other required-field errors that produces are
 * ignored and only the season paths are asserted.
 */

async function errorsOf(doc: { validate: () => Promise<void> }) {
  try {
    await doc.validate();
    return {} as Record<string, { message: string }>;
  } catch (error) {
    return (error as { errors: Record<string, { message: string }> }).errors;
  }
}

function tripWithSeason(season: Record<string, unknown>) {
  return new Trip({
    title: 'Season rule check',
    slug: 'season-rule-check',
    status: 'draft',
    departureSeasons: [
      {
        startDate: fromIsoDate('2026-10-01'),
        endDate: fromIsoDate('2026-10-31'),
        pattern: 'daily',
        pricePerPerson: 1245,
        ...season,
      },
    ],
  });
}

function seasonErrors(errors: Record<string, { message: string }>) {
  return Object.keys(errors).filter((key) => key.startsWith('departureSeasons'));
}

test('a valid season raises nothing', async () => {
  assert.deepEqual(seasonErrors(await errorsOf(tripWithSeason({}))), []);
});

test('a season ending the day it starts is valid — it is a single departure', async () => {
  const errors = await errorsOf(
    tripWithSeason({ startDate: fromIsoDate('2026-11-09'), endDate: fromIsoDate('2026-11-09') })
  );

  assert.deepEqual(seasonErrors(errors), []);
});

test('a season ending before it starts is rejected, keyed to its end date', async () => {
  const errors = await errorsOf(tripWithSeason({ endDate: fromIsoDate('2026-09-30') }));

  assert.ok(errors['departureSeasons.0.endDate'], Object.keys(errors).join(', '));
});

test('a days-of-week season with no days is rejected', async () => {
  const errors = await errorsOf(tripWithSeason({ pattern: 'weekdays', weekdays: [] }));

  assert.ok(errors['departureSeasons.0.weekdays']);
});

test('an exception off the pattern, or doing nothing, is rejected', async () => {
  const offPattern = await errorsOf(
    tripWithSeason({
      pattern: 'weekdays',
      weekdays: [1],
      // 13 October 2026 is a Tuesday.
      exceptions: [{ date: fromIsoDate('2026-10-13'), status: 'full' }],
    })
  );
  const inert = await errorsOf(
    tripWithSeason({ exceptions: [{ date: fromIsoDate('2026-10-13') }] })
  );

  assert.ok(offPattern['departureSeasons.0.exceptions']);
  assert.ok(inert['departureSeasons.0.exceptions']);
});

test('a price-only exception with no status is valid', async () => {
  const errors = await errorsOf(
    tripWithSeason({
      exceptions: [{ date: fromIsoDate('2026-10-13'), status: null, pricePerPerson: 1195 }],
    })
  );

  assert.deepEqual(seasonErrors(errors), []);
});

test('an exception status outside full / closed is rejected', async () => {
  const errors = await errorsOf(
    tripWithSeason({ exceptions: [{ date: fromIsoDate('2026-10-13'), status: 'guaranteed' }] })
  );

  assert.ok(errors['departureSeasons.0.exceptions.0.status']);
});

test('a blackout period still must end strictly after it starts', async () => {
  const trip = new Trip({
    title: 'Blackout rule check',
    slug: 'blackout-rule-check',
    status: 'draft',
    blackoutPeriods: [{ start: fromIsoDate('2026-12-24'), end: fromIsoDate('2026-12-24') }],
  });

  assert.ok((await errorsOf(trip))['blackoutPeriods.0.end']);
});
