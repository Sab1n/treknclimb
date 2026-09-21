import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { installJsdom } from '../testing/jsdom';
import type { CalendarProps } from './Calendar';

/**
 * The shared calendar, in both of the modes it is built for: marked departure
 * dates (the trip page rail) and a highlighted range (the admin inquiries
 * filter, which is intended to use it and is not wired yet).
 *
 * Mounted for real — jsdom, a React root, `act()` — because what matters is
 * what a person can and cannot press, and what a screen reader is told.
 */

let restore: (() => void) | undefined;

before(() => {
  restore = installJsdom();
});

after(() => restore?.());

const TODAY = '2026-10-05';

async function mount(props: Partial<CalendarProps>) {
  const { createElement, act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const Calendar = (await import('./Calendar')).default;

  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(Calendar, { label: 'Test calendar', today: TODAY, ...props })
    );
  });

  const day = (date: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-date="${date}"]`);

    assert.ok(button, `no cell rendered for ${date}`);

    return button;
  };

  return {
    day,
    container,
    act,
    unmount: () => act(async () => root.unmount()),
  };
}

const DEPARTURE_MARKS: CalendarProps['marks'] = {
  '2026-10-12': { tone: 'available', description: 'Available' },
  '2026-10-26': { tone: 'unavailable', note: 'Full', description: 'Full' },
  // Marked available but already past — what a stale cached page would send.
  '2026-10-01': { tone: 'available', note: 'Avail', description: 'Available' },
};

describe('departure dates', () => {
  test('an available date shows its state, no price, and can be chosen', async () => {
    const chosen: string[] = [];
    const { day, unmount, act } = await mount({
      marks: DEPARTURE_MARKS,
      onSelect: (date) => chosen.push(date),
    });

    const cell = day('2026-10-12');

    // State only. The rail shows the price once, for the date being chosen.
    assert.equal(cell.textContent, '12');
    assert.doesNotMatch(cell.getAttribute('aria-label') ?? '', /\$/);
    assert.match(cell.getAttribute('aria-label') ?? '', /12 October 2026, Available/);
    assert.equal(cell.getAttribute('aria-disabled'), null);

    await act(async () => cell.click());

    assert.deepEqual(chosen, ['2026-10-12']);
    await unmount();
  });

  test('a full date is shown as full, announced, and cannot be chosen', async () => {
    const chosen: string[] = [];
    const { day, unmount, act } = await mount({
      marks: DEPARTURE_MARKS,
      onSelect: (date) => chosen.push(date),
    });

    const cell = day('2026-10-26');

    assert.match(cell.textContent ?? '', /Full/);
    assert.match(cell.getAttribute('aria-label') ?? '', /Full/);
    // Disabled for choosing, still focusable and read out — not `disabled`.
    assert.equal(cell.getAttribute('aria-disabled'), 'true');
    assert.equal(cell.disabled, false);

    await act(async () => cell.click());

    assert.deepEqual(chosen, []);
    await unmount();
  });

  test('a past date is inert even when marked available', async () => {
    const chosen: string[] = [];
    const { day, unmount, act } = await mount({
      marks: DEPARTURE_MARKS,
      onSelect: (date) => chosen.push(date),
    });

    const cell = day('2026-10-01');

    assert.equal(cell.getAttribute('aria-disabled'), 'true');
    assert.match(cell.getAttribute('aria-label') ?? '', /past/);
    // A past day shows no note at all — past is its only state.
    assert.equal(cell.textContent, '1');

    await act(async () => cell.click());

    assert.deepEqual(chosen, []);
    await unmount();
  });

  test('an unmarked day does nothing on a departure calendar', async () => {
    const chosen: string[] = [];
    const { day, unmount, act } = await mount({
      marks: DEPARTURE_MARKS,
      onSelect: (date) => chosen.push(date),
    });

    const cell = day('2026-10-13');

    assert.equal(cell.getAttribute('aria-disabled'), 'true');
    await act(async () => cell.click());
    assert.deepEqual(chosen, []);
    await unmount();
  });
});

describe('selection and paging', () => {
  test('the selected date is pressed and no other is', async () => {
    const { day, unmount } = await mount({ marks: DEPARTURE_MARKS, selected: '2026-10-12' });

    assert.equal(day('2026-10-12').getAttribute('aria-pressed'), 'true');
    assert.match(day('2026-10-12').getAttribute('aria-label') ?? '', /selected/);
    await unmount();
  });

  test('paging reports the new month; mounting does not', async () => {
    const months: string[] = [];
    const { container, unmount, act } = await mount({
      marks: DEPARTURE_MARKS,
      onMonthChange: (month) => months.push(month),
    });

    assert.deepEqual(months, []);

    const next = container.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!;

    await act(async () => next.click());

    assert.deepEqual(months, ['2026-11']);
    await unmount();
  });
});

describe('range (the admin filter mode)', () => {
  test('endpoints are selected, the interior is in range, outside is neither', async () => {
    const { day, unmount } = await mount({
      unmarkedDays: 'selectable',
      allowPast: true,
      initialDate: '2026-09-10',
      range: { from: '2026-09-08', to: '2026-09-12' },
    });

    for (const endpoint of ['2026-09-08', '2026-09-12']) {
      assert.equal(day(endpoint).getAttribute('aria-pressed'), 'true');
      assert.match(day(endpoint).getAttribute('aria-label') ?? '', /selected/);
    }

    assert.match(day('2026-09-10').getAttribute('aria-label') ?? '', /in selected range/);
    assert.equal(day('2026-09-10').getAttribute('aria-pressed'), 'false');

    assert.doesNotMatch(day('2026-09-13').getAttribute('aria-label') ?? '', /selected/);

    // Past days are choosable in this mode — inquiries are all in the past.
    assert.equal(day('2026-09-01').getAttribute('aria-disabled'), null);
    // …and not greyed or announced as past: in this mode every day is.
    assert.doesNotMatch(day('2026-09-01').getAttribute('aria-label') ?? '', /past/);
    assert.doesNotMatch(day('2026-09-01').className, /text-muted/);
    await unmount();
  });
});

describe('keyboard', () => {
  test('one Tab stop, arrows move by day and week, Page Down turns the month', async () => {
    const { day, container, unmount, act } = await mount({
      unmarkedDays: 'selectable',
      initialDate: '2026-10-31',
    });

    const tabbable = container.querySelectorAll('[data-date][tabindex="0"]');

    assert.equal(tabbable.length, 1, 'the grid should be a single Tab stop');
    assert.equal((tabbable[0] as HTMLElement).dataset.date, '2026-10-31');

    const press = (target: HTMLElement, key: string) =>
      act(async () => {
        target.focus();
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });

    // Page Down from 31 October clamps to 30 November, not 1 December.
    await press(day('2026-10-31'), 'PageDown');
    assert.equal((document.activeElement as HTMLElement).dataset.date, '2026-11-30');

    // Moving off the end of the month turns the page.
    await press(day('2026-11-30'), 'ArrowRight');
    assert.equal((document.activeElement as HTMLElement).dataset.date, '2026-12-01');

    await press(day('2026-12-01'), 'ArrowUp');
    assert.equal((document.activeElement as HTMLElement).dataset.date, '2026-11-24');

    await unmount();
  });
});
