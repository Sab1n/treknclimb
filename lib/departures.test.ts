import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isIsoDate,
  toIsoDate,
  fromIsoDate,
  addDays,
  isoWeekday,
  nepalToday,
  runsOn,
  seasonDates,
  departureId,
  generateDepartures,
  departureOnDate,
  groupFromPrice,
  privateFromPrice,
  headlineFromPrice,
  exceptionProblems,
  seasonOverlaps,
  monthLabel,
  tripFromPrice,
  blackoutOn,
  currentBlackouts,
  type SeasonView,
} from './departures';

/**
 * Seasons → departures, and the prices the rail is built from. Pure, so no
 * database and no DOM.
 */

const TODAY = '2026-10-15';

function season(overrides: Partial<SeasonView> = {}): SeasonView {
  return {
    id: 'season-a',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    pattern: 'daily',
    weekdays: [],
    pricePerPerson: 1245,
    exceptions: [],
    ...overrides,
  };
}

describe('calendar dates', () => {
  test('a real calendar date is accepted and a rolled-over one is not', () => {
    assert.equal(isIsoDate('2026-10-12'), true);
    assert.equal(isIsoDate('2028-02-29'), true);
    assert.equal(isIsoDate('2026-02-31'), false);
    assert.equal(isIsoDate('2026-02-29'), false);
    assert.equal(isIsoDate('12/10/2026'), false);
  });

  test('a stored date round-trips to the same day, and days add across months', () => {
    assert.equal(toIsoDate(fromIsoDate('2026-10-12')), '2026-10-12');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  });

  test('weekdays are ISO: Monday is 1 and Sunday is 7', () => {
    assert.equal(isoWeekday('2026-10-12'), 1); // Monday
    assert.equal(isoWeekday('2026-10-18'), 7); // Sunday
  });

  test("today is Pokhara's date, not UTC's", () => {
    // 20:00 UTC on the 14th is 01:45 on the 15th in Nepal (UTC+05:45).
    assert.equal(nepalToday(new Date('2026-10-14T20:00:00Z')), '2026-10-15');
    assert.equal(nepalToday(new Date('2026-10-14T18:00:00Z')), '2026-10-14');
  });
});

describe('seasons generate dates', () => {
  test('a daily season departs every day, inclusive at both ends', () => {
    const dates = seasonDates(season());

    assert.equal(dates.length, 31);
    assert.equal(dates[0], '2026-10-01');
    assert.equal(dates[30], '2026-10-31');
  });

  test('a weekdays season departs only on its days', () => {
    // Mondays and Thursdays in October 2026.
    const dates = seasonDates(season({ pattern: 'weekdays', weekdays: [1, 4] }));

    assert.deepEqual(dates, [
      '2026-10-01', '2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15',
      '2026-10-19', '2026-10-22', '2026-10-26', '2026-10-29',
    ]);
    assert.equal(runsOn(season({ pattern: 'weekdays', weekdays: [1] }), '2026-10-13'), false);
  });

  test('a season from a date to the same date is a single departure', () => {
    assert.deepEqual(
      seasonDates(season({ startDate: '2026-11-09', endDate: '2026-11-09' })),
      ['2026-11-09']
    );
  });

  test('`from` skips the past without generating it', () => {
    assert.equal(seasonDates(season(), TODAY).length, 17); // 15th–31st
  });
});

describe('generated departures', () => {
  test('past dates are not generated; today is', () => {
    const departures = generateDepartures([season()], 14, TODAY);

    assert.equal(departures[0].date, TODAY);
    assert.equal(departures.length, 17);
  });

  test('identity is the season id plus the date, and ignores price', () => {
    const cheap = generateDepartures([season()], 14, TODAY);
    const dearer = generateDepartures([season({ pricePerPerson: 1400 })], 14, TODAY);

    assert.equal(cheap[0].id, departureId('season-a', TODAY));
    assert.equal(cheap[0].id, `season-a:${TODAY}`);
    // Editing the season's price does not change which departure this is.
    assert.equal(dearer[0].id, cheap[0].id);
  });

  test('each departure ends durationDays - 1 after it starts', () => {
    const [first] = generateDepartures([season()], 14, TODAY);

    assert.equal(first.endDate, '2026-10-28');
  });

  test('exceptions set status and price on their date only', () => {
    const departures = generateDepartures(
      [
        season({
          exceptions: [
            { date: '2026-10-20', status: 'full', pricePerPerson: null },
            { date: '2026-10-21', status: 'closed', pricePerPerson: null },
            { date: '2026-10-22', status: null, pricePerPerson: 1195 },
          ],
        }),
      ],
      14,
      TODAY
    );

    const on = (date: string) => departures.find((d) => d.date === date)!;

    assert.equal(on('2026-10-20').status, 'full');
    assert.equal(on('2026-10-21').status, 'closed');
    assert.equal(on('2026-10-22').status, 'available');
    assert.equal(on('2026-10-22').pricePerPerson, 1195);
    assert.equal(on('2026-10-23').pricePerPerson, 1245);
  });

  test('a season that has ended generates nothing', () => {
    assert.deepEqual(
      generateDepartures([season({ startDate: '2026-09-01', endDate: '2026-09-30' })], 14, TODAY),
      []
    );
  });

  test('on a date two seasons share, the cell shows the joinable, cheaper one', () => {
    const departures = generateDepartures(
      [
        season({ id: 'a', exceptions: [{ date: '2026-10-20', status: 'full', pricePerPerson: null }] }),
        season({ id: 'b', startDate: '2026-10-20', endDate: '2026-10-20', pricePerPerson: 1300 }),
      ],
      14,
      TODAY
    );

    assert.equal(departureOnDate(departures, '2026-10-20')!.id, 'b:2026-10-20');
  });
});

describe('prices', () => {
  const departures = generateDepartures(
    [
      season({
        exceptions: [
          // Cheapest of all, but full — not a price anyone can pay.
          { date: '2026-10-20', status: 'full', pricePerPerson: 900 },
          { date: '2026-10-25', status: null, pricePerPerson: 1195 },
        ],
      }),
      season({ id: 'nov', startDate: '2026-11-02', endDate: '2026-11-30', pricePerPerson: 1100 }),
    ],
    14,
    TODAY
  );

  test('the group price is the cheapest available departure', () => {
    assert.equal(groupFromPrice(departures), 1100);
  });

  test('restricted to a month, it is that month’s cheapest', () => {
    assert.equal(groupFromPrice(departures, '2026-10'), 1195);
    assert.equal(groupFromPrice(departures, '2026-12'), null);
  });

  test('the private price is the cheapest tier, or the flat price with none', () => {
    assert.equal(
      privateFromPrice({ price: 1295, groupPricing: [{ pricePerPerson: 1795 }, { pricePerPerson: 1295 }] }),
      1295
    );
    assert.equal(privateFromPrice({ price: 1400, groupPricing: [] }), 1400);
  });

  test('the headline is the lower of the two paths', () => {
    assert.equal(headlineFromPrice(1245, 1295), 1245);
    assert.equal(headlineFromPrice(1495, 1295), 1295);
    assert.equal(headlineFromPrice(null, 1295), 1295);
  });
});

describe('exception rules (shared by the model, Zod and the editor)', () => {
  const mondays = { startDate: '2026-10-01', endDate: '2026-10-31', pattern: 'weekdays' as const, weekdays: [1] };

  test('an exception must fall on a date the season departs', () => {
    const problems = exceptionProblems(mondays, [
      { date: '2026-10-12', status: 'full', pricePerPerson: null }, // a Monday
      { date: '2026-10-13', status: 'full', pricePerPerson: null }, // a Tuesday
      { date: '2026-11-02', status: 'full', pricePerPerson: null }, // outside
    ]);

    assert.equal(problems.has(0), false);
    assert.match(problems.get(1)!, /not a departure/);
    assert.match(problems.get(2)!, /not a departure/);
  });

  test('an exception must do something, and a date may appear once', () => {
    const problems = exceptionProblems(mondays, [
      { date: '2026-10-12', status: null, pricePerPerson: null },
      { date: '2026-10-19', status: 'closed', pricePerPerson: null },
      { date: '2026-10-19', status: 'full', pricePerPerson: null },
    ]);

    assert.match(problems.get(0)!, /full or closed, or give it its own price/);
    assert.equal(problems.has(1), false);
    assert.match(problems.get(2)!, /already has an exception/);
  });
});

describe('blackouts', () => {
  test('a blackout covers both of its end days', () => {
    const periods = [{ start: '2026-12-20', end: '2026-12-24' }];

    assert.equal(blackoutOn('2026-12-19', periods), null);
    assert.ok(blackoutOn('2026-12-20', periods));
    assert.ok(blackoutOn('2026-12-24', periods));
    assert.equal(blackoutOn('2026-12-25', periods), null);
  });

  test('finished blackout periods are not sent to the page', () => {
    assert.deepEqual(
      currentBlackouts(
        [{ end: '2026-09-05' }, { end: TODAY }, { end: '2026-12-24' }],
        TODAY
      ).map((p) => p.end),
      [TODAY, '2026-12-24']
    );
  });
});

describe('seasonOverlaps', () => {
  const october = { startDate: '2026-10-01', endDate: '2026-10-31', pattern: 'daily' as const, weekdays: [] };

  test('two seasons sharing a departure date clash, reported on the later one', () => {
    const problems = seasonOverlaps([
      october,
      { startDate: '2026-10-31', endDate: '2026-11-30', pattern: 'daily', weekdays: [] },
    ]);

    assert.deepEqual([...problems.keys()], [1]);
    assert.match(problems.get(1)!, /both depart on 31 Oct 2026/);
  });

  test('back-to-back seasons do not', () => {
    assert.equal(
      seasonOverlaps([october, { startDate: '2026-11-01', endDate: '2026-11-30', pattern: 'daily', weekdays: [] }]).size,
      0
    );
  });

  test('same range, different weekdays, never the same date — allowed', () => {
    const mondays = { startDate: '2026-10-01', endDate: '2026-12-31', pattern: 'weekdays' as const, weekdays: [1] };
    const thursdays = { ...mondays, weekdays: [4] };

    assert.equal(seasonOverlaps([mondays, thursdays]).size, 0);
    assert.equal(seasonOverlaps([mondays, { ...mondays, weekdays: [1, 4] }]).size, 1);
  });

  test('a single departure inside a daily season clashes', () => {
    assert.equal(
      seasonOverlaps([october, { startDate: '2026-10-13', endDate: '2026-10-13', pattern: 'daily', weekdays: [] }]).size,
      1
    );
  });

  test('an incomplete season is not an overlap yet', () => {
    assert.equal(seasonOverlaps([october, { startDate: '2026-10-05', endDate: '', pattern: 'daily', weekdays: [] }]).size, 0);
  });
});

describe('tripFromPrice — the one "from" price', () => {
  const TODAY = '2026-09-25';

  /* Stored shape: Dates, as a lean read hands them over. */
  const october = {
    _id: '65f0c0ffee0000000000abcd',
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2026-10-31T00:00:00.000Z'),
    pattern: 'daily' as const,
    weekdays: [],
    pricePerPerson: 1245,
    exceptions: [],
  };

  const trip = {
    price: 1295,
    durationDays: 14,
    groupPricing: [{ pricePerPerson: 1295 }, { pricePerPerson: 1395 }],
    departureSeasons: [october],
  };

  test('a cheaper departure beats the cheapest private tier', () => {
    assert.equal(tripFromPrice(trip, TODAY), 1245);
  });

  test('with no departures at all it is the cheapest tier', () => {
    assert.equal(tripFromPrice({ ...trip, departureSeasons: [] }, TODAY), 1295);
  });

  test('with no tiers either, the flat price', () => {
    assert.equal(
      tripFromPrice({ ...trip, departureSeasons: [], groupPricing: [] }, TODAY),
      1295
    );
  });

  test('a departure nobody can join does not set the price', () => {
    const allFull = {
      ...october,
      exceptions: seasonDates({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        pattern: 'daily',
        weekdays: [],
      }).map((date) => ({ date: new Date(`${date}T00:00:00.000Z`), status: 'full' as const, pricePerPerson: null })),
    };

    assert.equal(tripFromPrice({ ...trip, departureSeasons: [allFull] }, TODAY), 1295);
  });

  test('a season that has finished does not set it either', () => {
    assert.equal(tripFromPrice(trip, '2026-12-01'), 1295);
  });

  test('a missing departureSeasons key — a lean read of an old trip — is safe', () => {
    assert.equal(tripFromPrice({ price: 900, durationDays: 7 }, TODAY), 900);
  });
});

describe('monthLabel — the line above the calendar', () => {
  test('names the month, and drops the year when it is this one', () => {
    assert.equal(monthLabel('2026-09', '2026-09-26'), 'September');
    assert.equal(monthLabel('2026-12', '2026-09-26'), 'December');
  });

  test('keeps the year once the calendar has paged into the next one', () => {
    assert.equal(monthLabel('2027-03', '2026-09-26'), 'March 2027');
  });

});
