import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import {
  PageHeading,
  ButtonLink,
  EmptyRow,
} from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import {
  getBlogCategoriesForAdmin,
  getPostCountsForAdmin,
} from '../../../../../lib/queries/adminContent';
import { formatDateTime } from '../../../../../lib/adminTime';

export const metadata: Metadata = {
  title: 'Blog categories',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The category list.
 *
 * `categories` is a static segment sitting beside `blog/[id]`, and Next
 * resolves static before dynamic — the same arrangement as `blog/new`, and
 * safe for the same reason: `[id]` only ever receives a 24-character hex
 * ObjectId, which neither `new` nor `categories` is.
 *
 * Both counts come from one aggregation rather than two `countDocuments` per
 * row. Each would be its own round trip to Atlas in Mumbai, and this page is
 * `force-dynamic` — it pays them on every load.
 */
export default async function AdminBlogCategoriesPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) {
    redirect('/admin/login?next=/admin/blog/categories');
  }

  const [categories, counts] = await Promise.all([
    getBlogCategoriesForAdmin(),
    getPostCountsForAdmin(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Blog categories"
        description="Every post is filed under exactly one. Each category has an archive at /blog/category/<slug>, so a rename moves a URL and records a 301 — and a category with posts in it cannot be deleted."
        actions={
          <ButtonLink href="/admin/blog/categories/new">New category</ButtonLink>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="w-full min-w-3xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-paper">
              <th scope="col" className="px-4 py-3 font-semibold">
                Category
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Posts
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Published
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Order
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Last edited
              </th>
            </tr>
          </thead>

          <tbody>
            {categories.length === 0 && (
              <EmptyRow colSpan={5}>
                No categories yet.{' '}
                <Link
                  href="/admin/blog/categories/new"
                  className="underline underline-offset-4"
                >
                  Create the first one
                </Link>
                . A post cannot be saved without one.
              </EmptyRow>
            )}

            {categories.map((category) => {
              const id = String(category._id);
              const count = counts.get(id) ?? { total: 0, published: 0 };

              return (
                <tr
                  key={id}
                  className="border-b border-hairline last:border-0 hover:bg-paper/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/blog/categories/${id}`}
                      className="font-semibold underline underline-offset-4"
                    >
                      {category.name}
                    </Link>
                    <span className="block font-mono text-xs text-muted">
                      /blog/category/{category.slug}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {count.total}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {count.published}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {category.displayOrder}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular text-muted">
                    {formatDateTime(category.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="max-w-prose text-sm text-muted">
        An archive with nothing published in it still serves a 200 — an admin
        who has just created a category needs to see it — but it is noindex and
        off the sitemap until a post is filed there, because a heading above an
        empty state is thin content.
      </p>
    </div>
  );
}
