import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/adminAuth';
import BlogPost from '../../../../models/BlogPost';
import { adminBlogPostSchema } from '../../../../lib/validators/adminBlog';
import { isBlogSlugTaken } from '../../../../lib/queries/adminContent';
import { blogPostPaths, revalidateAll } from '../../../../lib/revalidation';
import { isOwnPublicId } from '../../../../lib/cloudinary';
import type { PublishStatus } from '../../../../models/shared/status';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/blog — create a post.
 *
 * ## One form for create and edit, unlike trips
 *
 * A trip needed a separate create screen because five of its required fields
 * cannot exist until the record does — the cover image most of all, since the
 * signing endpoint derives its public ID from the trip's slug. A post has the
 * same shape of problem and solves it the same way the model does: `body`,
 * `excerpt` and `featuredImage` are **required to publish, not required to
 * exist**, so a draft saves with a title, a slug and a category and everything
 * else is filled in afterwards.
 *
 * That is also why the featured image can be uploaded from the create form: the
 * sign route's `newSlug` path covers a record that does not exist yet, and the
 * public ID always ends in eight random bytes so nothing can be overwritten.
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

  // The empty string is the "except this record" argument — there is no record
  // yet, so every existing slug counts as taken.
  if (await isBlogSlugTaken(data.slug, '')) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another post already uses this slug.' },
      },
      { status: 400 }
    );
  }

  const post = new BlogPost({
    title: data.title,
    slug: data.slug,
    excerpt: data.excerpt ?? '',
    body: data.body ?? '',
    featuredImage: data.featuredImage ?? '',
    featuredImageAlt: data.featuredImageAlt ?? '',
    category: new mongoose.Types.ObjectId(data.category),
    author: data.author,
    authorRole: data.authorRole,
    authorBio: data.authorBio,
    readTimeMinutes: data.readTimeMinutes,
    relatedTrips: data.relatedTrips.map(
      (tripId) => new mongoose.Types.ObjectId(tripId)
    ),
    status: data.status as PublishStatus,
    /*
     * Stamped now if the post is created already published, honouring an
     * explicit date if one was given — back-dating an import is a real need.
     * Null on a draft: `publishedAt` means "when this went live", and a draft
     * has not.
     */
    publishedAt:
      data.publishedAt ??
      (data.status === 'published' ? new Date() : null),

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

    console.error('[admin/blog] Create failed:', error);

    return NextResponse.json(
      { error: 'Could not create the post. Nothing was saved.' },
      { status: 500 }
    );
  }

  // A draft appears nowhere public, so there is no cached page to purge.
  const revalidated =
    post.status === 'published'
      ? revalidateAll(
          await blogPostPaths({ slug: post.slug, categoryId: post.category })
        )
      : [];

  return NextResponse.json(
    { ok: true, id: String(post._id), slug: post.slug, revalidated },
    { status: 201 }
  );
}
