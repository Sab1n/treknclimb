import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import Region from '../../../../../models/Region';
import Destination from '../../../../../models/Destination';
import Trip from '../../../../../models/Trip';
import { adminRegionSchema } from '../../../../../lib/validators/adminContent';
import {
  isRegionSlugTaken,
  countTripsForRegion,
} from '../../../../../lib/queries/adminContent';
import {
  nextSlugHistory,
  recordSlugRedirect,
  repointRedirects,
} from '../../../../../lib/slugHistory';
import { regionPaths, revalidateAll } from '../../../../../lib/revalidation';

export const dynamic = 'force-dynamic';

/**
 * PATCH and DELETE for one region.
 *
 * Both live here because both address a single record; `POST` for creation is
 * on the collection route next door — the same split Express would write as
 * `router.route('/:id')` versus `router.route('/')`.
 *
 * ## A region rename moves several URLs, not one
 *
 * A region renders at `/<destination>/<activity>/region/<slug>`, once per
 * activity that has trips in it. So a rename moves **every** one of those
 * pages, and each needs its own 301. `regionPaths()` reads the real pairs
 * rather than assuming trekking — see the note there.
 */

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

/**
 * The activity slugs a region's pages sit under, for building redirect paths.
 *
 * Read from the trips, never assumed. Returns `[]` for a region with no trips,
 * which means a rename records no redirects — correct, because there were no
 * pages to move.
 */
async function activitySlugsFor(regionId: string): Promise<string[]> {
  const trips = await Trip.find({ region: regionId })
    .select('activity')
    .populate('activity', 'slug')
    .lean<{ activity: { slug: string } | null }[]>()
    .exec();

  return [
    ...new Set(
      trips
        .map((trip) => trip.activity?.slug)
        .filter((slug): slug is string => !!slug)
    ),
  ];
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

  const parsed = adminRegionSchema.safeParse(body);

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

  if (await isRegionSlugTaken(data.slug, id)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another region already uses this slug.' },
      },
      { status: 400 }
    );
  }

  // `findById` → assign → `save()`, per CLAUDE.md.
  let region;

  try {
    region = await Region.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!region) return new NextResponse(null, { status: 404 });

  /*
   * The destination has to exist. It does **not** have to have an activity
   * layer — a region is a place, and one without a route is a record waiting
   * for a route rather than an invalid record. See models/Region.ts.
   */
  const destination = await Destination.findById(data.destination)
    .select('slug name')
    .lean<{ slug: string; name: string }>()
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

  const previousSlug = region.slug;
  const previousDestinationSlug = await destinationSlug(region.destination);
  const activitySlugs = await activitySlugsFor(id);

  const previousPaths = previousDestinationSlug
    ? await regionPaths(id, previousDestinationSlug, previousSlug)
    : [];

  region.name = data.name;
  region.slug = data.slug;
  region.destination = new mongoose.Types.ObjectId(data.destination);
  region.description = data.description;
  region.coverImage = data.coverImage;
  region.coverImageAlt = data.coverImageAlt;
  region.displayOrder = data.displayOrder;

  region.metaTitle = data.metaTitle;
  region.metaDescription = data.metaDescription;
  region.canonicalUrl = data.canonicalUrl;
  region.ogTitle = data.ogTitle;
  region.ogDescription = data.ogDescription;
  region.ogImage = data.ogImage;
  region.schemaType = data.schemaType;
  region.noIndex = data.noIndex;

  // Always public — a region has no draft state, so every rename earns a 301.
  region.slugHistory = nextSlugHistory({
    history: region.slugHistory,
    previousSlug,
    newSlug: data.slug,
    wasPublic: true,
  });

  try {
    await region.save();
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
          fieldErrors: { slug: 'Another region already uses this slug.' },
        },
        { status: 400 }
      );
    }

    console.error('[admin/regions] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save. Nothing was changed.' },
      { status: 500 }
    );
  }

  // --- after the save, and only after it ---

  /*
   * One redirect per activity the region rendered under. A single 301 would
   * cover whichever page happened to be listed first and silently abandon the
   * rest — which on this model is the common case, not an edge one.
   */
  if (previousDestinationSlug) {
    for (const activitySlug of activitySlugs) {
      const oldPath = `/${previousDestinationSlug}/${activitySlug}/region/${previousSlug}`;
      const newPath = `/${destination.slug}/${activitySlug}/region/${region.slug}`;

      if (oldPath === newPath) continue;

      await recordSlugRedirect({ oldPath, newPath });
      await repointRedirects(oldPath, newPath);
    }
  }

  const currentPaths = await regionPaths(id, destination.slug, region.slug);

  return NextResponse.json({
    ok: true,
    slug: region.slug,
    updatedAt: region.updatedAt,
    revalidated: revalidateAll([...previousPaths, ...currentPaths]),
    slugHistory: region.slugHistory,
  });
}

/**
 * DELETE /api/admin/regions/[id]
 *
 * **Refused while any trip still references it.**
 *
 * Unlike an activity, a dangling region ref would not break a build — the field
 * is nullable and every read handles null. The refusal is about the edit being
 * visible: deleting a region would silently clear a field on an unknown number
 * of trips, and "I deleted Langtang and four trips lost their region" is not
 * something anyone would connect to this action a week later. The count is
 * returned so the admin can act rather than just being told no.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

  await connectDB();

  let region;

  try {
    region = await Region.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!region) return new NextResponse(null, { status: 404 });

  const tripCount = await countTripsForRegion(id);

  if (tripCount > 0) {
    return NextResponse.json(
      {
        error: `${tripCount} ${tripCount === 1 ? 'trip is' : 'trips are'} filed under this region. Clear the region on ${tripCount === 1 ? 'it' : 'them'} first — deleting now would leave ${tripCount === 1 ? 'that trip' : 'those trips'} pointing at a record that no longer exists.`,
        tripCount,
      },
      // 409 Conflict: well-formed and permitted, but the data forbids it.
      { status: 409 }
    );
  }

  const slug = await destinationSlug(region.destination);
  const paths = slug ? await regionPaths(id, slug, region.slug) : [];

  await region.deleteOne();

  /*
   * No redirect is recorded. There is no replacement URL to point at, and a 301
   * to the activity page would be a lie about what the visitor asked for — a
   * clean 404 is the honest answer.
   */
  return NextResponse.json({
    ok: true,
    revalidated: revalidateAll(paths),
  });
}
