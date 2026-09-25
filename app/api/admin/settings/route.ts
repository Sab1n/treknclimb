import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import SiteSettings from '../../../../models/SiteSettings';
import Affiliation from '../../../../models/Affiliation';
import { adminSettingsSchema } from '../../../../lib/validators/adminSettings';
import { revalidateSettings } from '../../../../lib/revalidation';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/settings — the only verb this resource has.
 *
 * ## No POST, no DELETE, and no `[id]` folder
 *
 * `SiteSettings` is a singleton: `key: 'site'`, held down on the model by
 * `unique` + `immutable` + a one-value `enum`. There is one document, it is
 * created by the seed, and it cannot be duplicated or renamed away. So there is
 * nothing to create and nothing to delete, and the routes for both are **absent
 * rather than present-and-refusing** — the same rule the Destinations editor
 * follows. A route that exists only to return 405 invites someone to work out
 * why, and reads as an unfinished feature rather than a deliberate one.
 *
 * In Express this would be `router.patch('/settings', ...)` with no other verb
 * registered. Here the file *is* the route and the exported function name is
 * the method, so "no POST" is expressed by not writing one.
 *
 * ## Why the purge list is computed from a diff
 *
 * Only five public pages read settings at all, and each reads a different
 * subset. Purging all five on every save would work, but the returned list is
 * what tells the admin what just happened — and a list that is always identical
 * says nothing. `settingsPaths` maps changed field names to pages; the diff
 * below is what feeds it.
 */

/** Fields whose stored value is compared directly to decide what changed. */
type Scalar = string | number | undefined;

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an auth challenge confirms the endpoint exists.
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  /*
   * SameSite=Lax already blocks a cross-site form post; this covers what it
   * does not, since Lax is a same-*site* rather than same-origin policy.
   */
  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const parsed = adminSettingsSchema.safeParse(body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      /*
       * `issue.path` for a row inside a repeatable block is
       * `['commitments', 2, 'title']`, which joins to `commitments.2.title` —
       * the key the editor uses to put the message under the right input of
       * the right row.
       */
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }

    return NextResponse.json(
      { error: 'Some fields need checking.', fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  await connectDB();

  /*
   * `findOne` → assign → `save()`, per CLAUDE.md, and here for an extra reason:
   * `findOneAndUpdate` with an `$set` of the whole object would wipe any field
   * this form does not send. It sends all of them today; it will not the first
   * time a field is added to the model and forgotten here.
   */
  const settings = await SiteSettings.findOne({ key: 'site' });

  if (!settings) {
    /*
     * The seed has never run. A 404 rather than creating one on the fly: the
     * singleton is seeded deliberately and conjuring a second path to create it
     * is how two of them eventually exist.
     */
    return NextResponse.json(
      {
        error:
          'No settings record exists. Run scripts/seed.ts to create it before editing.',
      },
      { status: 404 }
    );
  }

  // --- what changed, before anything is assigned ---

  const changed = new Set<string>();

  function setScalar(field: keyof typeof data, value: Scalar) {
    const current = (settings as unknown as Record<string, Scalar>)[field];

    // `?? ''` so `undefined` and a missing key compare equal rather than
    // registering as a change on every save of an untouched optional field.
    if ((current ?? '') !== (value ?? '')) changed.add(field as string);

    (settings as unknown as Record<string, Scalar>)[field] = value;
  }

  setScalar('legalName', data.legalName);
  setScalar('tradingName', data.tradingName);
  setScalar('foundingYear', data.foundingYear);
  setScalar('registrationNumber', data.registrationNumber);
  setScalar('streetAddress', data.streetAddress);
  setScalar('addressLocality', data.addressLocality);
  setScalar('addressRegion', data.addressRegion);
  setScalar('postalCode', data.postalCode);
  setScalar('addressCountry', data.addressCountry);
  setScalar('phone', data.phone);
  setScalar('email', data.email);
  setScalar('whatsappNumber', data.whatsappNumber);

  setScalar('shortDescription', data.shortDescription);
  setScalar('longDescription', data.longDescription);

  setScalar('heroHeadline', data.heroHeadline);
  setScalar('heroSubheading', data.heroSubheading);
  setScalar('heroCtaLabel', data.heroCtaLabel);
  setScalar('riskReversalText', data.riskReversalText);
  setScalar('officeHours', data.officeHours);

  setScalar('contactPersonName', data.contactPersonName);
  setScalar('contactPersonRole', data.contactPersonRole);
  setScalar('responseTimePromise', data.responseTimePromise);

  setScalar('depositPolicyText', data.depositPolicyText);
  setScalar('cancellationPolicyText', data.cancellationPolicyText);

  /*
   * Repeatable blocks are compared as JSON rather than field by field. A
   * reorder is a change — it decides what a visitor reads first — so comparing
   * the serialised array is exactly right, and comparing lengths alone would
   * miss both a reorder and an edit in place.
   *
   * `displayOrder` is assigned from the index here and never accepted from the
   * client, so the stored order cannot disagree with the order just dragged.
   */
  function setBlock<T extends object>(
    field: string,
    rows: T[],
    current: unknown[]
  ) {
    const next = rows.map((row, index) => ({ ...row, displayOrder: index }));

    const before = JSON.stringify(
      (current ?? []).map((row) => {
        const { _id, ...rest } = row as Record<string, unknown>;
        void _id;
        return rest;
      })
    );

    if (before !== JSON.stringify(next)) changed.add(field);

    (settings as unknown as Record<string, unknown>)[field] = next;
  }

  setBlock('headlineStats', data.headlineStats, settings.headlineStats);
  setBlock('valuePropositions', data.valuePropositions, settings.valuePropositions);
  setBlock('commitments', data.commitments, settings.commitments);
  setBlock('safetyPolicies', data.safetyPolicies, settings.safetyPolicies);
  setBlock('socialLinks', data.socialLinks, settings.socialLinks);

  try {
    await settings.save();
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      const fieldErrors: Record<string, string> = {};

      for (const [path, detail] of Object.entries(error.errors)) {
        fieldErrors[path] = detail.message;
      }

      return NextResponse.json(
        { error: 'Some fields need checking.', fieldErrors },
        { status: 400 }
      );
    }

    console.error('[admin/settings] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save. Nothing was changed.' },
      { status: 500 }
    );
  }

  /*
   * --- the four affiliations' logos and registration numbers ---
   *
   * A separate collection, saved by the same screen because they are four
   * fields the client fills in once. Addressed by id, never by position: a
   * re-seeded or reordered list would otherwise write TAAN's number onto the
   * NMA record, and a wrong licence number on the trust page is worse than a
   * blank one.
   *
   * After the settings save, so a failure here cannot roll back an edit that
   * already succeeded — and it is reported rather than swallowed.
   */
  let affiliationsChanged = false;

  try {
    for (const row of data.affiliations) {
      const affiliation = await Affiliation.findById(row.id);

      // An id the form knew about that no longer exists. Skipped rather than
      // failed: the rest of the save is already stored and correct.
      if (!affiliation) continue;

      const unchanged =
        (affiliation.registrationNumber ?? '') === (row.registrationNumber ?? '') &&
        (affiliation.logo ?? '') === (row.logo ?? '') &&
        (affiliation.logoAlt ?? '') === (row.logoAlt ?? '');

      if (unchanged) continue;

      affiliation.registrationNumber = row.registrationNumber;
      affiliation.logo = row.logo;
      affiliation.logoAlt = row.logoAlt;
      await affiliation.save();
      affiliationsChanged = true;
    }
  } catch (error) {
    console.error('[admin/settings] Affiliation save failed:', error);

    return NextResponse.json(
      {
        error:
          'The settings saved, but the affiliation registration numbers did not. Try again.',
      },
      { status: 500 }
    );
  }

  if (affiliationsChanged) changed.add('affiliations');

  return NextResponse.json({
    ok: true,
    updatedAt: settings.updatedAt,
    changed: [...changed],
    revalidated: revalidateSettings(changed),
  });
}
