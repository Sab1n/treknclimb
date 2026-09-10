import Link from 'next/link';
import { blogCategoryPath } from '../../lib/urls';
import { IBlogCategory } from '../../models/BlogCategory';

/**
 * The category filter row.
 *
 * **Links, not client-side filtering** — the opposite of the choice made on
 * /trips, and for a reason. Every category is a real archive page at
 * `/blog/category/[slug]` with its own title, description, canonical and
 * `generateStaticParams` entry, because a category archive is a page search
 * engines should index. Filtering in the browser would leave those pages
 * unlinked from the one place a visitor would look for them.
 *
 * On /trips the opposite held: filter combinations must *never* become
 * indexable URLs, so client-side filtering made that structural. Same
 * component shape, opposite requirement.
 *
 * Categories with no published posts are still shown. They are seeded, they
 * are part of the site's structure, and their archive renders a real empty
 * state — hiding them would make the taxonomy flicker in and out as posts are
 * published and archived.
 */
export default function BlogCategoryPills({
  categories,
  counts,
  activeSlug,
}: {
  categories: IBlogCategory[];
  counts: Map<string, number>;
  /** Omitted on /blog, where "All posts" is the active pill. */
  activeSlug?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav aria-label="Blog categories">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Pill href="/blog" active={!activeSlug}>
            All posts
          </Pill>
        </li>

        {categories.map((category) => (
          <li key={String(category._id)}>
            <Pill
              href={blogCategoryPath(category)}
              active={category.slug === activeSlug}
            >
              {category.name}
              <span className="ml-2 font-mono text-xs tabular opacity-60">
                {counts.get(String(category._id)) ?? 0}
              </span>
            </Pill>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // `aria-current="page"` rather than colour alone — the active pill has to
      // be announced, not just look different.
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-hairline bg-white text-ink hover:border-ink'
      }`}
    >
      {children}
    </Link>
  );
}
