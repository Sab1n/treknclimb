import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import Activity from '../../../../../models/Activity';
import Destination from '../../../../../models/Destination';
import { adminActivitySchema } from '../../../../../lib/validators/adminContent';
import {
  isActivitySlugTaken,
  countTripsForActivity,
} from '../../../../../lib/queries/adminContent';
import {
  nextSlugHistory,
  recordSlugRedirect,
  repointRedirects,
} from '../../../../../lib/slugHistory';
import { activityPaths, revalidateAll } from '../../../../../lib/revalidation';

export const dynamic = 'force-dynamic';

/**
 * PATCH and DELETE for one activity.
 *
 * Both methods live here because both address a single record; `POST` for
 * creation is on the collection route next door, the same split Express would
 * express as `router.route('/:id')` versus `router.route('/')`.
 */

/** Resolves a destination's slug, for building the activity's URL. */
async function destinationSlug(destinationId: unknown): Promise<string | null> {
  const destination = await Destination.findById(destinationId)
    .select('slug')
    .lean<{ slug: string }>()
    .exec();

  return destination?.slug ?? null;
}

/** Shared by both methods. Returns a response on failure, null on success. */
async function guard(request: Request): Promise<NextResponse | null> {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an authorisation error confirms the endpoint exists.
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

  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const parsed = adminActivitySchema.safeParse(body);

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

  if (await isActivitySlugTaken(data.slug, id)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another activity already uses this slug.' },
      },
      { status: 400 }
    );
  }

  // `findById` → assign → `save()`, per CLAUDE.md.
  let activity;

  try {
    activity = await Activity.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!activity) return new NextResponse(null, { status: 404 });

  /*
   * An activity may only belong to a destination that has an activity layer.
   * Unlike the Trip model, Activity has no `pre('validate')` hook for this —
   * so the check lives here, and its absence would let an activity be attached
   * to Bhutan, where it would render on no page and quietly break the trip
   * editor's destination filter.
   */
  const destination = await Destination.findById(data.destination)
    .select('slug name hasActivities')
    .lean<{ slug: string; name: string; hasActivities: boolean }>()
    .exec();

  if (!destination) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { destination: 'That destination does not exist.' },
      },
      { status: 400 }
    );
  }

  if (!destination.hasActivities) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: {
          destination: `${destination.name} has no activity layer, so it cannot hold activities.`,
        },
      },
      { status: 400 }
    );
  }

  const previousSlug = activity.slug;
  const previousDestinationSlug = await destinationSlug(activity.destination);

  const previousPaths = previousDestinationSlug
    ? await activityPaths(id, previousDestinationSlug, previousSlug)
    : [];

  activity.name = data.name;
  activity.slug = data.slug;
  activity.destination = new mongoose.Types.ObjectId(data.destination);
  activity.description = data.description;
  activity.suitability = data.suitability;
  activity.coverImage = data.coverImage;
  activity.coverImageAlt = data.coverImageAlt;
  activity.displayOrder = data.displayOrder;

  activity.metaTitle = data.metaTitle;
  activity.metaDescription = data.metaDescription;
  activity.canonicalUrl = data.canonicalUrl;
  activity.ogTitle = data.ogTitle;
  activity.ogDescription = data.ogDescription;
  activity.ogImage = data.ogImage;
  activity.schemaType = data.schemaType;
  activity.noIndex = data.noIndex;

  // Always public — an activity has no draft state, so every rename earns a 301.
  activity.slugHistory = nextSlugHistory({
    history: activity.slugHistory,
    previousSlug,
    newSlug: data.slug,
    wasPublic: true,
  });

  try {
    await activity.save();
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

    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json(
        {
          error: 'Some fields need checking.',
          fieldErrors: { slug: 'Another activity already uses this slug.' },
        },
        { status: 400 }
      );
    }

    console.error('[admin/activities] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save. Nothing was changed.' },
      { status: 500 }
    );
  }

  // --- after the save, and only after it ---

  const oldPath = previousDestinationSlug
    ? `/${previousDestinationSlug}/${previousSlug}`
    : null;
  const newPath = `/${destination.slug}/${activity.slug}`;

  if (oldPath && oldPath !== newPath) {
    await recordSlugRedirect({ oldPath, newPath });
    // Trip URLs beneath this activity moved too, so redirects pointing into the
    // old subtree are rewritten rather than left aimed at 404s.
    await repointRedirects(oldPath, newPath);
  }

  const currentPaths = await activityPaths(id, destination.slug, activity.slug);

  return NextResponse.json({
    ok: true,
    slug: activity.slug,
    updatedAt: activity.updatedAt,
    revalidated: revalidateAll([...previousPaths, ...currentPaths]),
    slugHistory: activity.slugHistory,
  });
}

/**
 * DELETE /api/admin/activities/[id]
 *
 * **Refused while any trip still references it.** Deleting one anyway would
 * leave every trip pointing at an ObjectId with nothing behind it:
 * `.populate('activity')` returns null, the Trip model's `pre('validate')` hook
 * then rejects the trip as a Nepal trip without an activity, and the trip page
 * throws on `activity.slug`. All of that surfaces nowhere near the deletion
 * that caused it — the next time someone edits an unrelated trip, or the next
 * build.
 *
 * The count is returned so the admin knows what to do instead of being told no.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

  await connectDB();

  let activity;

  try {
    activity = await Activity.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!activity) return new NextResponse(null, { status: 404 });

  const tripCount = await countTripsForActivity(id);

  if (tripCount > 0) {
    return NextResponse.json(
      {
        error: `${tripCount} ${tripCount === 1 ? 'trip still belongs' : 'trips still belong'} to this activity. Move ${tripCount === 1 ? 'it' : 'them'} to another activity first — deleting this now would leave ${tripCount === 1 ? 'that trip' : 'those trips'} pointing at nothing, and they would fail to build.`,
        tripCount,
      },
      // 409 Conflict: the request is well-formed and the caller is allowed to
      // make it, but the current state of the data forbids it.
      { status: 409 }
    );
  }

  const slug = await destinationSlug(activity.destination);
  const paths = slug ? await activityPaths(id, slug, activity.slug) : [];

  await activity.deleteOne();

  /*
   * The activity's own page is now a 404, and the listings that linked to it
   * have to stop doing so. No redirect is recorded: there is no replacement
   * URL to point at, and a 301 to a destination page would be a lie about what
   * the visitor asked for. A clean 404 is the honest answer.
   */
  return NextResponse.json({
    ok: true,
    revalidated: revalidateAll(paths),
  });
}
