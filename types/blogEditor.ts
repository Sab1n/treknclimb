import type { IBlogPost } from '../models/BlogPost';

/**
 * The blog post editor's form shape.
 *
 * A type-only import, so this is safe on both sides of the client boundary —
 * `import type` is erased at compile time and pulls no Mongoose into the
 * browser bundle.
 *
 * Every scalar is a string, because that is what an input holds; `relatedTrips`
 * is a string array because that is what a multi-select holds. Numbers and
 * dates are parsed **once**, on the server, by the Zod schema. The empty string
 * means "not set" throughout.
 *
 * Hand-written rather than derived from the schema, for the reason
 * `types/contentEditor.ts` records: an optional field's Zod *input* type is
 * `string | undefined`, and a form input never holds `undefined`.
 */
export interface BlogPostEditorValues {
  title: string;
  slug: string;
  excerpt: string;
  /** Markdown subset, from the rich text editor. */
  body: string;
  featuredImage: string;
  featuredImageAlt: string;
  category: string;
  author: string;
  authorRole: string;
  authorBio: string;
  readTimeMinutes: string;
  relatedTrips: string[];
  /** `YYYY-MM-DD`, as a date input holds it. */
  publishedAt: string;
  status: string;

  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  schemaType: string;
  noIndex: boolean;
}

/** `undefined` and `null` both become `''` — one empty value, not two. */
function text(value: string | null | undefined): string {
  return value ?? '';
}

function numeric(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * A stored `Date` to the `YYYY-MM-DD` a date input wants.
 *
 * Built from the **local** parts, not `toISOString().slice(0, 10)`. Nepal is
 * UTC+5:45, so an evening publish date rendered through the ISO string comes
 * back as the previous day — the value would shift backwards a day every time
 * the record was opened and saved.
 */
function dateInput(value: Date | null | undefined): string {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

export function toBlogPostValues(post: IBlogPost): BlogPostEditorValues {
  return {
    title: text(post.title),
    slug: text(post.slug),
    excerpt: text(post.excerpt),
    body: text(post.body),
    featuredImage: text(post.featuredImage),
    featuredImageAlt: text(post.featuredImageAlt),
    category: post.category ? String(post.category) : '',
    author: text(post.author),
    authorRole: text(post.authorRole),
    authorBio: text(post.authorBio),
    readTimeMinutes: numeric(post.readTimeMinutes),
    relatedTrips: (post.relatedTrips ?? []).map((id) => String(id)),
    publishedAt: dateInput(post.publishedAt),
    status: post.status,

    metaTitle: text(post.metaTitle),
    metaDescription: text(post.metaDescription),
    canonicalUrl: text(post.canonicalUrl),
    ogTitle: text(post.ogTitle),
    ogDescription: text(post.ogDescription),
    ogImage: text(post.ogImage),
    schemaType: text(post.schemaType),
    noIndex: !!post.noIndex,
  };
}

/** A blank post, for the create form. */
export const emptyBlogPost: BlogPostEditorValues = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  featuredImage: '',
  featuredImageAlt: '',
  category: '',
  author: '',
  authorRole: '',
  authorBio: '',
  readTimeMinutes: '',
  relatedTrips: [],
  publishedAt: '',
  status: 'draft',
  metaTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  schemaType: '',
  noIndex: false,
};
