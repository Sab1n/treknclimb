import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import Trip from '../../../models/Trip';
import { mongooseFieldErrors } from '../../../lib/mongooseErrors';
import { firstTabWithError, tabForField, withoutErrorsFor } from './tabs';
import { describeSaveFailure } from '../saveFailure';
import { installJsdom } from '../../testing/jsdom';
import type { SeasonRow } from '../../../types/tripEditor';

/**
 * A validation error on a nested path must reach the input it is about and
 * open the tab holding it.
 *
 * Walked end to end, in the order a real failure travels:
 *
 *   model → route's error mapping → save-failure reading → tab choice → field
 *
 * The first three need no DOM. The last mounts the real Departures tab and
 * looks for the message under the status select, because "the key exists in
 * `errors`" proves nothing about whether anyone can see it.
 */

const STATUS_PATH = 'departureSeasons.0.exceptions.0.status';

/*
 * No destination, deliberately: Trip's `pre('validate')` hook looks the
 * destination up, and with one set and no database it waits out Mongoose's
 * buffering timeout. Without one the hook returns early, and the
 * required-field error that produces is simply another key alongside the one
 * under test.
 */
function tripWithBadExceptionStatus() {
  return new Trip({
    title: 'Nested error test',
    slug: 'nested-error-test',
    activity: null,
    durationDays: 14,
    price: 1000,
    startPoint: 'Kathmandu',
    endPoint: 'Kathmandu',
    departureSeasons: [
      {
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-31T00:00:00.000Z'),
        pattern: 'daily',
        weekdays: [],
        pricePerPerson: 1245,
        // Not in the enum. Only reachable with Zod bypassed — a script, or a
        // client that is not the editor.
        exceptions: [
          { date: new Date('2026-10-05T00:00:00.000Z'), status: 'guaranteed', pricePerPerson: null },
        ],
      },
    ],
  });
}

async function modelFieldErrors(trip: InstanceType<typeof Trip>) {
  try {
    await trip.validate();
  } catch (error) {
    assert.ok(error instanceof mongoose.Error.ValidationError);
    return mongooseFieldErrors(error);
  }

  assert.fail('expected the model to reject the trip');
}

describe('a nested model error, server side', () => {
  test('arrives keyed by its full path, not flattened to the list', async () => {
    const fieldErrors = await modelFieldErrors(tripWithBadExceptionStatus());

    assert.ok(STATUS_PATH in fieldErrors, `keys were: ${Object.keys(fieldErrors).join(', ')}`);
    assert.equal('departureSeasons' in fieldErrors, false);
  });

  test('survives the editor reading the 400 as a validation failure', async () => {
    const fieldErrors = await modelFieldErrors(tripWithBadExceptionStatus());
    const failure = describeSaveFailure(400, { error: 'Some fields need checking.', fieldErrors });

    assert.equal(failure.kind, 'validation');
    assert.equal(failure.fieldErrors[STATUS_PATH], fieldErrors[STATUS_PATH]);
  });

  test('opens the Departures tab', () => {
    assert.equal(tabForField(STATUS_PATH), 'Departures');
    // Tab order, not report order: a Basic error listed later still wins.
    assert.equal(firstTabWithError({ [STATUS_PATH]: 'x' }), 'Departures');
    assert.equal(firstTabWithError({ [STATUS_PATH]: 'x', title: 'y' }), 'Basic');
  });

  test('overlapping seasons are rejected by the model, keyed to the list', async () => {
    const trip = tripWithBadExceptionStatus();

    trip.departureSeasons[0].exceptions = [];
    trip.departureSeasons.push({
      startDate: new Date('2026-10-20T00:00:00.000Z'),
      endDate: new Date('2026-11-05T00:00:00.000Z'),
      pattern: 'daily',
      weekdays: [],
      pricePerPerson: 1300,
      exceptions: [],
    });

    const fieldErrors = await modelFieldErrors(trip);

    assert.ok('departureSeasons' in fieldErrors);
    assert.equal(tabForField('departureSeasons'), 'Departures');
  });
});

describe('editing clears the nested errors under the field', () => {
  test('the whole subtree goes, other fields stay', () => {
    const errors = {
      [STATUS_PATH]: 'bad',
      'departureSeasons.1.startDate': 'overlap',
      departureSeasons: 'list',
      departureSeasonsNote: 'a different field sharing the prefix',
      title: 'Required',
    };

    assert.deepEqual(withoutErrorsFor(errors, 'departureSeasons'), {
      departureSeasonsNote: 'a different field sharing the prefix',
      title: 'Required',
    });
  });
});

describe('a save failure that is not validation', () => {
  test('a bare 500 with no JSON body says it was a server error', () => {
    const failure = describeSaveFailure(500, {});

    assert.equal(failure.kind, 'server');
    assert.match(failure.message, /Server error \(HTTP 500\)/);
    assert.match(failure.message, /nothing was saved/);
    assert.deepEqual(failure.fieldErrors, {});
  });

  test('a 500 the route wrote is still a server error', () => {
    const failure = describeSaveFailure(500, { error: 'Could not save. Nothing was changed.' });

    assert.equal(failure.kind, 'server');
  });

  test('a 409 with its own message shows that message', () => {
    const failure = describeSaveFailure(409, { error: 'Archive it instead.' });

    assert.equal(failure.kind, 'rejected');
    assert.equal(failure.message, 'Archive it instead.');
  });
});

/* ---------------- the field, rendered ---------------- */

describe('the Departures tab renders it under the right input', () => {
  let restore: (() => void) | undefined;

  before(() => {
    restore = installJsdom();
  });

  after(() => restore?.());

  const season: SeasonRow = {
    key: 'season-a',
    id: '',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    pattern: 'daily',
    weekdays: [],
    pricePerPerson: '1245',
    exceptions: [{ key: 'exception-a', date: '2026-10-05', status: 'full', pricePerPerson: '' }],
  };

  async function mount(errors: Record<string, string>, seasons: SeasonRow[] = [season]) {
    const { createElement, act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const TripDeparturesTab = (await import('./TripDeparturesTab')).default;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(TripDeparturesTab, {
          seasons,
          blackoutPeriods: [],
          onSeasonsChange: () => {},
          onBlackoutPeriodsChange: () => {},
          errors,
        })
      );
    });

    return { container, unmount: () => act(async () => root.unmount()) };
  }

  test('an exception status error marks that select and shows its message', async () => {
    const { container, unmount } = await mount({ [STATUS_PATH]: 'Not a status we know' });

    const select = container.querySelector<HTMLSelectElement>('#exception-exception-a-status');

    assert.ok(select, 'the status select rendered');
    assert.equal(select.getAttribute('aria-invalid'), 'true');

    const message = container.querySelector(`#${select.getAttribute('aria-describedby')}`);

    assert.equal(message?.textContent, 'Not a status we know');
    await unmount();
  });

  test('list-level errors from the model are rendered, not only counted', async () => {
    const { container, unmount } = await mount({
      departureSeasons: 'Two seasons depart on the same date.',
      'departureSeasons.0.exceptions': 'Every exception must fall on a date this season departs.',
    });

    const alerts = [...container.querySelectorAll('[role="alert"]')].map((node) => node.textContent);

    assert.ok(alerts.includes('Two seasons depart on the same date.'));
    assert.ok(alerts.includes('Every exception must fall on a date this season departs.'));
    await unmount();
  });

  test('an overlap is flagged live on the later season, before any save', async () => {
    const later: SeasonRow = {
      ...season,
      key: 'season-b',
      startDate: '2026-10-20',
      endDate: '2026-11-05',
      exceptions: [],
    };

    const { container, unmount } = await mount({}, [season, later]);

    const start = container.querySelector<HTMLInputElement>('#season-season-b-start');

    assert.equal(start?.getAttribute('aria-invalid'), 'true');
    assert.match(
      container.querySelector(`#${start!.getAttribute('aria-describedby')}`)?.textContent ?? '',
      /Overlaps the season starting 1 Oct 2026 — both depart on 20 Oct 2026/
    );

    // The earlier season is not flagged: each clash is reported once.
    assert.equal(
      container.querySelector('#season-season-a-start')?.getAttribute('aria-invalid'),
      null
    );
    await unmount();
  });
});
