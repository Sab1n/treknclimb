import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import BlogCategoryEditor from '../../../../../../components/admin/BlogCategoryEditor';
import { PageHeading } from '../../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../../lib/adminAuth';
import { emptyBlogCategory } from '../../../../../../types/contentEditor';

/**
 * Create a blog category.
 *
 * `new` is a static segment beside `[id]`, and Next resolves static segments
 * first. That normally risks permanently shadowing a record — it is why
 * `category` and `region` are on the reserved slug list — but it is safe here
 * for a reason that does not generalise: `[id]` matches a 24-character hex
 * ObjectId, and `new` is not one.
 */
export const metadata: Metadata = {
  title: 'New blog category',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewBlogCategoryPage() {
  if (!(await hasAdminSession())) {
    redirect('/admin/login?next=/admin/blog/categories/new');
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-muted">
          <Link
            href="/admin/blog/categories"
            className="underline underline-offset-4"
          >
            Blog categories
          </Link>
        </p>

        <div className="mt-1">
          <PageHeading
            title="New blog category"
            description="The archive goes live as soon as this is created — empty, and noindex until a post is filed under it."
          />
        </div>
      </div>

      <BlogCategoryEditor mode="create" initialValues={emptyBlogCategory} />
    </div>
  );
}
