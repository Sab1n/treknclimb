import Link from 'next/link';
import type { Metadata } from 'next';

import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import BlogPostCard from '../../components/content/BlogPostCard';
import BlogCategoryPills from '../../components/content/BlogCategoryPills';
import NewsletterSignup from '../../components/forms/NewsletterSignup';

import {
  getPublishedPosts,
  getBlogCategories,
  getPostCountsByCategory,
} from '../../lib/queries/blog';
import { blogPostPath } from '../../lib/urls';

const SITE_URL = 'https://treknclimb.com';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Field notes — trekking guides, permits and route conditions',
  description:
    'Written by the guides who run these routes. Permit changes, altitude, route conditions and the questions we get asked most by email.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: 'Field notes — Trek & Climb Adventure',
    description:
      'Written by the guides who run these routes. Permit changes, altitude, route conditions and the questions we get asked most by email.',
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
};

export default async function BlogIndexPage() {
  const [posts, categories, counts] = await Promise.all([
    getPublishedPosts(),
    getBlogCategories(),
    getPostCountsByCategory(),
  ]);

  /*
   * The lead post is simply the most recent one, not a `featured` flag.
   *
   * A flag would be a new field the client has to remember to move, and the
   * failure mode is a "featured" post that is two years old — worse than no
   * lead at all on a blog whose value is being current about permits and
   * conditions. If editorial control over the lead is wanted later, that is an
   * additive boolean and this line changes.
   */
  const [lead, ...rest] = posts;

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Field notes',
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
              crumbs={[{ label: 'Home', href: '/' }, { label: 'Blog' }]}
            />

            <h1 className="mt-6 font-display text-4xl font-extrabold tracking-display sm:text-5xl">
              Field notes
            </h1>

            <p className="mt-4 max-w-prose text-base leading-relaxed text-paper/80 sm:text-lg">
              Written by the guides who run these routes. Permit changes, route
              conditions, and the questions we get asked most often by email.
            </p>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            {posts.length === 0 ? (
              <EmptyBlog />
            ) : (
              <>
                <div className="mb-10">
                  <BlogPostCard post={lead} featured />
                </div>

                <BlogCategoryPills categories={categories} counts={counts} />

                {rest.length > 0 && (
                  <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {rest.map((post) => (
                      <li key={String(post._id)}>
                        <BlogPostCard post={post} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>

        {/* Newsletter. Blog traffic is the audience most likely to want it. */}
        <section className="border-t border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <NewsletterSignup
                turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
              />
            </div>
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

/** Shown when nothing is published at all — not a category with no posts. */
function EmptyBlog() {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-white p-8 text-center sm:p-12">
      <h2 className="font-display text-xl font-extrabold tracking-display">
        Nothing published here yet
      </h2>
      <p className="mx-auto mt-3 max-w-prose text-muted">
        Our guides are writing up route notes and permit changes now. In the
        meantime, ask us directly — questions get answered by the person who
        would run your trip.
      </p>
      <Link
        href="/contact"
        className="mt-6 inline-block rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
      >
        Ask a question
      </Link>
    </div>
  );
}
