import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import {
  PageHeading,
  ButtonLink,
  EmptyRow,
  StatCard,
} from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import { getBlogPostsForAdmin } from '../../../../lib/queries/adminContent';
import { formatDateTime } from '../../../../lib/adminTime';

export const metadata: Metadata = {
  title: 'Blog',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The post list, newest published first.
 *
 * The two columns that are not obvious are deliberate. **Related trips** is
 * shown because it is the blog's conversion mechanism and a post with none is
 * traffic that arrives and leaves; **Byline** is shown because an empty author
 * on a published post is an E-E-A-T gap, and both are invisible from the post
 * itself once it is written.
 */
export default async function AdminBlogPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/blog');

  const posts = await getBlogPostsForAdmin();

  const published = posts.filter((post) => post.status === 'published');
  const withoutTrips = published.filter(
    (post) => (post.relatedTrips ?? []).length === 0
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Blog"
        description="Top-of-funnel traffic. A post earns its place by answering a question someone searched for, and converts through the trips attached to it."
        actions={<ButtonLink href="/admin/blog/new">New post</ButtonLink>}
      />

      <dl className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Posts"
          value={posts.length}
          note={`${published.length} published`}
        />
        <StatCard
          label="No related trips"
          value={withoutTrips.length}
          note={
            withoutTrips.length > 0
              ? 'Published, with nothing to convert to'
              : 'Every post points somewhere'
          }
        />
        <StatCard
          label="Drafts"
          value={posts.filter((post) => post.status === 'draft').length}
          note="Not on the site"
        />
      </dl>

      <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="w-full min-w-4xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-paper">
              <th scope="col" className="px-4 py-3 font-semibold">
                Title
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Category
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Byline
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Trips
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Published
              </th>
            </tr>
          </thead>

          <tbody>
            {posts.length === 0 && (
              <EmptyRow colSpan={6}>
                No posts yet.{' '}
                <Link
                  href="/admin/blog/new"
                  className="underline underline-offset-4"
                >
                  Write the first one
                </Link>
                .
              </EmptyRow>
            )}

            {posts.map((post) => {
              const id = String(post._id);
              const isPublished = post.status === 'published';
              const tripCount = (post.relatedTrips ?? []).length;
              const placeholderByline = (post.author ?? '').startsWith(
                'PLACEHOLDER'
              );

              return (
                <tr
                  key={id}
                  className="border-b border-hairline align-top last:border-0 hover:bg-paper/60"
                >
                  <td className="max-w-sm px-4 py-3">
                    <Link
                      href={`/admin/blog/${id}`}
                      className="font-semibold underline underline-offset-4"
                    >
                      {post.title}
                    </Link>
                    <span className="block font-mono text-xs text-muted">
                      /blog/{post.slug}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-muted">
                    {post.category?.name ?? (
                      <span className="text-error">Missing</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-muted">
                    {post.author ? (
                      <>
                        {post.author}
                        {post.authorRole && (
                          <span className="block text-xs">{post.authorRole}</span>
                        )}
                        {/*
                          The seeded bylines are named so they are impossible to
                          miss on the page. Flagged here too, so the list reads
                          as a to-do rather than as finished work.
                        */}
                        {placeholderByline && (
                          <span className="mt-1 block text-xs font-semibold text-error">
                            Placeholder — replace before launch
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs">
                        None
                        {isPublished && (
                          <span className="text-error">
                            {' '}
                            — published without an author
                          </span>
                        )}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {tripCount}
                    {tripCount === 0 && isPublished && (
                      <span className="ml-2 font-sans text-xs text-error">
                        none
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${
                        isPublished
                          ? 'border-confirmed/30 bg-confirmed/10 text-confirmed'
                          : post.status === 'archived'
                            ? 'border-hairline bg-paper text-muted'
                            : 'border-marigold/40 bg-marigold/10 text-ink'
                      }`}
                    >
                      {post.status}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular text-muted">
                    {post.publishedAt ? (
                      formatDateTime(post.publishedAt)
                    ) : (
                      <span>—</span>
                    )}
                    {isPublished && (
                      <a
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block font-sans underline underline-offset-4"
                      >
                        View live
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="max-w-prose text-sm text-muted">
        There is no category editor yet, so the four seeded categories are what a
        post can be filed under. Renaming a published post records a 301 from its
        old URL automatically.
      </p>
    </div>
  );
}
