import { notFound, permanentRedirect, redirect } from 'next/navigation';

import { connectDB } from './db';
import Redirect from '../models/Redirect';
import { isLivePath } from './livePaths';
import NotFoundLog from '../models/NotFoundLog';

/**
 * The database-backed 301 catch-all.
 *
 * This is the mechanism the WordPress cutover depends on. Renames were already
 * writing `slugHistory` and `Redirects` rows correctly, but nothing served
 * them — a redirect table nobody reads is a record of intentions, and on launch
 * day it would have meant 404s across every inbound link the old site had.
 *
 * ## Where this has to live, and why it is not middleware
 *
 * Middleware runs on the **Edge runtime**: no Node `crypto`, no TCP, so no
 * Mongoose. It cannot read the `Redirects` collection at all. That is the
 * constraint, and it rules out the obvious answer.
 *
 * The second obvious answer — `app/not-found.tsx` — does not work either, and
 * this was worth finding out by trying rather than assuming: a
 * `permanentRedirect()` called while rendering the not-found boundary is
 * **swallowed**, and the response is still a 404 with no `Location` header.
 *
 * What does work is a redirect thrown from an ordinary **page**, which runs on
 * Node and can reach Mongoose. So the lookup happens at the two places a page
 * concludes it has nothing to render:
 *
 * 1. **`redirectOrNotFound()`** — called instead of `notFound()` by every
 *    dynamic content route. Covers one-, two- and three-segment paths, which is
 *    every URL shaped like the current site.
 *
 * 2. **`app/[...legacyPath]/page.tsx`** — a root catch-all that Next reaches
 *    only when nothing else matches, which here means four segments or more.
 *    That is where a WordPress date permalink lives (`/2019/03/15/post-name`),
 *    and no other route in this app is that deep.
 *
 * A catch-all at the root coexists with `[destination]` without the "Ambiguous
 * app routes" error, because Next resolves by specificity — static, then
 * dynamic, then catch-all — rather than treating them as rivals. Two
 * *differently named* dynamic segments at one depth is the arrangement that
 * fails, and this is not that.
 *
 * ## A redirect can never fire on a live page
 *
 * Structurally, not by checking. Both entry points run **after** the router has
 * failed to find a page and after the page has failed to find its record. A
 * `Redirects` row whose `oldUrl` happens to match something live is never
 * consulted, because nothing on that path ever asks.
 *
 * That property is the reason this is not done in middleware even with a cached
 * manifest. Middleware runs *before* routing, so it cannot know whether a path
 * resolves; protecting live pages there means comparing against a snapshot of
 * what is live, and a snapshot goes stale. A bad row would take a real page
 * offline for as long as the cache lived.
 *
 * ## The status is 308, not 301
 *
 * `permanentRedirect()` emits 308 and `redirect()` emits 307; Next gives a page
 * no way to set an exact status, and only middleware or a route handler can —
 * neither of which can be reached from here for the reasons above.
 *
 * This costs nothing. Google's redirect documentation treats 301 and 308 as
 * equivalent permanent redirects for canonicalisation, and 302 and 307 as
 * equivalent temporary ones. `Redirect.type` records the intent and the mapping
 * below preserves permanence, which is the half that matters. It is called out
 * because the field says 301 and the wire says 308, and that discrepancy should
 * be explained where someone finds it rather than discovered in a log.
 */

/** How many hops to follow before declaring a chain broken. */
const MAX_CHAIN_DEPTH = 5;

/**
 * Paths never worth a database read or a log row.
 *
 * A scanner probing for `/wp-admin`, `/.env` and `/phpmyadmin` is the single
 * largest source of 404s on any site with a domain, and none of it is ever a
 * missed redirect. Filtering here keeps two things clean at once: the database
 * is not read for traffic that cannot match, and the unmapped-404 list stays a
 * worklist rather than a scanner transcript.
 *
 * Deliberately narrow. Anything not obviously hostile still gets looked up —
 * the cost of missing a real legacy URL is a lost inbound link, and the cost of
 * one extra indexed read is nothing.
 */
const JUNK_PATTERNS = [
  /^\/wp-/i,
  /^\/wordpress\b/i,
  /\.php$/i,
  /\.aspx?$/i,
  /^\/\.(env|git|aws|ssh)/i,
  /^\/(phpmyadmin|pma|mysql|adminer)\b/i,
  /^\/(vendor|cgi-bin|autodiscover)\b/i,
  /^\/(xmlrpc|wlwmanifest)/i,
  /^\/\.well-known\/(?!security\.txt)/i,
];

function isJunk(path: string): boolean {
  return JUNK_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Paths recently looked up and found to have no redirect.
 *
 * A negative cache, and the thing that stops a scanner turning one 404 into
 * thousands of identical queries. Module scope, so it lives as long as the
 * server process — on a long-running host that is a real hit rate, and on
 * serverless it is per-instance and still absorbs a burst.
 *
 * Only *misses* are cached. A hit is rare, already fast, and caching it would
 * mean an admin adding a redirect and watching the old 404 persist.
 *
 * The size cap matters: without one this is an unbounded map an attacker fills
 * by requesting random paths, which is a memory leak with a trigger. At the cap
 * the whole map is dropped rather than evicted one entry at a time — a true LRU
 * needs ordering metadata on every entry to save a few cache hits on a
 * best-effort cache.
 */
const MISS_CACHE_LIMIT = 5_000;
const MISS_CACHE_TTL_MS = 60_000;

const missCache = new Map<string, number>();

function cachedMiss(path: string): boolean {
  const seen = missCache.get(path);

  if (seen === undefined) return false;

  if (Date.now() - seen > MISS_CACHE_TTL_MS) {
    missCache.delete(path);
    return false;
  }

  return true;
}

function rememberMiss(path: string): void {
  if (missCache.size >= MISS_CACHE_LIMIT) missCache.clear();

  missCache.set(path, Date.now());
}

/**
 * Clears the negative cache.
 *
 * Called when a redirect is created or edited, so a newly added row takes
 * effect immediately rather than after the TTL. Without it, the most likely
 * first test of a new redirect — following the URL that prompted writing it —
 * would be the one request guaranteed to miss.
 */
export function clearRedirectMissCache(): void {
  missCache.clear();
}

/**
 * Normalises a request path for lookup.
 *
 * Lowercased because `oldUrl` is stored lowercase, and a legacy URL typed in
 * capitals is the same URL. The trailing slash is dropped because `/about/` and
 * `/about` are one page, and a migration map written by hand will contain both
 * spellings. The root is left alone: `/` has nothing to trim to.
 */
function normalisePath(path: string): string {
  const trimmed = path.split('?')[0].split('#')[0].toLowerCase();

  if (trimmed.length > 1 && trimmed.endsWith('/')) {
    return trimmed.slice(0, -1);
  }

  return trimmed;
}

export interface ResolvedRedirect {
  /** Where to send the visitor — the end of the chain, not the next hop. */
  target: string;
  /** The stored intent. 301/308 are permanent, 302/307 temporary. */
  type: number;
  /** The `oldUrl` actually requested, for the hit counter. */
  matched: string;
  /** How many rows were followed. More than one means a chain existed. */
  hops: number;
}

/**
 * Why a path resolved the way it did.
 *
 * `resolveRedirect` answers "where does this go" and throws away everything
 * else — a junk path, a cycle and a path with no row all come back as `null`,
 * because the caller does the same thing with all three. The admin's test
 * button needs the difference: "no row exists" and "a row exists but it loops"
 * are the same non-answer to a visitor and completely different problems to
 * fix.
 */
export type RedirectDiagnosis =
  /** A row matched and the chain resolved. */
  | {
      outcome: 'resolved';
      path: string;
      target: string;
      type: number;
      matched: string;
      hops: number;
      /** Every path walked, in order. Length > 2 means a chain was collapsed. */
      trail: string[];
      /** True when the walk stopped because a hop was a live page. */
      stoppedAtLivePage: boolean;
    }
  /** The path was filtered as scanner noise before any database read. */
  | { outcome: 'junk'; path: string }
  /** No active row has this path as its `oldUrl`. */
  | { outcome: 'no-row'; path: string }
  /** Following the chain came back to somewhere it had already been. */
  | { outcome: 'cycle'; path: string; trail: string[] };

/**
 * Finds where a path should go, following chains to the end.
 *
 * ## Chains are resolved, not served
 *
 * A → B → C is answered with a single redirect to C. Two hops is not fatal but
 * it is slower for the visitor and dilutes what the search engine passes along,
 * and chains happen naturally here: renaming a trip twice writes two rows, and
 * renaming a destination rewrites the target of every row pointing into it.
 *
 * The `visited` set is what makes following a chain safe rather than a way to
 * hang the server. A → B → A is a cycle an admin can create in two saves, and
 * without the set this loops until the depth cap; with it, the cycle is
 * detected and the path falls through to a 404. A 404 on a looped redirect is
 * the right answer — there is no correct destination, and serving either end of
 * the loop would be a guess.
 *
 * ## The chain stops at the first live page
 *
 * Hop zero is known dead — the caller only reaches this because a page 404'd.
 * Intermediate hops are not: the follower walks through URLs nobody requested,
 * and one of those can be a real page that happens to have a stray
 * `Redirects` row against it.
 *
 * That was a real bug, caught in testing. With `/chain-c -> /nepal` and a
 * stray `/nepal -> /india`, a request for `/chain-a` resolved all the way to
 * India: the follower reached `/nepal`, found a matching `oldUrl`, and kept
 * going. "A redirect whose `oldUrl` matches a live page must never fire" has
 * to hold mid-chain as well, and mid-chain it cannot be structural.
 */
export async function resolveRedirect(
  requestPath: string
): Promise<ResolvedRedirect | null> {
  const diagnosis = await diagnoseRedirect(requestPath);

  if (diagnosis.outcome !== 'resolved') return null;

  const { target, type, matched, hops } = diagnosis;

  return { target, type, matched, hops };
}

/**
 * The resolver itself, reporting why rather than only where.
 *
 * **`resolveRedirect` is a thin wrapper over this, deliberately.** The admin's
 * test button exists to give a definitive answer about what a visitor will get,
 * and a diagnostic written as a second implementation is a diagnostic that
 * eventually disagrees with the thing it describes — which is worse than no
 * diagnostic, because it is trusted. One walk, two views of it.
 *
 * ## `useCache` is off for diagnosis, and that is not a shortcut
 *
 * The negative cache exists to stop a scanner turning one 404 into thousands of
 * identical queries. For a visitor it is correct; for a test it is the one
 * thing that would make the answer stale — an admin who tests a path, writes
 * the row and tests again must see the row, not a 60-second-old miss. Reading
 * through means a test always reflects the database as it is now.
 *
 * The test also does not *write* to the cache. Priming a negative entry from a
 * diagnostic would mean testing a path made the next real request for it slower
 * to start working.
 */
export async function diagnoseRedirect(
  requestPath: string,
  options: { useCache?: boolean } = {}
): Promise<RedirectDiagnosis> {
  const { useCache = true } = options;

  const path = normalisePath(requestPath);

  // Cheap string checks before any network call.
  if (isJunk(path)) return { outcome: 'junk', path };
  if (useCache && cachedMiss(path)) return { outcome: 'no-row', path };

  await connectDB();

  const visited = new Set<string>([path]);
  const trail: string[] = [path];

  let current = path;
  let matched: string | null = null;
  let type = 301;
  let hops = 0;
  let stoppedAtLivePage = false;

  while (hops < MAX_CHAIN_DEPTH) {
    /*
     * Stop before following out of a page that actually renders. Skipped on
     * hop zero, where the caller has already established the path is dead —
     * checking it there would be a query to confirm something known.
     */
    if (hops > 0 && (await isLivePath(current))) {
      stoppedAtLivePage = true;
      break;
    }

    const row = await Redirect.findOne({ oldUrl: current, isActive: true })
      .select('newUrl type')
      .lean<{ newUrl: string; type: number }>()
      .exec();

    // Inactive rows are invisible: `isActive` is the admin's off switch, and a
    // disabled redirect has to behave exactly like one that was never written.
    if (!row) break;

    if (hops === 0) {
      matched = current;
      type = row.type;
    }

    const next = normalisePath(row.newUrl);

    /*
     * A cycle. Answering with either end would be picking one arbitrarily, so
     * the path falls through to a 404 — which is at least honest, and which the
     * admin screen flags rather than leaving to be discovered.
     */
    if (visited.has(next)) {
      console.warn(
        `[redirects] Cycle detected following ${path}: ${trail.join(' -> ')} -> ${next}`
      );

      return { outcome: 'cycle', path, trail: [...trail, next] };
    }

    visited.add(next);
    trail.push(next);
    current = next;
    hops += 1;
  }

  if (!matched || current === path) {
    if (useCache) rememberMiss(path);

    return { outcome: 'no-row', path };
  }

  return {
    outcome: 'resolved',
    path,
    target: current,
    type,
    matched,
    hops,
    trail,
    stoppedAtLivePage,
  };
}

/**
 * Records that a redirect was followed.
 *
 * Counted against the row actually requested rather than the end of the chain,
 * because "how many people still arrive at the old URL" is the question the
 * migration screen exists to answer.
 *
 * Awaited rather than fired and forgotten: on serverless the process can be
 * frozen the moment the response is returned, so an un-awaited write is a write
 * that may simply not happen. It never throws — a failed counter must not turn
 * a working redirect into an error page.
 */
async function recordHit(oldUrl: string): Promise<void> {
  try {
    await Redirect.updateOne(
      { oldUrl },
      { $inc: { hitCount: 1 }, $set: { lastHitAt: new Date() } }
    );
  } catch (error) {
    console.error(`[redirects] Could not count a hit on ${oldUrl}:`, error);
  }
}

/**
 * Records a 404 that no redirect answered.
 *
 * One row per distinct path, `$inc`ed on each hit — see the note on the model
 * for why that is the right shape. Junk is filtered out before this is reached,
 * so the list stays a worklist.
 *
 * Never throws, for the same reason as above: a logging failure must not turn a
 * 404 into a 500.
 */
async function logUnmatched(
  path: string,
  referer: string | null,
  userAgent: string | null
): Promise<void> {
  if (isJunk(path)) return;

  try {
    await connectDB();

    const now = new Date();

    await NotFoundLog.updateOne(
      { path },
      {
        $inc: { hits: 1 },
        $set: {
          lastSeenAt: now,
          referer: referer ?? undefined,
          userAgent: userAgent ?? undefined,
        },
        // Only on insert: a path seen last week and again today keeps its
        // original first-seen date, and an admin's "ignore" is not undone by
        // the next hit.
        $setOnInsert: { firstSeenAt: now, ignored: false },
      },
      { upsert: true }
    );
  } catch (error) {
    console.error(`[redirects] Could not log the unmatched path ${path}:`, error);
  }
}

/**
 * Either redirects or 404s. **Never returns.**
 *
 * The replacement for a bare `notFound()` in every dynamic content route. One
 * function rather than a check bolted on at each call site, so a route cannot
 * do half of it — the alternative is six places that each have to remember to
 * look for a redirect first, which is exactly the arrangement that ends up
 * being five places.
 *
 * `Promise<never>` is the return type and it is doing real work: both
 * `permanentRedirect()` and `notFound()` throw rather than return, so the
 * compiler knows nothing after this line is reachable and callers do not need
 * a `return` after awaiting it.
 *
 * The request headers are optional because only some callers have them to hand.
 * Without them the 404 is still logged, just without the referring page.
 */
export async function redirectOrNotFound(
  path: string,
  context?: { referer?: string | null; userAgent?: string | null }
): Promise<never> {
  const resolved = await resolveRedirect(path);

  if (resolved) {
    await recordHit(resolved.matched);

    /*
     * Permanence is preserved; the exact status is not available to a page.
     * 301 and 308 are the same thing to a search engine, as are 302 and 307 —
     * see the note at the top of this file.
     */
    if (resolved.type === 301 || resolved.type === 308) {
      permanentRedirect(resolved.target);
    }

    redirect(resolved.target);
  }

  await logUnmatched(
    normalisePath(path),
    context?.referer ?? null,
    context?.userAgent ?? null
  );

  notFound();
}
