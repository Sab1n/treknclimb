import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import Header from '../../../../components/layout/Header';
import Footer from '../../../../components/layout/Footer';
import Breadcrumbs from '../../../../components/ui/Breadcrumbs';
import BlogPostCard from '../../../../components/content/BlogPostCard';
import BlogCategoryPills from '../../../../components/content/BlogCategoryPills';

import {
  getBlogCategoryBySlug,
  getBlogCategories,
  getBlogCategorySlugs,
  getPublishedPosts,
  getPostCountsByCategory,
} from '../../../../lib/queries/blog';
import { blogCategoryPath, blogPostPath } from '../../../../lib/urls';

const SITE_URL = 'https://treknclimb.com';

export const revalidate = 3600;

/**
 * One archive per category, including the ones with nothing published.
 *
 * `/blog/category/[slug]` sits beside `/blog/[slug]`. That works — `category`
 * is a *static* segment and Next resolves static before dynamic — where two
 * differently-named dynamic siblings would fail the build outright. The cost
 * is that a post slugged `category` would be permanently unreachable, which is
 * why `category` is on the reserved-slug list.
 */
export async function generateStaticParams() {
  const slugs = await getBlogCategorySlugs();

  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getBlogCategoryBySlug(slug);

  if (!category) return { title: 'Category not found' };

  const title = category.metaTitle || `${category.name} — field notes`;
  const description =
    category.metaDescription ||
    category.description ||
    `Articles on ${category.name.toLowerCase()} from the guides at Trek & Climb Adventure.`;

  return {
    title,
    description,
    alternates: {
      canonical: category.canonicalUrl || `${SITE_URL}${blogCategoryPath(category)}`,
    },
    robots: category.noIndex ? { index: false, follow: true } : undefined,
  };
}

export default async function BlogCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getBlogCategoryBySlug(slug);

  if (!category) notFound();

  const [posts, categories, counts] = await Promise.all([
    getPublishedPosts({ categoryId: category._id }),
    getBlogCategories(),
    getPostCountsByCategory(),
  ]);

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: category.name,
    numberOfItems: posts.length,
    itemListElement: posts.map((post, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${blogPostPath(post)}`,
      name: post.title,
    })),
  };

  return (
    <>
      <Header />

      <main className="flex-1">
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <Breadcrumbs
              crumbs={[
                { label: 'Home', href: '/' },
                { label: 'Blog', href: '/blog' },
                { label: category.name },
              ]}
            />

            <h1 className="mt-6 font-display text-4xl font-extrabold tracking-display sm:text-5xl">
              {category.name}
            </h1>

            {category.description && (
              <p className="mt-4 max-w-prose text-base leading-relaxed text-paper/80 sm:text-lg">
                {category.description}
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <BlogCategoryPills
              categories={categories}
              counts={counts}
              activeSlug={category.slug}
            />

            {posts.length > 0 ? (
              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                  <li key={String(post._id)}>
                    <BlogPostCard post={post} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyCategory categoryName={category.name} />
            )}
          </div>
        </section>
      </main>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
    </>
  );
}

/**
 * A category that exists but has nothing published yet.
 *
 * A real page rather than a 404, because this URL is linked from the pills on
 * every other blog page — a 404 reached from the site's own navigation is a
 * bug, not an answer. And rather than a bare "no posts", it does the two
 * things a dead end should: send the reader somewhere with content, and offer
 * the thing they were probably really after.
 */
function EmptyCategory({ categoryName }: { categoryName: string }) {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-hairline bg-white p-8 text-center sm:p-12">
      <h2 className="font-display text-xl font-extrabold tracking-display">
        No {categoryName.toLowerCase()} articles yet
      </h2>

      <p className="mx-auto mt-3 max-w-prose text-muted">
        This section is being written. The other categories have articles in
        them, and anything you were hoping to find here we can answer directly —
        by the guide who would run your trip.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/blog"
          className="inline-block rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
        >
          All field notes
        </Link>
        <Link
          href="/contact"
          className="inline-block rounded-full border border-hairline px-5 py-2.5 text-sm font-semibold transition-colors hover:border-ink"
        >
          Ask a question
        </Link>
      </div>
    </div>
  );
}
