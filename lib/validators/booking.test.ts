import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  bookingFormSchema,
  bookingSubmissionSchema,
} from './booking';

/**
 * Tests for the booking inquiry schema.
 *
 *   npm test
 *
 * Node's built-in test runner, run through `tsx`. No Jest, no Vitest, no
 * config file — the project had no test setup and this needs one module and no
 * framework.
 *
 * ## What these are actually protecting
 *
 * A shipped bug rejected **every inquiry that left the preferred date blank**,
 * on the site's only conversion event. The endpoint had been tested and passed,
 * because the test payloads omitted the optional keys:
 *
 *     { name: 'X', email: 'x@y.z', travellers: 2 }          // omitted — passed
 *     { name: 'X', email: 'x@y.z', travellers: 2,
 *       phone: '', tripSlug: '', preferredDate: '',
 *       message: '' }                                        // '' — rejected
 *
 * A browser never sends the first shape. An untouched input submits as an
 * empty string, and React Hook Form's `defaultValues` are `''` for the same
 * reason. So `browserPayload()` below is the fixture everything uses: **every
 * key present, blanks as empty strings**, exactly what the form posts. Anything
 * added to the form goes in there too, or the next version of this bug ships
 * the same way.
 */

/** A date far enough ahead that the fixture never expires. */
function futureDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function pastDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The exact object `BookingForm` posts, with every optional field left blank.
 *
 * `overrides` fills in or replaces individual fields. Note that it spreads
 * *after* the blanks, so a test that passes `{ phone: '+977 1 234567' }` gets
 * the blank shape everywhere else — which is how a real half-filled form
 * arrives.
 */
function browserPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Hannah Whitfield',
    email: 'hannah@example.com',
    phone: '',
    nationality: 'United Kingdom',
    tripSlug: '',
    // Both present and blank, as the browser sends them: the radio group
    // untouched and the departure picker's hidden input empty.
    tripType: '',
    departureId: '',
    preferredDate: '',
    travellers: 2,
    message: '',
    preferredChannel: 'email',
    consent: true,
    ...overrides,
  };
}

/** The same, plus the three hidden anti-spam fields the endpoint receives. */
function browserSubmission(overrides: Record<string, unknown> = {}) {
  return {
    ...browserPayload(),
    company: '',
    renderedAt: Date.now() - 20_000,
    ...overrides,
  };
}

describe('blank optional fields — the shape a real browser sends', () => {
  test('a form with every optional field left blank is accepted', () => {
    const result = bookingFormSchema.safeParse(browserPayload());

    assert.equal(
      result.success,
      true,
      `blank optionals were rejected: ${JSON.stringify(
        result.success ? null : result.error.issues,
        null,
        2
      )}`
    );
  });

  test("blank optional strings normalise to undefined, not ''", () => {
    const result = bookingFormSchema.parse(browserPayload());

    // The distinction matters downstream: the route handler writes these
    // straight onto the document, and Mongoose stores '' as a real value.
    assert.equal(result.phone, undefined);
    assert.equal(result.tripSlug, undefined);
    assert.equal(result.preferredDate, undefined);
    assert.equal(result.message, undefined);
  });

  test('each optional field is accepted blank on its own', () => {
    for (const field of ['phone', 'tripSlug', 'preferredDate', 'message']) {
      const result = bookingFormSchema.safeParse(
        browserPayload({
          // Everything else filled in, so a failure can only be this field.
          phone: '+44 7700 900000',
          tripSlug: 'everest-base-camp-trek',
          // Naming a trip requires a choice; see "the trip choice" below.
          tripType: 'private',
          preferredDate: futureDate(),
          message: 'We have two weeks in October.',
          [field]: '',
        })
      );

      assert.equal(result.success, true, `blank ${field} was rejected`);
    }
  });

  test('omitting the optional keys entirely is also accepted', () => {
    // The old tests only covered this shape, which is why the bug got through.
    // It still has to work — a direct API caller may well omit them — but it is
    // no longer the only thing covered.
    const result = bookingFormSchema.safeParse({
      name: 'Hannah Whitfield',
      email: 'hannah@example.com',
      nationality: 'United Kingdom',
      travellers: 2,
      preferredChannel: 'email',
      consent: true,
    });

    assert.equal(result.success, true);
  });

  test('the full endpoint payload with blank optionals is accepted', () => {
    const result = bookingSubmissionSchema.safeParse(browserSubmission());

    assert.equal(
      result.success,
      true,
      `blank optionals were rejected by the submission schema: ${JSON.stringify(
        result.success ? null : result.error.issues
      )}`
    );
  });
});

describe('filled optional fields still work', () => {
  test('values survive when they are actually supplied', () => {
    const date = futureDate();

    const result = bookingFormSchema.parse(
      browserPayload({
        phone: '  +44 7700 900000  ',
        tripSlug: 'everest-base-camp-trek',
        tripType: 'private',
        preferredDate: date,
        message: 'Two of us, both have trekked before.',
      })
    );

    assert.equal(result.phone, '+44 7700 900000'); // trimmed
    assert.equal(result.tripSlug, 'everest-base-camp-trek');
    assert.equal(result.preferredDate, date);
    assert.equal(result.message, 'Two of us, both have trekked before.');
  });

  test('a date in the past is still rejected', () => {
    const result = bookingFormSchema.safeParse(
      browserPayload({ preferredDate: pastDate() })
    );

    assert.equal(result.success, false);
    assert.equal(
      result.success ? null : result.error.issues[0].path[0],
      'preferredDate'
    );
  });

  test('an unparseable date is rejected rather than silently dropped', () => {
    const result = bookingFormSchema.safeParse(
      browserPayload({ preferredDate: 'next spring' })
    );

    assert.equal(result.success, false);
  });
});

describe('nationality', () => {
  test('is required', () => {
    const result = bookingFormSchema.safeParse(
      browserPayload({ nationality: '' })
    );

    assert.equal(result.success, false);
    assert.equal(
      result.success ? null : result.error.issues[0].path[0],
      'nationality'
    );
  });

  test('rejects a value that is not on the list', () => {
    // The select constrains this in the browser; the endpoint does not have a
    // select in front of it.
    const result = bookingFormSchema.safeParse(
      browserPayload({ nationality: 'Wakanda' })
    );

    assert.equal(result.success, false);
  });

  test('rejects a country code — the stored value is the name', () => {
    const result = bookingFormSchema.safeParse(
      browserPayload({ nationality: 'GB' })
    );

    assert.equal(result.success, false);
  });

  test('accepts a name from the list', () => {
    const result = bookingFormSchema.safeParse(
      browserPayload({ nationality: 'Nepal' })
    );

    assert.equal(result.success, true);
  });
});

describe('consent', () => {
  test('an unticked box is rejected', () => {
    // false is what an unticked checkbox actually sends — not undefined.
    const result = bookingFormSchema.safeParse(
      browserPayload({ consent: false })
    );

    assert.equal(result.success, false);
    assert.equal(
      result.success ? null : result.error.issues[0].path[0],
      'consent'
    );
  });

  test('a missing consent field is rejected', () => {
    const payload = browserPayload();
    delete (payload as Record<string, unknown>).consent;

    assert.equal(bookingFormSchema.safeParse(payload).success, false);
  });

  test('the string "false" is not accepted as consent', () => {
    const result = bookingFormSchema.safeParse(
      browserPayload({ consent: 'false' })
    );

    assert.equal(result.success, false);
  });

  test('the endpoint enforces it too, not just the form', () => {
    const result = bookingSubmissionSchema.safeParse(
      browserSubmission({ consent: false })
    );

    assert.equal(result.success, false);
  });
});

describe('required fields', () => {
  test('name and email are still required', () => {
    for (const field of ['name', 'email']) {
      const result = bookingFormSchema.safeParse(
        browserPayload({ [field]: '' })
      );

      assert.equal(result.success, false, `blank ${field} was accepted`);
    }
  });

  test('travellers arrives as a string from a number input and is coerced', () => {
    const result = bookingFormSchema.parse(browserPayload({ travellers: '3' }));

    assert.equal(result.travellers, 3);
  });

  test('zero travellers is rejected', () => {
    assert.equal(
      bookingFormSchema.safeParse(browserPayload({ travellers: 0 })).success,
      false
    );
  });
});

describe('the trip choice — group or private', () => {
  const DEPARTURE = '65f0c0ffee0000000000abcd:2026-10-13';

  test('a general inquiry needs no choice, and the blanks normalise away', () => {
    const result = bookingFormSchema.parse(browserPayload());

    assert.equal(result.tripType, undefined);
    assert.equal(result.departureId, undefined);
  });

  test('naming a trip without choosing is rejected, keyed to tripType', () => {
    const result = bookingFormSchema.safeParse(
      browserPayload({ tripSlug: 'everest-base-camp-trek' })
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.success ? null : result.error.issues[0].path, ['tripType']);
  });

  test('a group inquiry without a departure is rejected, keyed to departureId', () => {
    const result = bookingFormSchema.safeParse(
      browserPayload({ tripSlug: 'everest-base-camp-trek', tripType: 'group' })
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.success ? null : result.error.issues[0].path, ['departureId']);
  });

  test('a group inquiry with a departure is accepted', () => {
    const result = bookingFormSchema.parse(
      browserPayload({ tripSlug: 'everest-base-camp-trek', tripType: 'group', departureId: DEPARTURE })
    );

    assert.equal(result.tripType, 'group');
    assert.equal(result.departureId, DEPARTURE);
  });

  test('a private inquiry needs no date', () => {
    assert.equal(
      bookingFormSchema.safeParse(
        browserPayload({ tripSlug: 'everest-base-camp-trek', tripType: 'private' })
      ).success,
      true
    );
  });

  test('a malformed departure id is rejected — including an impossible date', () => {
    for (const departureId of ['nope', '65f0c0ffee0000000000abcd:2026-02-31', '65f0:2026-10-13']) {
      const result = bookingFormSchema.safeParse(
        browserPayload({ tripSlug: 'everest-base-camp-trek', tripType: 'group', departureId })
      );

      assert.equal(result.success, false, departureId);
    }
  });

  test('an unknown trip type is rejected', () => {
    assert.equal(
      bookingFormSchema.safeParse(
        browserPayload({ tripSlug: 'everest-base-camp-trek', tripType: 'guaranteed' })
      ).success,
      false
    );
  });

  test('the endpoint schema applies the same rule', () => {
    assert.equal(
      bookingSubmissionSchema.safeParse(
        browserSubmission({ tripSlug: 'everest-base-camp-trek' })
      ).success,
      false
    );
  });
});
