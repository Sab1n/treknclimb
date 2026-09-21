import type { MetadataRoute } from 'next';

import { getSitemapRoutes } from '../lib/queries/sitemap';
import { SITE_URL } from '../lib/jsonLd';

/**
 * `/sitemap.xml`.
 *
 * ## How this differs from an Express route
 *
 * There is no handler and no response object. `app/sitemap.ts` is a **file
 * convention**: Next recognises the filename, calls the default export, and
 * serialises what it returns into XML with the right `Content-Type` and the
 * right namespace. You return data, not a response — the equivalent Express
 * code would build the XML string by hand and `res.type('application/xml')`
 * it, and every one of those steps is a place to get the escaping wrong.
 *
 * The URL is `/sitemap.xml` even though the file is `sitemap.ts`. That is the
 * convention, not a rewrite, which is why `/sitemap.xml` is in the
 * `STATIC_PATHS` set in `lib/livePaths.ts` — nothing in the filesystem or the
 * database would otherwise reveal that the path serves.
 *
 * ## Absolute URLs
 *
 * The sitemap protocol requires them, and they must be on the same host as the
 * sitemap itself. `SITE_URL` is the same constant the canonical tags and the
 * JSON-LD use, so all three move together if the domain ever does.
 *
 * ## No `changeFrequency`, no `priority`
 *
 * Both are optional in the protocol and **Google ignores both** — it has said
 * so publicly for years. They are not harmless: a `priority` column invites
 * someone to tune numbers that nothing reads, and a `changeFrequency` of
 * `weekly` on a page that changes twice a year is a claim we would be making
 * for no reason. `lastmod` is the one hint that is still used, and it is only
 * used while it stays truthful — which is why `getSitemapRoutes()` omits it
 * rather than stamping the build time. See the note there.
 */

/**
 * Regenerated hourly.
 *
 * The admin's `revalidatePath()` calls purge the *pages* a mutation affects;
 * none of them names `/sitemap.xml`, so without this the sitemap would be
 * whatever the last deploy produced and a trip published afterwards would stay
 * out of it until the next one. An hour is well inside any crawl interval.
 *
 * The alternative — adding `/sitemap.xml` to every path builder in
 * `lib/revalidation.ts` — buys minutes on a file nothing reads in real time,
 * at the cost of a purge that has to be remembered in eight places.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = await getSitemapRoutes();

  return routes.map(({ path, lastModified }) => ({
    url: `${SITE_URL}${path}`,
    ...(lastModified ? { lastModified } : {}),
  }));
}
