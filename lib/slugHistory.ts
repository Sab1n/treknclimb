import type { Types } from 'mongoose';

import Redirect from '../models/Redirect';

/**
 * Slug changes, retained history and the 301s that follow.
 *
 * CLAUDE.md makes this a rule for **every** slugged model, and it is the
 * single highest-cost thing to forget: a renamed published page abandons
 * whatever ranking its old URL held, and every existing inbound link starts
 * 404ing. On a site whose organic traffic is the business, that is the most
 * expensive accident the admin can enable.
 *
 * Extracted from the trip save route once activities and destinations needed
 * the same behaviour. Three copies of this would eventually be two copies and
 * a bug.
 */

/**
 * Updates a document's `slugHistory` for a slug change.
 *
 * Returns the new history rather than mutating, so the caller assigns it and
 * the change is visible at the call site.
 *
 * **The current slug is always filtered out**, unconditionally rather than only
 * when this call adds to the history. Renaming A → B → A is not hypothetical —
 * it is what happens when someone tries a new name, dislikes it, and changes
 * back — and without this the record ends up listing its own live slug as
 * retired. The 301 catch-all then redirects the live URL away from itself, and
 * the page becomes unreachable for a reason that looks nothing like the edit
 * that caused it. History written by an earlier save is cleaned up too.
 */
export function nextSlugHistory(options: {
  history: string[];
  previousSlug: string;
  newSlug: string;
  /**
   * Whether the old URL was ever reachable by the public.
   *
   * False for a draft nobody could visit: recording a redirect from a URL that
   * never served anything fills the table with rows pointing nowhere and buries
   * the real ones from the WordPress cutover. Destinations and activities have
   * no draft state, so they pass true.
   */
  wasPublic: boolean;
}): string[] {
  const { history, previousSlug, newSlug, wasPublic } = options;

  const next = [...history];

  if (previousSlug !== newSlug && wasPublic && !next.includes(previousSlug)) {
    next.push(previousSlug);
  }

  return next.filter((old) => old !== newSlug);
}

/**
 * Records the 301 for a moved page, and clears any redirect that would now
 * point away from the live URL.
 *
 * **Called after the save succeeds, never before.** A redirect pointing at a
 * record whose save then failed would send visitors to a 404 the database
 * insists is correct.
 *
 * Never throws. The record is already stored by the time this runs, and a
 * missing redirect is a problem to fix rather than a reason to tell the admin
 * their edit was lost when it was not.
 */
export async function recordSlugRedirect(options: {
  oldPath: string;
  newPath: string;
}): Promise<void> {
  const { oldPath, newPath } = options;

  try {
    /*
     * Nothing may redirect *away from* the URL the record now occupies. The
     * A → B → A rename is the case: the first save wrote A → B, and after the
     * second the record is back at A. Leaving that row means A redirects to B,
     * B redirects to A, and the browser reports a redirect loop on a page that
     * is otherwise fine.
     *
     * Deleting rather than deactivating — a disabled row pointing at a stale
     * URL is not a record anyone benefits from keeping.
     */
    await Redirect.deleteOne({ oldUrl: newPath });

    if (oldPath === newPath) return;

    /*
     * `updateOne` with `upsert` rather than `create`, because `oldUrl` is
     * unique and an admin renaming A → B → A would otherwise hit a duplicate
     * key and see the whole save reported as failed after it had succeeded.
     */
    await Redirect.updateOne(
      { oldUrl: oldPath },
      { $set: { newUrl: newPath, type: 301, isActive: true } },
      { upsert: true }
    );
  } catch (error) {
    console.error(
      `[slugHistory] Could not record the redirect ${oldPath} -> ${newPath}:`,
      error
    );
  }
}

/**
 * Rewrites redirects that pointed at a path which has itself moved.
 *
 * When a destination is renamed, every redirect already pointing into it —
 * from an activity or trip rename, or from the WordPress migration — now points
 * at a 404. Chaining 301s is not fatal but it loses a little authority at each
 * hop and, more practically, a chain that ends at a dead URL is just a dead
 * URL with extra steps.
 *
 * Matches on the path prefix, so `/nepal/trekking/ebc` is caught by a rename of
 * `/nepal`. The trailing-slash guard stops `/nepal` from also matching
 * `/nepalese-something`.
 */
export async function repointRedirects(
  oldPrefix: string,
  newPrefix: string
): Promise<number> {
  if (oldPrefix === newPrefix) return 0;

  try {
    const affected = await Redirect.find({
      newUrl: { $regex: `^${escapeRegex(oldPrefix)}(/|$)` },
    })
      .select('newUrl')
      .lean<{ _id: Types.ObjectId; newUrl: string }[]>()
      .exec();

    for (const redirect of affected) {
      await Redirect.updateOne(
        { _id: redirect._id },
        { $set: { newUrl: newPrefix + redirect.newUrl.slice(oldPrefix.length) } }
      );
    }

    return affected.length;
  } catch (error) {
    console.error('[slugHistory] Could not repoint redirects:', error);
    return 0;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
