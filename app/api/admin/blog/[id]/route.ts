import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import BlogPost from '../../../../../models/BlogPost';
import { adminBlogPostSchema } from '../../../../../lib/validators/adminBlog';
import { isBlogSlugTaken } from '../../../../../lib/queries/adminContent';
import {
  nextSlugHistory,
  recordSlugRedirect,
} from '../../../../../lib/slugHistory';
import { blogPostPaths, revalidateAll } from '../../../../../lib/revalidation';
import { isOwnPublicId } from '../../../../../lib/cloudinary';
import type { PublishStatus } from '../../../../../models/shared/status';

export const dynamic = 'force-dynamic';

/**
 * PATCH and DELETE for one blog post.
 *
 * ## Three things have to be read before anything is assigned
 *
 * The slug, the category and the status. Each one changes which pages are stale
 * in a way that is not derivable from the saved document afterwards:
 *
 *  - **the slug** moves the post's URL, so the old one needs a 301 and a purge
 *  - **the category** moves it between archives, and the one it left is still
 *    listing it
 *  - **the status** decides whether it was on the listings at all — and a post
 *    going from published to draft has to purge them, which is exactly when the
 *    naive "only purge if published" check skips it
 *
 * Same shape as the FAQ save route, for the same reason, and the mistake it
 * guards against is the same: purging only the new location.
 */

async function guard(request: Request): Promise<NextResponse | null> {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an auth challenge confirms the endpoint exists.
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  // SameSite=Lax already blocks a cross-site form post; this covers what it
  // does not, since Lax is a same-*site* rather than same-origin policy.
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

  const parsed = adminBlogPostSchema.safeParse(body);

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

  /*
   * The stored reference is interpolated into a Cloudinary URL on a public
   * page, so it is checked to be one of ours rather than trusted because it
   * arrived from an admin session.
   */
  if (data.featuredImage && !isOwnPublicId(data.featuredImage)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: {
          featuredImage:
            'That is not a Cloudinary reference this site issued. Upload the image rather than pasting a URL.',
        },
      },
      { status: 400 }
    );
  }

  await connectDB();

  if (await isBlogSlugTaken(data.slug, id)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another post already uses this slug.' },
      },
      { status: 400 }
    );
  }

  // `findById` → assign → `save()`, per CLAUDE.md.
  let post;

  try {
    post = await BlogPost.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!post) return new NextResponse(null, { status: 404 });

  // --- read before assigning ---
  const previousSlug = post.slug;
  const previousCategory = post.category;
  const wasPublished = post.status === 'published';

  const previousPaths = wasPublished
    ? await blogPostPaths({ slug: previousSlug, categoryId: previousCategory })
    : [];

  post.title = data.title;
  post.slug = data.slug;
  post.excerpt = data.excerpt ?? '';
  post.body = data.body ?? '';
  post.featuredImage = data.featuredImage ?? '';
  post.featuredImageAlt = data.featuredImageAlt ?? '';
  post.category = new mongoose.Types.ObjectId(data.category);
  post.author = data.author;
  post.authorRole = data.authorRole;
  post.authorBio = data.authorBio;
  post.readTimeMinutes = data.readTimeMinutes;
  post.relatedTrips = data.relatedTrips.map(
    (tripId) => new mongoose.Types.ObjectId(tripId)
  );
  post.status = data.status as PublishStatus;

  post.metaTitle = data.metaTitle;
  post.metaDescription = data.metaDescription;
  post.canonicalUrl = data.canonicalUrl;
  post.ogTitle = data.ogTitle;
  post.ogDescription = data.ogDescription;
  post.ogImage = data.ogImage;
  post.schemaType = data.schemaType;
  post.noIndex = data.noIndex;

  /*
   * `publishedAt` is stamped on the first publish and otherwise left alone.
   *
   * An explicit date from the form wins — back-dating an import is a real need.
   * Otherwise: set it when the post first goes live, and never move it on a
   * later edit. It is the date answer engines read as "when was this written",
   * so an edit that silently refreshed it would be claiming the post is newer
   * than it is.
   */
  if (data.publishedAt !== undefined) {
    post.publishedAt = data.publishedAt;
  } else if (post.status === 'published' && !post.publishedAt) {
    post.publishedAt = new Date();
  }

  post.slugHistory = nextSlugHistory({
    history: post.slugHistory,
    previousSlug,
    newSlug: data.slug,
    // Only a published post had a URL worth redirecting from. Recording a 301
    // from a draft's slug fills the table with rows pointing at pages that
    // never served, and buries the ones the WordPress cutover depends on.
    wasPublic: wasPublished,
  });

  try {
    await post.save();
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
          fieldErrors: { slug: 'Another post already uses this slug.' },
        },
        { status: 400 }
      );
    }

    console.error('[admin/blog] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save. Nothing was changed.' },
      { status: 500 }
    );
  }

  // --- after the save, and only after it ---

  /*
   * The 301, recorded only once the record is actually stored. A redirect
   * pointing at a post whose save then failed would send readers to a 404 the
   * database insists is correct.
   */
  if (wasPublished && previousSlug !== post.slug) {
    await recordSlugRedirect({
      oldPath: `/blog/${previousSlug}`,
      newPath: `/blog/${post.slug}`,
    });
  }

  const currentPaths =
    post.status === 'published'
      ? await blogPostPaths({ slug: post.slug, categoryId: post.category })
      : [];

  /*
   * Both sets. `revalidateAll` de-duplicates, so the common case — an edit that
   * changes neither the slug nor the category — purges each path once.
   */
  return NextResponse.json({
    ok: true,
    slug: post.slug,
    updatedAt: post.updatedAt,
    publishedAt: post.publishedAt,
    slugHistory: post.slugHistory,
    revalidated: revalidateAll([...previousPaths, ...currentPaths]),
  });
}

/**
 * DELETE /api/admin/blog/[id]
 *
 * No dependant guard: nothing references a post. `Trip.relatedTrips` is
 * trip-to-trip, and `BlogPost.relatedTrips` points outward — so deleting a post
 * strands nothing.
 *
 * `archived` is the option for a post that should come off the site and stay in
 * the record. Delete is for a duplicate or something created by mistake, and it
 * records no redirect: there is no replacement URL, and a 301 to the blog index
 * would be a lie about what the reader asked for.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

  await connectDB();

  let post;

  try {
    post = await BlogPost.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!post) return new NextResponse(null, { status: 404 });

  // Read before the delete: afterwards there is no record to derive them from.
  const paths =
    post.status === 'published'
      ? await blogPostPaths({ slug: post.slug, categoryId: post.category })
      : [];

  await post.deleteOne();

  return NextResponse.json({ ok: true, revalidated: revalidateAll(paths) });
}
