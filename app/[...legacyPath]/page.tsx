import { headers } from 'next/headers';

import { redirectOrNotFound } from '../../lib/redirects';

/**
 * The deep-path catch-all.
 *
 * Next reaches this only when nothing else matches, which in this app means a
 * path of **four segments or more** — the deepest real route is three
 * (`/[destination]/[slug]/[trip]`, `/blog/category/[slug]`). That is exactly
 * where a WordPress date permalink lives: `/2019/03/15/post-name`.
 *
 * A catch-all at the root coexists with `[destination]` without the "Ambiguous
 * app routes detected" error, because Next resolves by specificity — static,
 * then dynamic, then catch-all. The arrangement that fails is two
 * *differently named* dynamic segments at the same depth, and this is not that.
 * Shallower paths never arrive here: `[destination]` is more specific and wins,
 * and those routes call `redirectOrNotFound()` themselves.
 *
 * A page rather than middleware because the lookup needs Mongoose, which the
 * Edge runtime cannot load — and a page rather than `not-found.tsx` because a
 * redirect thrown while rendering the not-found boundary is swallowed and the
 * response stays a 404. See the note at the top of `lib/redirects.ts`.
 */
export const dynamic = 'force-dynamic';

export default async function LegacyPathPage({
  params,
}: {
  params: Promise<{ legacyPath: string[] }>;
}) {
  const { legacyPath } = await params;

  /*
   * Rebuilt from the segments rather than read from a header, because this is
   * the path Next actually routed — already decoded, and free of any query
   * string. Each segment is re-encoded: a legacy URL can contain a space or an
   * accent, and `oldUrl` is stored as it would appear in a browser's address
   * bar.
   */
  const path = '/' + legacyPath.map(encodeURIComponent).join('/');

  const requestHeaders = await headers();

  // Never returns — it either throws a redirect or throws notFound().
  return redirectOrNotFound(path, {
    referer: requestHeaders.get('referer'),
    userAgent: requestHeaders.get('user-agent'),
  });
}
