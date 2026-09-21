import test from 'node:test';
import assert from 'node:assert/strict';

import { hasMojibake, hasMojibakeGuard } from './noMojibake';

import Destination from '../Destination';
import Activity from '../Activity';
import Trip from '../Trip';
import BlogPost from '../BlogPost';
import BlogCategory from '../BlogCategory';
import Faq from '../Faq';
import Testimonial from '../Testimonial';
import TeamMember from '../TeamMember';
import SiteSettings from '../SiteSettings';
import Affiliation from '../Affiliation';
import ExchangeRate from '../ExchangeRate';
import Redirect from '../Redirect';

import BookingRequest from '../BookingRequest';
import RejectedSubmission from '../RejectedSubmission';
import NotFoundLog from '../NotFoundLog';

/**
 * No database. Path validators run against an in-memory document, which is
 * all this needs — and it means the guard is verified on every `npm test`
 * rather than only when someone remembers to point a script at Atlas.
 *
 * Every U+FFFD in this file is written as a `\uFFFD` escape rather than as
 * the character itself. A raw replacement character in the source of the test
 * that forbids raw replacement characters is confusing to read, and it is one
 * careless re-encoding away from silently becoming something else — which is
 * the exact failure this whole guard exists for.
 */

/**
 * `validate()` rather than `validateSync()` — the sync form is deprecated in
 * Mongoose 9 and goes away in 10. It rejects rather than returning, so the
 * error is caught and handed back.
 */
async function validationError(doc: {
  validate: () => Promise<void>;
}): Promise<{ errors: Record<string, { message: string }> } | null> {
  try {
    await doc.validate();
    return null;
  } catch (error) {
    return error as { errors: Record<string, { message: string }> };
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const GUARDED: [string, any][] = [
  ['Destination', Destination],
  ['Activity', Activity],
  ['Trip', Trip],
  ['BlogPost', BlogPost],
  ['BlogCategory', BlogCategory],
  ['Faq', Faq],
  ['Testimonial', Testimonial],
  ['TeamMember', TeamMember],
  ['SiteSettings', SiteSettings],
  ['Affiliation', Affiliation],
  ['ExchangeRate', ExchangeRate],
  ['Redirect', Redirect],
];

/**
 * Deliberately unguarded — these record what arrives from outside, where
 * losing the record is worse than storing a damaged character. A spammer must
 * not be able to make `logRejection` throw by sending U+FFFD, and a real
 * inquiry must not be refused over a stray character in the message field.
 */
const UNGUARDED: [string, any][] = [
  ['BookingRequest', BookingRequest],
  ['RejectedSubmission', RejectedSubmission],
  ['NotFoundLog', NotFoundLog],
];
/* eslint-enable @typescript-eslint/no-explicit-any */

test('hasMojibake detects the replacement character and nothing else', () => {
  assert.equal(hasMojibake('world\uFFFDs'), true);
  assert.equal(hasMojibake('world’s — Mar–May'), false);
  assert.equal(hasMojibake('plain ascii'), false);
  assert.equal(hasMojibake(undefined), false);
  assert.equal(hasMojibake(42), false);
});

test('every authored-content model carries the guard on every string path', () => {
  for (const [name, model] of GUARDED) {
    assert.equal(
      hasMojibakeGuard(model.schema),
      true,
      `${name} is missing the U+FFFD guard on at least one string path — add ` +
        `\`${name}Schema.plugin(noMojibakePlugin)\` in models/${name}.ts`
    );
  }
});

test('the inbound-traffic models are deliberately not guarded', () => {
  for (const [name, model] of UNGUARDED) {
    assert.equal(
      hasMojibakeGuard(model.schema),
      false,
      `${name} has acquired the U+FFFD guard. That makes a write from the ` +
        `outside world able to fail, and these exist to never lose a record. ` +
        `If this is intentional, move it to GUARDED and say why.`
    );
  }
});

test('a corrupt top-level field fails validation, keyed to its path', async () => {
  const destination = new Destination({
    name: 'Nepal',
    slug: 'nepal',
    description: 'Home of eight of the world\uFFFDs fourteen peaks.',
    coverImage: 'treknclimb/destinations/nepal',
    coverImageAlt: 'The Annapurna range at dawn',
    hasActivities: true,
  });

  const error = await validationError(destination);

  assert.ok(error, 'expected a ValidationError');
  assert.ok(
    error!.errors.description,
    'the error must be keyed to `description` so the admin editor can render ' +
      'it against the right input'
  );
  assert.match(String(error!.errors.description.message), /U\+FFFD/);
});

test('the same text with correct punctuation passes', async () => {
  const destination = new Destination({
    name: 'Nepal',
    slug: 'nepal',
    description: 'Home of eight of the world’s fourteen peaks — all of them.',
    coverImage: 'treknclimb/destinations/nepal',
    coverImageAlt: 'The Annapurna range at dawn',
    hasActivities: true,
  });

  const error = await validationError(destination);

  assert.equal(error, null);
});

test('the guard reaches into embedded subdocuments', async () => {
  /*
   * The point of the recursion into `childSchemas`. Most of a Trip's prose
   * lives in its itinerary days, and a top-level-only guard would have missed
   * every word of it.
   */
  const trip = new Trip({
    title: 'Druk Path Trek',
    slug: 'druk-path-trek',
    status: 'draft',
    itinerary: [
      {
        day: 1,
        title: 'Paro to Jele Dzong',
        description: 'A steep climb out of the valley \uFFFD around 3,300 m.',
      },
    ],
  });

  const error = await validationError(trip);

  assert.ok(error, 'expected a ValidationError');

  const key = Object.keys(error!.errors).find((k) =>
    k.includes('itinerary') && k.includes('description')
  );

  assert.ok(
    key,
    `expected an error on an itinerary description, got: ${Object.keys(error!.errors).join(', ')}`
  );
  assert.match(String(error!.errors[key!].message), /U\+FFFD/);
});
