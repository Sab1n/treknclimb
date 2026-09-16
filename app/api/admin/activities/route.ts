import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import Activity from '../../../../models/Activity';
import Destination from '../../../../models/Destination';
import { adminActivitySchema } from '../../../../lib/validators/adminContent';
import { isActivitySlugTaken } from '../../../../lib/queries/adminContent';
import { activityPaths, revalidateAll } from '../../../../lib/revalidation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/activities — create an activity.
 *
 * ## One schema for create and edit, unlike trips
 *
 * A trip needed a reduced create form because five of its required fields
 * cannot exist at creation. An activity has no such field — its cover image is
 * uploaded against `newSlug` before the record is saved — so there is no
 * deadlock to work around and no reason for a second, smaller schema.
 *
 * ## An activity is live the moment it is created
 *
 * There is no draft state on this model, so unlike a trip this immediately
 * appears on its destination's activities page. That is why the create form
 * asks for the cover image and description up front: an activity with neither
 * would be a live page with nothing on it.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

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

  /*
   * The empty string is the "except this record" argument, because there is no
   * record yet — every existing slug counts as taken.
   */
  if (await isActivitySlugTaken(data.slug, '')) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another activity already uses this slug.' },
      },
      { status: 400 }
    );
  }

  /*
   * Only a destination with an activity layer may hold activities. Activity has
   * no `pre('validate')` hook for this — unlike Trip — so the check lives here,
   * and without it an activity could be filed under Bhutan, where it would
   * render on no page at all.
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

  const activity = new Activity({
    name: data.name,
    slug: data.slug,
    destination: new mongoose.Types.ObjectId(data.destination),
    description: data.description,
    suitability: data.suitability,
    coverImage: data.coverImage,
    coverImageAlt: data.coverImageAlt,
    displayOrder: data.displayOrder,
    metaTitle: data.metaTitle,
    metaDescription: data.metaDescription,
    canonicalUrl: data.canonicalUrl,
    ogTitle: data.ogTitle,
    ogDescription: data.ogDescription,
    ogImage: data.ogImage,
    schemaType: data.schemaType,
    noIndex: data.noIndex,
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

    console.error('[admin/activities] Create failed:', error);

    return NextResponse.json(
      { error: 'Could not create the activity. Nothing was saved.' },
      { status: 500 }
    );
  }

  /*
   * Revalidated, unlike a new trip. A draft trip appears nowhere public, so
   * there is no cached page to purge; a new activity is live immediately and
   * its destination's activities page is stale the moment it saves.
   */
  const paths = await activityPaths(
    String(activity._id),
    destination.slug,
    activity.slug
  );

  return NextResponse.json(
    {
      ok: true,
      id: String(activity._id),
      slug: activity.slug,
      revalidated: revalidateAll(paths),
    },
    { status: 201 }
  );
}
