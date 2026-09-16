import { NextResponse } from 'next/server';
import http from 'node:http';
import https from 'node:https';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import Redirect from '../../../../../models/Redirect';
import NotFoundLog from '../../../../../models/NotFoundLog';
import { diagnoseRedirect } from '../../../../../lib/redirects';
import { isLivePath } from '../../../../../lib/livePaths';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/redirects/test — what does this path actually do?
 *
 * ## Why this exists
 *
 * A redirect added for a path that has already served a 404 does not take
 * effect immediately: Next caches the 404 render for the page's `revalidate`
 * window, and `revalidatePath` does not clear it. The copy on the add form says
 * so, and copy is not enough — a year from now, whoever is doing Search Console
 * triage writes a redirect, follows it, sees the old 404, and concludes the
 * feature is broken. Being told in advance does not survive the experience of
 * it appearing not to work.
 *
 * So the question this answers is not "does it work" but the two separate
 * questions hiding inside it:
 *
 * 1. **Is the map right?** — `resolver` below. The redirect walk, run directly,
 *    no HTTP and no cache of any kind. This is the truth about the data.
 * 2. **What does a visitor get right now?** — `live` below. A real request
 *    against this deployment, following each hop by hand. This is the truth
 *    about the cache.
 *
 * Splitting them is what makes the tool definitive. One answer would leave the
 * two failure modes indistinguishable: a redirect pointing at the wrong page
 * and a correct redirect sitting behind a cached 404 both look like "still
 * 404" — one needs an edit, the other needs an hour. Together they say which.
 *
 * It is also the cutover tool. Spot-checking the migration map on launch day is
 * this, run against a list of old URLs.
 *
 * ## Route handlers, and where this differs from Express
 *
 * The folder is the path and the exported function name is the method, so this
 * file *is* `POST /api/admin/redirects/test`. It sits beside `[id]/route.ts`
 * without ambiguity because Next resolves static segments before dynamic ones —
 * `test` can never be read as an id. Ids here are ObjectIds, so nothing is
 * shadowed.
 */

/** Each hop of the real HTTP walk. */
interface LiveHop {
  path: string;
  status: number;
  /** The `Location` header, normalised to a path. Null when it was not a 30x. */
  location: string | null;
}

/** Chains are collapsed by the resolver, so more than a couple means trouble. */
const MAX_LIVE_HOPS = 6;

/** A slow page should not hang the admin screen. */
const HOP_TIMEOUT_MS = 10_000;

/**
 * One request, reported exactly as it came back.
 *
 * ## Why `node:http` and not `fetch`
 *
 * **Next emits `Location` twice on the first, uncached render of a page that
 * calls `permanentRedirect()`.** Verified directly rather than inferred — a
 * cold path returns two identical `location: /nepal` headers to `curl` and to
 * raw `node:http` alike, and the same path returns one once the response is
 * cached. Browsers tolerate that, so it costs a visitor nothing; it is only a
 * problem for something reading the headers.
 *
 * `fetch` is what made it a problem. `Headers.get()` joins repeated headers
 * with a comma, so two identical `Location` headers arrive as the single string
 * `"/nepal, /nepal"` — which parses as a path that does not exist. The walk
 * then followed it, got a 404, and reported a working redirect as broken: a
 * diagnostic producing exactly the wrong answer, which is worse than having
 * none.
 *
 * `res.rawHeaders` is the wire, unprocessed. Taking the first `Location` is
 * what a browser does, so the walk follows what a visitor would follow — and a
 * genuinely repeated header stays visible as two entries rather than being
 * hidden behind a join. Splitting the joined string on commas would have
 * produced the same answer here by guessing at a value the client had already
 * mangled.
 */
function probe(
  target: URL
): Promise<{ status: number; location: string | null }> {
  const transport = target.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      target,
      {
        method: 'GET',
        headers: {
          // Named so it is recognisable in a log as a test rather than traffic.
          'user-agent': 'treknclimb-admin-redirect-test',
          accept: 'text/html',
        },
        timeout: HOP_TIMEOUT_MS,
      },
      (response) => {
        /*
         * `rawHeaders` is a flat [name, value, name, value] list in the order
         * received. The first `Location` is the one a browser follows.
         */
        let location: string | null = null;

        for (let i = 0; i < response.rawHeaders.length; i += 2) {
          if (response.rawHeaders[i].toLowerCase() === 'location') {
            location = response.rawHeaders[i + 1];
            break;
          }
        }

        // Drained, not read. The body is irrelevant and can be a full page;
        // leaving it unconsumed holds the socket open.
        response.resume();
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, location })
        );
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error(`No response within ${HOP_TIMEOUT_MS / 1000}s`));
    });

    request.on('error', reject);
    request.end();
  });
}

/**
 * Where this deployment is answering, from the request's own headers.
 *
 * Built from `host` rather than a configured base URL on purpose: a test has to
 * hit the deployment it is running on. A configured URL would have staging test
 * production, which is exactly the wrong answer and the kind that looks right.
 *
 * The path is never taken from the caller as a whole URL — only as a path,
 * validated below — so there is no host an admin session could aim this at.
 * A fetch endpoint that accepts a full URL from its caller is a server-side
 * request forgery hole, however well guarded the session in front of it is.
 */
function originFor(request: Request): string | null {
  const host = request.headers.get('host');

  if (!host) return null;

  const forwarded = request.headers.get('x-forwarded-proto');
  const protocol =
    forwarded?.split(',')[0].trim() ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1')
      ? 'http'
      : 'https');

  return `${protocol}://${host}`;
}

/** A `Location` header reduced to a same-origin path, or null. */
function locationPath(location: string | null, origin: string): string | null {
  if (!location) return null;

  try {
    const url = new URL(location, origin);

    // An off-site target is a real answer, so it is reported as written rather
    // than discarded — but the walk stops, because there is nothing of ours
    // left to follow.
    if (url.origin !== origin) return url.href;

    return url.pathname + url.search;
  } catch {
    return location;
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const raw = (body as { path?: unknown })?.path;

  if (typeof raw !== 'string' || raw.trim() === '') {
    return NextResponse.json({ error: 'Which path?' }, { status: 400 });
  }

  const path = raw.trim();

  /*
   * A path, never a URL. This is the whole of the SSRF guard and it is
   * deliberately blunt: the value is about to be joined to this server's own
   * origin, so anything that could re-point it at another host — a scheme, a
   * protocol-relative `//evil.example`, a backslash some parsers fold to a
   * slash — is refused rather than sanitised.
   */
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('://') ||
    path.includes('\\')
  ) {
    return NextResponse.json(
      { error: 'Enter a path beginning with "/" — not a full URL.' },
      { status: 400 }
    );
  }

  const base = originFor(request);

  if (!base) {
    return NextResponse.json(
      { error: 'Could not work out this deployment’s own address.' },
      { status: 500 }
    );
  }

  await connectDB();

  /*
   * ---- 1. what the map says ----
   *
   * The resolver, run directly. No HTTP, no cache, and no write: `useCache`
   * off means this reads the database as it stands and does not prime the
   * negative cache on its way past.
   */
  const resolver = await diagnoseRedirect(path, { useCache: false });

  // Whether the requested path is a page in its own right. A redirect whose
  // source is live can never fire, and that is the single most confusing row
  // to be looking at while wondering why nothing happens.
  const sourceIsLive = await isLivePath(path);

  const targetIsLive =
    resolver.outcome === 'resolved' ? await isLivePath(resolver.target) : null;

  /*
   * ---- 2. what a visitor gets ----
   *
   * Counters are snapshotted first and restored afterwards. A test is not a
   * visitor, and `hitCount` answers "how many people still arrive at the old
   * URL" — the question the migration screen exists for. Letting a spot-check
   * of two hundred URLs add two hundred phantom arrivals would quietly destroy
   * the only number on this screen that means anything.
   *
   * The whole collection is read rather than a predicted subset: it holds a few
   * hundred rows at most, this is admin-only, and comparing before against
   * after is exactly right where guessing which rows will fire is not.
   */
  const before = await Redirect.find()
    .select('oldUrl hitCount lastHitAt')
    .lean<{ oldUrl: string; hitCount: number; lastHitAt?: Date }[]>()
    .exec();

  const hops: LiveHop[] = [];
  const startedAt = new Date();

  let current = path;
  let offSite: string | null = null;

  try {
    for (let hop = 0; hop < MAX_LIVE_HOPS; hop += 1) {
      /*
       * Each hop requested separately rather than letting the client follow
       * them. The number of hops is half the answer — a chain that works is
       * still a chain to collapse — and an automatic follow reports only where
       * it ended up.
       *
       * There is no cache to disable on this side. The *page* cache at the
       * other end is the thing being measured, and it cannot be bypassed from
       * here; that is precisely why this leg is worth running.
       */
      const response = await probe(new URL(current, base));

      const location = locationPath(response.location, base);

      hops.push({ path: current, status: response.status, location });

      if (response.status < 300 || response.status >= 400 || !location) break;

      if (!location.startsWith('/')) {
        offSite = location;
        break;
      }

      if (location === current) break;

      current = location;
    }
  } catch (error) {
    console.error('[admin/redirects/test] The live request failed:', error);

    return NextResponse.json(
      {
        error:
          'Could not reach the site from the server to test it. The map below is still accurate.',
        resolver,
        sourceIsLive,
        targetIsLive,
      },
      { status: 502 }
    );
  }

  // ---- 3. put the counters back ----

  const after = await Redirect.find()
    .select('oldUrl hitCount')
    .lean<{ oldUrl: string; hitCount: number }[]>()
    .exec();

  const previous = new Map(
    before.map((row) => [row.oldUrl, row] as const)
  );

  for (const row of after) {
    const was = previous.get(row.oldUrl);

    if (!was || was.hitCount === row.hitCount) continue;

    await Redirect.updateOne(
      { oldUrl: row.oldUrl },
      {
        $set: {
          hitCount: was.hitCount,
          // `null` rather than `undefined`: `$set: { x: undefined }` is dropped
          // by the driver, which would leave the test's own timestamp in place
          // on a row that had never been hit.
          lastHitAt: was.lastHitAt ?? null,
        },
      }
    );
  }

  /*
   * And the 404 log. A path this test 404'd on is genuinely unmapped, but it
   * was not a visitor who asked for it — a row that appears in the worklist
   * because someone tested it reads as an inbound link that does not exist.
   *
   * `firstSeenAt` is written only on insert, so it is a reliable marker of
   * which rows this request created.
   */
  const dead = hops.filter((hop) => hop.status === 404).map((hop) => hop.path);

  if (dead.length > 0) {
    try {
      await NotFoundLog.deleteMany({
        path: { $in: dead },
        firstSeenAt: { $gte: startedAt },
      });

      await NotFoundLog.updateMany(
        { path: { $in: dead }, firstSeenAt: { $lt: startedAt } },
        { $inc: { hits: -1 } }
      );
    } catch (error) {
      console.error('[admin/redirects/test] Could not tidy the 404 log:', error);
    }
  }

  const final = hops.at(-1);

  return NextResponse.json({
    path,
    resolver,
    sourceIsLive,
    targetIsLive,
    live: {
      hops,
      finalPath: offSite ?? final?.path ?? path,
      finalStatus: final?.status ?? 0,
      offSite,
      /*
       * The walk ran out of hops rather than ending. The resolver collapses
       * chains, so this only happens when each target is itself a dead path
       * with its own row — worth naming rather than reporting the sixth hop as
       * if it were the destination.
       */
      truncated: hops.length === MAX_LIVE_HOPS && !!final?.location,
    },
  });
}
