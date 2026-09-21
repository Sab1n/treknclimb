import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import Region from '../../../../models/Region';
import Destination from '../../../../models/Destination';
import { adminRegionSchema } from '../../../../lib/validators/adminContent';
import { isRegionSlugTaken } from '../../../../lib/queries/adminContent';
import { regionPaths, revalidateAll } from '../../../../lib/revalidation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/regions — create a region.
 *
 * ## One schema for create and edit
 *
 * Same reasoning as the activity editor: a region has no field that cannot
 * exist at creation, so there is no deadlock to work around and a reduced
 * create form would just be the real form with things missing that are needed
 * a minute later. The cover image is uploaded against the slug in the form
 * rather than against a record id — the signing endpoint always appends a
 * random suffix, so nothing can be overwritten by guessing.
 *
 * ## Creating one publishes nothing
 *
 * A region has no page of its own; it renders under an activity, and only
 * where a trip puts it. So a newly created region is live nowhere until a trip
 * is filed under it — which is why the revalidation below usually purges just
 * the two generated files and `/trips`.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an authorisation error confirms the endpoint exists.
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

  if (await isRegionSlugTaken(data.slug)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another region already uses this slug.' },
      },
      { status: 400 }
    );
  }

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

  let region;

  try {
    region = await Region.create({
      name: data.name,
      slug: data.slug,
      destination: new mongoose.Types.ObjectId(data.destination),
      description: data.description,
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

    console.error('[admin/regions] Create failed:', error);

    return NextResponse.json(
      { error: 'Could not create. Nothing was saved.' },
      { status: 500 }
    );
  }

  const paths = await regionPaths(
    String(region._id),
    destination.slug,
    region.slug
  );

  return NextResponse.json({
    ok: true,
    id: String(region._id),
    slug: region.slug,
    revalidated: revalidateAll(paths),
  });
}
