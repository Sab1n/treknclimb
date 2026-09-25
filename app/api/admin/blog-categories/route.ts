import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import BlogCategory from '../../../../models/BlogCategory';
import { adminBlogCategorySchema } from '../../../../lib/validators/adminContent';
import { isBlogCategorySlugTaken } from '../../../../lib/queries/adminContent';
import { blogCategoryPaths, revalidateAll } from '../../../../lib/revalidation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/blog-categories — create a category.
 *
 * ## Where this differs from Express
 *
 * There is no router and no `app.use` chain: the file's path *is* the route,
 * and the exported function name is the method. So the per-route middleware an
 * Express app would mount — auth, the origin check — is called at the top of
 * the handler instead. Nothing runs before this function; if a check is not in
 * here, it does not happen.
 *
 * ## One schema for create and edit
 *
 * A category has no field that cannot exist at creation — no image whose
 * upload path depends on a record id, no publish gate — so a reduced create
 * form would be the real form with things missing that are needed a minute
 * later.
 *
 * ## Creating one publishes a page
 *
 * Unlike a region, a category's archive exists as soon as the record does: the
 * route is `/blog/category/[slug]` and `generateStaticParams` lists every
 * category, empty ones included. So the purge below matters on create as well
 * as on edit.
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

  const parsed = adminBlogCategorySchema.safeParse(body);

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

  if (await isBlogCategorySlugTaken(data.slug)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another category already uses this slug.' },
      },
      { status: 400 }
    );
  }

  let category;

  try {
    category = await BlogCategory.create({
      name: data.name,
      slug: data.slug,
      description: data.description,
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

    /*
     * The unique index, which is the race the check above cannot close: two
     * creates in the same tick both pass it and one loses here.
     */
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json(
        {
          error: 'Some fields need checking.',
          fieldErrors: { slug: 'Another category already uses this slug.' },
        },
        { status: 400 }
      );
    }

    console.error('[admin/blog-categories] Create failed:', error);

    return NextResponse.json(
      { error: 'Could not create. Nothing was saved.' },
      { status: 500 }
    );
  }

  const paths = await blogCategoryPaths({
    id: String(category._id),
    slug: category.slug,
  });

  return NextResponse.json({
    ok: true,
    id: String(category._id),
    slug: category.slug,
    revalidated: revalidateAll(paths),
  });
}
