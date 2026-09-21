import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  snapshotDeparture,
  departureNow,
  bookingDepartureView,
  storedSnapshot,
  formatDepartureRange,
  departureLengthDays,
} from './bookingDeparture';
import { departureId, type SeasonView } from './departures';

/**
 * The departure an inquiry names, checked at submission and again in the
 * admin. The rule under test above all: **nothing here ever refuses an
 * inquiry** — a departure that is full, closed or gone still produces a
 * snapshot, flagged.
 */

const SEASON = '65f0c0ffee0000000000abcd';

const october: SeasonView = {
  id: SEASON,
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  pattern: 'daily',
  weekdays: [],
  pricePerPerson: 1245,
  exceptions: [
    { date: '2026-10-17', status: 'closed', pricePerPerson: null },
    { date: '2026-10-26', status: 'full', pricePerPerson: null },
    { date: '2026-10-20', status: null, pricePerPerson: 1195 },
  ],
};

const TODAY = '2026-09-22';

describe('snapshotDeparture — at submission', () => {
  test('an available departure: its dates, its price, available', () => {
    assert.deepEqual(snapshotDeparture([october], 14, departureId(SEASON, '2026-10-13'), TODAY), {
      startDate: '2026-10-13',
      endDate: '2026-10-26',
      pricePerPerson: 1245,
      statusAtSubmission: 'available',
    });
  });

  test('an exception price is the price recorded', () => {
    assert.equal(
      snapshotDeparture([october], 14, departureId(SEASON, '2026-10-20'), TODAY)?.pricePerPerson,
      1195
    );
  });

  test('full and closed are snapshotted and flagged, not refused', () => {
    const full = snapshotDeparture([october], 14, departureId(SEASON, '2026-10-26'), TODAY);
    const closed = snapshotDeparture([october], 14, departureId(SEASON, '2026-10-17'), TODAY);

    assert.equal(full?.statusAtSubmission, 'full');
    assert.equal(full?.pricePerPerson, 1245);
    assert.equal(closed?.statusAtSubmission, 'closed');
  });

  test('a deleted season: gone, dates from the id, no price', () => {
    assert.deepEqual(snapshotDeparture([], 14, departureId(SEASON, '2026-10-13'), TODAY), {
      startDate: '2026-10-13',
      endDate: '2026-10-26',
      pricePerPerson: null,
      statusAtSubmission: 'gone',
    });
  });

  test('a date the season no longer runs on, or one already past: gone', () => {
    assert.equal(
      snapshotDeparture([october], 14, departureId(SEASON, '2026-11-02'), TODAY)?.statusAtSubmission,
      'gone'
    );
    assert.equal(
      snapshotDeparture([october], 14, departureId(SEASON, '2026-10-05'), '2026-10-06')
        ?.statusAtSubmission,
      'gone'
    );
  });

  test('a price edit after submission cannot reach the snapshot — it was copied', () => {
    const snapshot = snapshotDeparture([october], 14, departureId(SEASON, '2026-10-13'), TODAY);
    const repriced = { ...october, pricePerPerson: 1500 };

    // What the admin shows is read from the stored copy, not recomputed.
    const view = bookingDepartureView(
      {
        tripType: 'group',
        departureId: departureId(SEASON, '2026-10-13'),
        departureSnapshot: { ...snapshot!, startDate: new Date('2026-10-13'), endDate: new Date('2026-10-26') },
        trip: {
          durationDays: 14,
          departureSeasons: [{ ...repriced, _id: SEASON }],
        },
      },
      TODAY
    );

    assert.equal(view?.snapshot.pricePerPerson, 1245);
    // …while "now" reads the live season, and says the price moved.
    assert.deepEqual(view?.now, { state: 'bookable', check: 'available', pricePerPerson: 1500 });
  });
});

describe('departureNow — in the admin', () => {
  const trip = { durationDays: 14, seasons: [october] };

  test('available, full, closed', () => {
    assert.equal(departureNow(departureId(SEASON, '2026-10-13'), trip, TODAY).state, 'bookable');
    assert.deepEqual(departureNow(departureId(SEASON, '2026-10-26'), trip, TODAY), {
      state: 'unavailable',
      check: 'full',
      pricePerPerson: 1245,
    });
  });

  test('departed is not the same answer as gone', () => {
    assert.equal(departureNow(departureId(SEASON, '2026-10-13'), trip, '2026-10-14').state, 'departed');
    assert.equal(departureNow(departureId(SEASON, '2026-11-13'), trip, TODAY).state, 'gone');
  });

  test('a deleted trip', () => {
    assert.equal(departureNow(departureId(SEASON, '2026-10-13'), null, TODAY).state, 'trip-deleted');
  });
});

describe('reading a stored inquiry', () => {
  test('a private inquiry, or one from before part two, has no departure view', () => {
    assert.equal(bookingDepartureView({ tripType: 'private', departureId: null, departureSnapshot: null }, TODAY), null);
    // Keys absent entirely — a lean read skips defaults.
    assert.equal(bookingDepartureView({}, TODAY), null);
    assert.equal(storedSnapshot({}), null);
  });

  test('the range and length read as the rail writes them', () => {
    assert.equal(formatDepartureRange('2026-10-13', '2026-10-26'), 'Tue 13 Oct – Mon 26 Oct 2026');
    assert.equal(departureLengthDays('2026-10-13', '2026-10-26'), 14);
  });
});
