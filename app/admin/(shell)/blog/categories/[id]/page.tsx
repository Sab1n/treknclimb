import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';

import BlogCategoryEditor from '../../../../../../components/admin/BlogCategoryEditor';
import { hasAdminSession } from '../../../../../../lib/adminAuth';
import {
  getBlogCategoryForEdit,
  countPostsForCategory,
} from '../../../../../../lib/queries/adminContent';
import { toBlogCategoryValues } from '../../../../../../types/contentEditor';

/**
 * Edit one blog category.
 *
 * A Server Component that reads and hands plain objects to the Client
 * Component doing the editing — so no ObjectId and no Date crosses the
 * boundary, and Mongoose stays on the server.
 */
export const metadata: Metadata = {
  title: 'Edit blog category',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminBlogCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await hasAdminSession())) {
    redirect(`/admin/login?next=/admin/blog/categories/${id}`);
  }

  // Independent reads, so they run together rather than in sequence.
  const [category, counts] = await Promise.all([
    getBlogCategoryForEdit(id),
    countPostsForCategory(id),
  ]);

  /*
   * `notFound()`, not a redirect. Unlike a missing session this is not
   * something signing in would fix — the id is wrong or the record is gone.
   */
  if (!category) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted">
          <Link
            href="/admin/blog/categories"
            className="underline underline-offset-4"
          >
            Blog categories
          </Link>
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-display">
          {category.name}
        </h1>
      </div>

      <BlogCategoryEditor
        mode="edit"
        id={String(category._id)}
        initialValues={toBlogCategoryValues(category)}
        updatedAt={new Date(category.updatedAt).toISOString()}
        slugHistory={[...(category.slugHistory ?? [])]}
        postCount={counts.total}
        publishedCount={counts.published}
      />
    </div>
  );
}
