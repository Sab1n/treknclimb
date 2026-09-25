import Link from 'next/link';
import type { Metadata } from 'next';
import { redirectOrNotFound } from '../../../lib/redirects';

import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';
import Breadcrumbs from '../../../components/ui/Breadcrumbs';
import CloudinaryImage from '../../../components/ui/CloudinaryImage';
import TripCard from '../../../components/content/TripCard';
import PostBody from '../../../components/content/PostBody';
import ArticleToc from '../../../components/content/ArticleToc';
import { LongFormSections } from '../../../components/content/LongFormArticle';
import { parseLongForm } from '../../../lib/longForm';
import NewsletterSignup from '../../../components/forms/NewsletterSignup';
import BlogPostCard, {
  formatPostDate,
  isoDate,
} from '../../../components/content/BlogPostCard';

import {
  getBlogPostBySlug,
  getRelatedPosts,
  getPublishedPostSlugs,
} from '../../../lib/queries/blog';
import { blogCategoryPath, blogPostPath } from '../../../lib/urls';
import { jsonLdScript } from '../../../lib/jsonLd';

const SITE_URL = 'https://treknclimb.com';

export const revalidate = 3600;

/**
 * Every published post, prerendered at build time.
 *
 * The param name has to match the folder — `app/blog/[slug]` means the key is
 * `slug`. Anything not returned here is still generated on first request and
 * then cached, so publishing a post does not require a rebuild; the on-demand
 * `revalidatePath()` from the admin is what makes it appear immediately.
 */
export async function generateStaticParams() {
  const slugs = await getPublishedPostSlugs();

  return slugs.map((slug) => ({ slug }));
}

/**
 * `generateMetadata()` rather than a static object, because everything here
 * depends on a database read keyed by the route param. `getBlogPostBySlug` is
 * wrapped in React's `cache()`, so this and the page body are one query.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) return { title: 'Post not found' };

  const title = post.metaTitle || post.title;
  const description = post.metaDescription || post.excerpt;

  return {
    title,
    description,
    alternates: {
      canonical: post.canonicalUrl || `${SITE_URL}${blogPostPath(post)}`,
    },
    robots: post.noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: post.ogTitle || title,
      description: post.ogDescription || description,
      url: `${SITE_URL}${blogPostPath(post)}`,
      type: 'article',
      publishedTime: post.publishedAt ? isoDate(post.publishedAt) : undefined,
      modifiedTime: isoDate(post.updatedAt),
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  // Covers an unknown slug, a draft, an archived post, and one published
  // without a date — the query filters all four the same way.
  // A renamed post 301s here, via its slugHistory redirect.
  if (!post) return redirectOrNotFound(`/blog/${slug}`);

  const relatedPosts = await getRelatedPosts(post, 3);

  const published = post.publishedAt;

  /*
   * `updatedAt` moves on every save, including a typo fix, so it is only shown
   * when it is meaningfully later than publication — more than a day. A post
   * that says "Updated" one minute after it was published reads as churn and
   * teaches readers to ignore the signal.
   */
  const meaningfullyUpdated =
    published && +post.updatedAt - +published > 24 * 60 * 60 * 1000;

  /**
   * The post's own structure, read out of its `##` headings.
   *
   * `parseLongForm` is the activities page's parser, reused rather than
   * rewritten — same rule for section ids, same "the first `>` in a section
   * is its pull quote" convention. Reusing it means a heading anchor on a post
   * and one on an activity page cannot drift apart.
   */
  const { lede, sections } = parseLongForm(post.body);

  /**
   * Four headings is the threshold for the rail.
   *
   * Below it a table of contents is two or three links beside an article
   * shorter than the list is useful for, and it costs a third of the page to
   * say almost nothing. Above it the rail earns the space: it shows where you
   * are as much as where you can go.
   *
   * The whole layout switches on this, not only the rail — a post without one
   * keeps the centred column it has always had, because a narrow column
   * stranded to the left of empty space is the thing being fixed.
   */
  const withRail = sections.length > 3;

  /**
   * BlogPosting. The dates are the point: answer engines and search both read
   * `datePublished` and `dateModified` to judge whether a page is still worth
   * trusting on a subject where the facts move — permit rules, flight
   * schedules, season windows.
   *
   * `author` is emitted as a Person when there is one, with the company as
   * `publisher` referencing the Organization node the homepage defines by
   * `@id`. An unattributed post on a topic that affects someone's safety is
   * exactly what E-E-A-T is meant to discount.
   */
  const blogPostingJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${SITE_URL}${blogPostPath(post)}#post`,
    headline: post.title,
    description: post.excerpt,
    datePublished: published ? isoDate(published) : undefined,
    dateModified: isoDate(post.updatedAt),
    articleSection: post.category.name,
    inLanguage: 'en',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}${blogPostPath(post)}`,
    },
    author: post.author
      ? {
          '@type': 'Person',
          name: post.author,
          jobTitle: post.authorRole || undefined,
          description: post.authorBio || undefined,
        }
      : undefined,
    publisher: { '@id': `${SITE_URL}/#organization` },
    // Only claim an image when Cloudinary can actually serve one.
    image: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
      ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/${post.featuredImage}`
      : undefined,
  };

  return (
    <>
      {/* The post's CTA is the related-trips block; two marigolds would fight. */}
      <Header showCta={false} />

      <main className="flex-1">
        {/*
          Two widths, one per layout. With a rail the page runs to `max-w-6xl`
          and the grid spends the extra on the table of contents: at `lg` the
          article column comes out a little under the old 48rem, and from `xl`
          it is the full 48rem *plus* a rail — the "adapt to wider screens"
          half of this. Without a rail nothing about the old page changes.
        */}
        <div
          className={`mx-auto px-4 py-8 sm:px-6 lg:px-8 lg:py-12 ${
            withRail ? 'max-w-6xl' : 'max-w-3xl'
          }`}
        >
          <div
            className={
              withRail
                ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12 xl:gap-16'
                : undefined
            }
          >
            <div className="min-w-0 max-w-3xl">
            <Breadcrumbs
              crumbs={[
                { label: 'Home', href: '/' },
                { label: 'Blog', href: '/blog' },
                {
                  label: post.category.name,
                  href: blogCategoryPath(post.category),
                },
                { label: post.title },
              ]}
            />

            <header className="mt-8">
              <Link
                href={blogCategoryPath(post.category)}
                className="text-xs uppercase tracking-wide text-muted underline-offset-4 hover:underline"
              >
                {post.category.name}
              </Link>

              <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.1] tracking-display sm:text-4xl">
                {post.title}
              </h1>

              {/*
                The meta line. Machine-readable dates in <time datetime> as well
                as human ones, so the visible dates and the JSON-LD can never
                disagree — they come from the same values.
              */}
              <p className="mt-4 font-mono text-xs text-muted tabular">
                {published && (
                  <>
                    Published{' '}
                    <time dateTime={isoDate(published)}>
                      {formatPostDate(published)}
                    </time>
                  </>
                )}
                {meaningfullyUpdated && (
                  <>
                    {' · Updated '}
                    <time dateTime={isoDate(post.updatedAt)}>
                      {formatPostDate(post.updatedAt)}
                    </time>
                  </>
                )}
                {post.readTimeMinutes && ` · ${post.readTimeMinutes} min read`}
                {post.author && ` · ${post.author}`}
              </p>
            </header>

            <figure className="mt-8 overflow-hidden rounded-lg bg-hairline">
              <CloudinaryImage
                src={post.featuredImage}
                alt={post.featuredImageAlt}
                width={1200}
                height={675}
                sizes="(min-width: 768px) 48rem, 100vw"
                priority
                className="aspect-[16/9] w-full object-cover"
              />
            </figure>

            <p className="mt-8 text-lg leading-relaxed text-muted">
              {post.excerpt}
            </p>

            {/*
              With a rail the body goes through the same section treatment the
              activities page uses: numbered dividers between sections, and the
              `>` line the writer marked lifted out as a pull quote. Without one
              it stays a single flow — dividers numbering three sections are
              ceremony, and a pull quote has nowhere to hang.

              `level={2}`, because a post's title is the page's `h1` and these
              are the next level down. The activities page passes nothing and
              gets `h3`, which is right there and wrong here.
            */}
            <div className="mt-8">
              {withRail ? (
                <>
                  {lede && <PostBody body={lede} />}
                  <div className="mt-5">
                    <LongFormSections sections={sections} level={2} />
                  </div>
                </>
              ) : (
                <PostBody body={post.body} />
              )}
            </div>

            {/*
              Related trips — the conversion mechanism.

              Blog traffic arrives top-of-funnel from a question, not from an
              intent to buy, so the link out has to be to the trips that answer
              *this* question rather than to a generic "browse everything". The
              trips are hand-picked per post for that reason; nothing here infers
              them.

              The block sits after the body and before the author box: the reader
              has just been convinced the company knows what it is talking about,
              which is the moment the offer is worth making.
            */}
            {post.relatedTrips.length > 0 && (
              <section className="mt-12 rounded-lg border border-hairline bg-white p-6 sm:p-8">
                <h2 className="font-display text-xl font-extrabold tracking-display">
                  Trips this applies to
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Chosen for this article, not generated from it.
                </p>

                <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {post.relatedTrips.map((trip) => (
                    <li key={String(trip._id)}>
                      <TripCard trip={trip} />
                    </li>
                  ))}
                </ul>

                <div className="mt-8 border-t border-hairline pt-6">
                  <Link
                    href="/contact"
                    className="inline-block rounded-full bg-marigold px-6 py-3 font-semibold text-ink transition-opacity hover:opacity-90"
                  >
                    Get my free itinerary
                  </Link>
                  <p className="mt-3 text-sm text-muted">
                    No payment now. Deposit only after you approve the plan.
                  </p>
                </div>
              </section>
            )}

            {/*
              Author box. E-E-A-T is the reason this is not optional decoration:
              on a subject where being wrong has consequences, who wrote it is
              part of whether the page deserves to rank — and here it happens to
              be true, which is the company's actual advantage over the content
              farms it competes with for these queries.
            */}
            {post.author && (
              <section className="mt-12 border-y border-hairline py-6">
                <div className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink font-semibold text-paper"
                  >
                    {initials(post.author)}
                  </span>

                  <div className="min-w-0">
                    <p className="font-semibold">{post.author}</p>
                    {post.authorRole && (
                      <p className="text-sm text-muted">{post.authorRole}</p>
                    )}
                    {post.authorBio && (
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {post.authorBio}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {relatedPosts.length > 0 && (
              <section className="mt-12">
                <h2 className="font-display text-xl font-extrabold tracking-display">
                  Read next
                </h2>

                <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {relatedPosts.map((related) => (
                    <li key={String(related._id)}>
                      <BlogPostCard post={related} showImage={false} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/*
              Newsletter at the foot of the post — after the related trips, not
              before them. Someone who has just read a permit explainer is the
              right audience for more of them, but the trips are the conversion
              event and an email field must not intercept traffic on its way to
              them.
            */}
            <section className="mt-12 rounded-lg border border-hairline bg-white p-6 sm:p-8">
              <NewsletterSignup
                turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                heading="More like this, a few times a year"
                blurb="Permit changes, route conditions and season advice from the guides in Pokhara. No sales emails."
              />
            </section>

            <div className="mt-12">
              <Link
                href="/blog"
                className="text-sm font-semibold underline underline-offset-4"
              >
                All field notes
              </Link>
            </div>
            </div>

            {/*
              The rail. `hidden lg:block` rather than reordering with flex — it
              genuinely should not exist on a phone, where a jump list above an
              article people read top to bottom is a screenful of links between
              them and the first sentence. Rendering it hidden keeps the DOM
              order sensible for a screen reader, which reads the article and
              then the supporting material.

              `top-24` rather than `top-8`: the header is sticky, and a rail
              pinned to the viewport top slides under it.
            */}
            {withRail && (
              <aside className="hidden lg:block">
                <div className="lg:sticky lg:top-8">
                  <ArticleToc
                    sections={sections.map(({ id, heading }) => ({
                      id,
                      heading,
                    }))}
                  />
                </div>
              </aside>
            )}
          </div>
        </div>
      </main>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(blogPostingJsonLd) }}
      />
    </>
  );
}

/** "Bishnu Gurung" → "BG". Falls back to one letter for a single-word name. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
