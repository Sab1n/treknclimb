import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import Destination from '../../../../../models/Destination';
import { adminDestinationSchema } from '../../../../../lib/validators/adminContent';
import { isDestinationSlugTaken } from '../../../../../lib/queries/adminContent';
import {
  nextSlugHistory,
  recordSlugRedirect,
  repointRedirects,
} from '../../../../../lib/slugHistory';
import { destinationPaths, revalidateAll } from '../../../../../lib/revalidation';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/destinations/[id] — edit one of the four destinations.
 *
 * ## There is no POST and no DELETE in this file, deliberately
 *
 * The four destinations are seeded once and edit-only. A create or delete
 * handler that existed and refused would be a feature half-built, and a
 * half-built feature is one someone finishes later without re-reading why it
 * was refused. **The method simply is not exported**, so Next answers 405 with
 * no code written and nothing to mistake for an unfinished draft.
 *
 * That matters more than it sounds: deleting a destination would orphan every
 * trip and activity beneath it. Their `destination` refs would point at
 * nothing, `.populate()` would return null, and the trip pages would throw on
 * `destination.slug` — at build time, on pages that had been fine for months.
 *
 * ## How this differs from the Express equivalent
 *
 * The folder is the path and the exported function name is the method — this
 * file is what `app.patch('/api/admin/destinations/:id')` would have been.
 * Params arrive as the second argument and are a Promise in Next 15+. There is
 * no `router.use(requireAuth)`: the auth check is the first line of the
 * function.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an authorisation error confirms the endpoint exists.
    return new NextResponse(null, { status: 404 });
  }

  /*
   * SameSite=Lax already blocks a cross-site form post. This covers what Lax
   * does not: it is a same-*site* policy, so a compromised subdomain could
   * otherwise drive this endpoint.
   */
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const parsed = adminDestinationSchema.safeParse(body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
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

  if (await isDestinationSlugTaken(data.slug, id)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another destination already uses this slug.' },
      },
      { status: 400 }
    );
  }

  /*
   * `findById` → assign → `save()`, per CLAUDE.md — never `findOneAndUpdate`.
   * Query middleware skips document validation, and the slug's reserved-list
   * validator is a path validator that `runValidators` would run but the
   * pattern is what keeps every model's hooks reachable by one code path.
   */
  let destination;

  try {
    destination = await Destination.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!destination) return new NextResponse(null, { status: 404 });

  const previousSlug = destination.slug;

  /*
   * Captured before the rename so both the old and the new locations can be
   * purged. Leaving the old path cached means the destination is served from
   * two URLs at once — duplicate content rather than merely stale.
   */
  const previousPaths = await destinationPaths(
    id,
    previousSlug,
    destination.hasActivities
  );

  destination.name = data.name;
  destination.slug = data.slug;
  destination.description = data.description;
  destination.coverImage = data.coverImage;
  destination.coverImageAlt = data.coverImageAlt;
  destination.displayOrder = data.displayOrder;

  destination.typicalLengthLabel = data.typicalLengthLabel;
  destination.maxAltitudeLabel = data.maxAltitudeLabel;
  destination.bestMonthsLabel = data.bestMonthsLabel;
  destination.permitComplexity = data.permitComplexity as
    | typeof destination.permitComplexity;
  destination.activitiesIntro = data.activitiesIntro;

  destination.metaTitle = data.metaTitle;
  destination.metaDescription = data.metaDescription;
  destination.canonicalUrl = data.canonicalUrl;
  destination.ogTitle = data.ogTitle;
  destination.ogDescription = data.ogDescription;
  destination.ogImage = data.ogImage;
  destination.schemaType = data.schemaType;
  destination.noIndex = data.noIndex;

  /*
   * `hasActivities` is never assigned — the editor does not send it and this
   * route would ignore it if it did. It is the source of truth for the Nepal
   * asymmetry, and flipping it on a destination with published trips would
   * invalidate all of them at once: each trip's validate hook would start
   * demanding, or rejecting, an activity it cannot gain or lose. A migration,
   * not a field.
   */

  /*
   * Always public — a destination has no draft state, so `wasPublic` is true
   * and every rename earns a 301.
   */
  destination.slugHistory = nextSlugHistory({
    history: destination.slugHistory,
    previousSlug,
    newSlug: data.slug,
    wasPublic: true,
  });

  try {
    await destination.save();
  } catch (error) {
    /*
     * Two shapes, and admin error handling has to cope with both. A document
     * hook produces a ValidationError keyed by field path; a duplicate key is a
     * MongoServerError with no `.errors` at all, so code that only unwraps
     * `err.errors` would show the admin nothing.
     */
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

    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json(
        {
          error: 'Some fields need checking.',
          fieldErrors: { slug: 'Another destination already uses this slug.' },
        },
        { status: 400 }
      );
    }

    console.error('[admin/destinations] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save. Nothing was changed.' },
      { status: 500 }
    );
  }

  // --- after the save, and only after it ---

  if (previousSlug !== data.slug) {
    await recordSlugRedirect({
      oldPath: `/${previousSlug}`,
      newPath: `/${data.slug}`,
    });

    /*
     * A destination rename moves every URL beneath it, so redirects that
     * already pointed into the old tree — from a trip rename, or from the
     * WordPress cutover — now point at 404s. Rewriting them keeps the
     * migration map pointing somewhere real.
     */
    await repointRedirects(`/${previousSlug}`, `/${data.slug}`);
  }

  const currentPaths = await destinationPaths(
    id,
    destination.slug,
    destination.hasActivities
  );

  const revalidated = revalidateAll([...previousPaths, ...currentPaths]);

  return NextResponse.json({
    ok: true,
    slug: destination.slug,
    updatedAt: destination.updatedAt,
    revalidated,
    slugHistory: destination.slugHistory,
  });
}
