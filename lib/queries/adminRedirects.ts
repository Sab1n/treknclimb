import { connectDB } from '../db';
import Redirect, { IRedirect } from '../../models/Redirect';
import NotFoundLog, { INotFoundLog } from '../../models/NotFoundLog';
import { isLivePath } from '../livePaths';

/**
 * Reads for the redirects admin screen.
 *
 * This is the migration console: the redirect map on one side, the 404s nobody
 * has mapped yet on the other. CLAUDE.md makes both part of the MVP, because
 * the two weeks after cutover are spent moving rows from the second list to the
 * first.
 */

export interface RedirectRow {
  id: string;
  oldUrl: string;
  newUrl: string;
  type: number;
  isActive: boolean;
  hitCount: number;
  lastHitAt: string | null;
  /**
   * Problems with the row itself, worked out at read time.
   *
   * Computed here rather than stored, because every one of them depends on
   * data outside the row — whether the target is live, whether another row
   * starts where this one ends. A stored flag would be wrong the moment a trip
   * was renamed, and nothing would recompute it.
   */
  warnings: string[];
}

/**
 * Every redirect, with the problems each one has.
 *
 * The checks are the point. A redirect map imported from a WordPress crawl is
 * written by hand against a site that no longer exists, and the three ways it
 * goes wrong are all invisible until someone follows the link:
 *
 * - **The source is a live page.** The row can never fire — the resolver only
 *   runs on paths that 404 — so it is dead weight that reads as coverage.
 * - **The target is not a live page.** The visitor is redirected to a 404,
 *   which is worse than the 404 they would have got, because now there are two
 *   requests and the search engine has been told the content moved there.
 * - **The target is itself a source.** A chain. The resolver follows it, so it
 *   works, but it is a row that should point at the end directly.
 */
export async function getRedirectsForAdmin(): Promise<RedirectRow[]> {
  await connectDB();

  const rows = await Redirect.find()
    .sort({ hitCount: -1, oldUrl: 1 })
    .lean<IRedirect[]>()
    .exec();

  const sources = new Set(rows.map((row) => row.oldUrl));

  return Promise.all(
    rows.map(async (row) => {
      const warnings: string[] = [];

      if (await isLivePath(row.oldUrl)) {
        warnings.push(
          'The source is a live page, so this can never fire — redirects are only consulted after a path 404s.'
        );
      }

      if (!(await isLivePath(row.newUrl))) {
        warnings.push(
          'The target does not resolve to a page. This sends visitors from one 404 to another.'
        );
      }

      if (sources.has(row.newUrl)) {
        warnings.push(
          'The target is itself redirected. Followed automatically, but pointing straight at the end is one hop instead of two.'
        );
      }

      return {
        id: String(row._id),
        oldUrl: row.oldUrl,
        newUrl: row.newUrl,
        type: row.type,
        isActive: row.isActive,
        hitCount: row.hitCount,
        lastHitAt: row.lastHitAt ? new Date(row.lastHitAt).toISOString() : null,
        warnings,
      };
    })
  );
}

export interface NotFoundRow {
  id: string;
  path: string;
  hits: number;
  firstSeenAt: string;
  lastSeenAt: string;
  referer: string | null;
  userAgent: string | null;
  ignored: boolean;
}

/**
 * Unmapped 404s, most-requested first.
 *
 * The worklist. Ordering by hits puts the redirect worth writing first at the
 * top — a URL asked for two hundred times is a live inbound link somewhere,
 * and one asked for once is probably a typo.
 */
export async function getUnmappedNotFounds(
  includeIgnored = false
): Promise<NotFoundRow[]> {
  await connectDB();

  const filter = includeIgnored ? {} : { ignored: false };

  const rows = await NotFoundLog.find(filter)
    .sort({ hits: -1, lastSeenAt: -1 })
    .limit(200)
    .lean<INotFoundLog[]>()
    .exec();

  return rows.map((row) => ({
    id: String(row._id),
    path: row.path,
    hits: row.hits,
    firstSeenAt: new Date(row.firstSeenAt).toISOString(),
    lastSeenAt: new Date(row.lastSeenAt).toISOString(),
    referer: row.referer ?? null,
    userAgent: row.userAgent ?? null,
    ignored: row.ignored,
  }));
}

/** Is this `oldUrl` already claimed by another row? */
export async function isRedirectSourceTaken(
  oldUrl: string,
  exceptId: string
): Promise<boolean> {
  await connectDB();

  const existing = await Redirect.findOne({ oldUrl: oldUrl.toLowerCase().trim() })
    .select('_id')
    .lean<{ _id: unknown }>()
    .exec();

  return !!existing && String(existing._id) !== exceptId;
}
