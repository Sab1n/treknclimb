import test from 'node:test';
import assert from 'node:assert/strict';

import BookingRequest from './BookingRequest';

/**
 * The departure fields, enforced by the **model** with Zod bypassed — the
 * guarantee a script writing through Mongoose cannot walk past. No database:
 * `validate()` runs in memory, and the query hook throws before any query is
 * sent.
 */

const ID = '65f0c0ffee0000000000abcd:2026-10-13';

function inquiry(fields: Record<string, unknown>) {
  return new BookingRequest({
    reference: 'TNC-2026-9999',
    name: 'Test',
    email: 'test@example.com',
    nationality: 'United Kingdom',
    travellers: 2,
    consentedAt: new Date(),
    ...fields,
  });
}

const snapshot = {
  startDate: new Date('2026-10-13T00:00:00.000Z'),
  endDate: new Date('2026-10-26T00:00:00.000Z'),
  pricePerPerson: 1245,
  statusAtSubmission: 'available',
};

async function errorKeys(doc: { validate: () => Promise<void> }): Promise<string[]> {
  try {
    await doc.validate();
    return [];
  } catch (error) {
    return Object.keys((error as { errors: Record<string, unknown> }).errors);
  }
}

test('a group inquiry with its departure and snapshot is valid', async () => {
  assert.deepEqual(
    await errorKeys(inquiry({ tripType: 'group', departureId: ID, departureSnapshot: snapshot })),
    []
  );
});

test('the three fields default to null — the key is always present', () => {
  const doc = inquiry({});

  assert.equal(doc.tripType, null);
  assert.equal(doc.departureId, null);
  assert.equal(doc.departureSnapshot, null);
});

test('a departure on a private inquiry is refused', async () => {
  assert.ok(
    (await errorKeys(inquiry({ tripType: 'private', departureId: ID, departureSnapshot: snapshot }))).includes(
      'departureId'
    )
  );
});

test('an id without its snapshot, or a snapshot without its id, is refused', async () => {
  assert.ok((await errorKeys(inquiry({ tripType: 'group', departureId: ID }))).includes('departureSnapshot'));
  assert.ok(
    (await errorKeys(inquiry({ tripType: 'group', departureSnapshot: snapshot }))).includes('departureSnapshot')
  );
});

test('a malformed id and an unknown trip type are refused', async () => {
  assert.ok((await errorKeys(inquiry({ tripType: 'group', departureId: 'nope', departureSnapshot: snapshot }))).includes('departureId'));
  assert.ok((await errorKeys(inquiry({ tripType: 'guaranteed' }))).includes('tripType'));
});

test('a query update touching the submission record is refused before it is sent', async () => {
  await assert.rejects(
    BookingRequest.updateOne({ reference: 'TNC-2026-9999' }, { $set: { 'departureSnapshot.pricePerPerson': 1 } }),
    /record what was submitted/
  );
});
