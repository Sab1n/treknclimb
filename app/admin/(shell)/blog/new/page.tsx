import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import BlogPostEditor from '../../../../../components/admin/BlogPostEditor';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import {
  getCategoryOptions,
  getTripOptions,
} from '../../../../../lib/queries/adminContent';
import { emptyBlogPost } from '../../../../../types/blogEditor';

export const metadata: Metadata = {
  title: 'New post',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewBlogPostPage() {
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/blog/new');

  // Independent reads, so they run together rather than in sequence.
  const [categories, trips] = await Promise.all([
    getCategoryOptions(),
    getTripOptions(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="New post"
        description="A draft needs a title, a slug and a category. Everything else can wait."
      />

      {categories.length === 0 && (
        <p
          role="alert"
          className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
        >
          No blog categories exist, and a post needs one. Seed them before
          writing — there is no category editor yet.
        </p>
      )}

      <BlogPostEditor
        mode="create"
        initialValues={emptyBlogPost}
        categories={categories}
        trips={trips}
      />
    </div>
  );
}
