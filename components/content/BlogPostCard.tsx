import Link from 'next/link';
import CloudinaryImage from '../ui/CloudinaryImage';
import { blogPostPath } from '../../lib/urls';
import { IBlogPostPopulated } from '../../models/BlogPost';

/**
 * Formats a post date for display and for the `datetime` attribute.
 *
 * `en-GB` and UTC explicitly. Without a fixed timezone the same post could
 * render "14 July" during static generation on a server in Kathmandu and
 * "13 July" in a later revalidation elsewhere, which is a hydration mismatch
 * and an inconsistency between the visible date and the JSON-LD.
 */
export function formatPostDate(value: Date): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The ISO date for `<time datetime>` and structured data. */
export function isoDate(value: Date): string {
  return new Date(value).toISOString();
}

/**
 * A post card for the blog index, the category archives and the "read next"
 * row.
 *
 * `featured` swaps it to the wide two-column treatment the v1 prototype uses
 * for the lead post — same component because it is the same content in the
 * same order, just given more room. That is a genuine variant, unlike the
 * destination cards, where the two shapes shared almost no classes.
 */
export default function BlogPostCard({
  post,
  featured = false,
  showImage = true,
}: {
  post: IBlogPostPopulated;
  featured?: boolean;
  showImage?: boolean;
}) {
  const published = post.publishedAt;

  return (
    <article
      className={`group h-full overflow-hidden rounded-lg border border-hairline bg-white transition-shadow hover:shadow-md ${
        featured ? 'lg:flex' : ''
      }`}
    >
      <Link
        href={blogPostPath(post)}
        className={`flex h-full flex-col ${featured ? 'lg:w-full lg:flex-row' : ''}`}
      >
        {showImage && (
          <div
            className={`relative overflow-hidden bg-hairline ${
              featured ? 'lg:w-1/2 lg:shrink-0' : ''
            }`}
          >
            <CloudinaryImage
              src={post.featuredImage}
              alt={post.featuredImageAlt}
              width={featured ? 960 : 640}
              height={featured ? 640 : 427}
              sizes={
                featured
                  ? '(min-width: 1024px) 36rem, 100vw'
                  : '(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 100vw'
              }
              className="aspect-[3/2] h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        )}

        <div
          className={`flex flex-1 flex-col ${featured ? 'p-6 sm:p-8 lg:justify-center' : 'p-5'}`}
        >
          <p className="text-xs uppercase tracking-wide text-muted">
            {post.category.name}
          </p>

          <h3
            className={`mt-2 font-display font-extrabold tracking-display ${
              featured ? 'text-2xl sm:text-3xl' : 'text-lg'
            }`}
          >
            {post.title}
          </h3>

          <p
            className={`mt-3 flex-1 leading-relaxed text-muted ${
              featured ? 'max-w-prose text-base' : 'text-sm'
            }`}
          >
            {post.excerpt}
          </p>

          <p className="mt-4 font-mono text-xs text-muted tabular">
            {published && (
              <time dateTime={isoDate(published)}>
                {formatPostDate(published)}
              </time>
            )}
            {post.readTimeMinutes && ` · ${post.readTimeMinutes} min read`}
          </p>
        </div>
      </Link>
    </article>
  );
}
