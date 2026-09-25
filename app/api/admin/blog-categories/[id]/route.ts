import { NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import BlogCategory from '../../../../../models/BlogCategory';
import { adminBlogCategorySchema } from '../../../../../lib/validators/adminContent';
import {
  isBlogCategorySlugTaken,
  countPostsForCategory,
} from '../../../../../lib/queries/adminContent';
import {
  nextSlugHistory,
  recordSlugRedirect,
  repointRedirects,
} from '../../../../../lib/slugHistory';
import { blogCategoryPaths, revalidateAll } from '../../../../../lib/revalidation';

export const dynamic = 'force-dynamic';

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
 * PATCH /api/admin/blog-categories/[id]
 *
 * ## A rename is a 301, every time
 *
 * A category archive has one URL and no draft state, so there is no "was this
 * ever public?" question to ask — it was. `nextSlugHistory` is called with
 * `wasPublic: true` for that reason, and the redirect is recorded before the
 * response goes back.
 */
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

  if (await isBlogCategorySlugTaken(data.slug, id)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another category already uses this slug.' },
      },
      { status: 400 }
    );
  }

  // `findById` → assign → `save()`, per CLAUDE.md.
  let category;

  try {
    category = await BlogCategory.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!category) return new NextResponse(null, { status: 404 });

  const previousSlug = category.slug;

  category.name = data.name;
  category.slug = data.slug;
  category.description = data.description;
  category.displayOrder = data.displayOrder;

  category.metaTitle = data.metaTitle;
  category.metaDescription = data.metaDescription;
  category.canonicalUrl = data.canonicalUrl;
  category.ogTitle = data.ogTitle;
  category.ogDescription = data.ogDescription;
  category.ogImage = data.ogImage;
  category.schemaType = data.schemaType;
  category.noIndex = data.noIndex;

  // Always public — a category has no draft state, so every rename earns a 301.
  category.slugHistory = nextSlugHistory({
    history: category.slugHistory,
    previousSlug,
    newSlug: data.slug,
    wasPublic: true,
  });

  try {
    await category.save();
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
          fieldErrors: { slug: 'Another category already uses this slug.' },
        },
        { status: 400 }
      );
    }

    console.error('[admin/blog-categories] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save. Nothing was changed.' },
      { status: 500 }
    );
  }

  // --- after the save, and only after it ---

  if (previousSlug !== category.slug) {
    const oldPath = `/blog/category/${previousSlug}`;
    const newPath = `/blog/category/${category.slug}`;

    await recordSlugRedirect({ oldPath, newPath });

    /*
     * Anything already redirecting to the old URL is repointed at the new one
     * rather than left to chain through it. A chain of 301s loses a little
     * ranking at each hop and breaks entirely if a middle link is removed.
     */
    await repointRedirects(oldPath, newPath);
  }

  const paths = await blogCategoryPaths({
    id: String(category._id),
    slug: category.slug,
    previousSlug,
  });

  return NextResponse.json({
    ok: true,
    slug: category.slug,
    updatedAt: category.updatedAt,
    revalidated: revalidateAll(paths),
    slugHistory: category.slugHistory,
  });
}

/**
 * DELETE /api/admin/blog-categories/[id]
 *
 * **Refused while any post still references it.**
 *
 * A harder refusal than the region one, and for a different reason.
 * `Trip.region` is nullable, so a dangling region ref is merely invisible;
 * `BlogPost.category` is **required and not nullable**, so a post whose
 * category has been deleted cannot be saved again at all — `populate` returns
 * null, the editor's select has nothing to show, and the record is stuck.
 *
 * The count includes drafts for exactly that reason: a draft is the post
 * nobody would think to check, and it is the one that would be lost.
 *
 * The counts come back with the refusal so the admin can act on it rather than
 * only being told no.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await guard(request);
  if (blocked) return blocked;

  const { id } = await params;

  await connectDB();

  let category;

  try {
    category = await BlogCategory.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!category) return new NextResponse(null, { status: 404 });

  const { total, published } = await countPostsForCategory(id);

  if (total > 0) {
    const drafts = total - published;
    const breakdown = drafts > 0 ? ` (${published} published, ${drafts} not)` : '';

    return NextResponse.json(
      {
        error: `${total} ${total === 1 ? 'post is' : 'posts are'} filed under this category${breakdown}. Move ${total === 1 ? 'it' : 'them'} to another category first — every post must have one, so deleting now would leave ${total === 1 ? 'that post' : 'those posts'} unopenable in the editor.`,
        postCount: total,
      },
      // 409 Conflict: well-formed and permitted, but the data forbids it.
      { status: 409 }
    );
  }

  const paths = await blogCategoryPaths({
    id: String(category._id),
    slug: category.slug,
  });

  await category.deleteOne();

  /*
   * No redirect is recorded. There is no replacement URL to point at, and a
   * 301 to /blog would be a lie about what the visitor asked for — a clean 404
   * is the honest answer for an archive that no longer exists.
   */
  return NextResponse.json({
    ok: true,
    revalidated: revalidateAll(paths),
  });
}
