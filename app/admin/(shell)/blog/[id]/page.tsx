import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';

import BlogPostEditor from '../../../../../components/admin/BlogPostEditor';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import {
  getBlogPostForEdit,
  getCategoryOptions,
  getTripOptions,
} from '../../../../../lib/queries/adminContent';
import { toBlogPostValues } from '../../../../../types/blogEditor';

export const metadata: Metadata = {
  title: 'Edit post',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await hasAdminSession())) redirect(`/admin/login?next=/admin/blog/${id}`);

  const [post, categories, trips] = await Promise.all([
    getBlogPostForEdit(id),
    getCategoryOptions(),
    getTripOptions(),
  ]);

  /*
   * `notFound()`, not a redirect. Unlike a missing session this is not
   * something signing in would fix — the id is wrong or the record is gone.
   */
  if (!post) notFound();

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title={post.title}
        actions={
          post.status === 'published' ? (
            <a
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
            >
              View live
            </a>
          ) : undefined
        }
      />

      <BlogPostEditor
        mode="edit"
        id={id}
        initialValues={toBlogPostValues(post)}
        categories={categories}
        trips={trips}
        updatedAt={new Date(post.updatedAt).toISOString()}
        slugHistory={post.slugHistory ?? []}
      />
    </div>
  );
}
