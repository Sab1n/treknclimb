import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/revalidate — purge cached pages from outside the app.
 *
 * ## Why this exists
 *
 * `revalidatePath()` only runs inside the Next runtime. Admin mutations call it
 * directly and need nothing here. But a **maintenance script cannot**: it is a
 * plain Node process with no request context, so a data repair run against
 * Atlas leaves every prerendered page holding the old text until its
 * `revalidate` window lapses or the site is rebuilt.
 *
 * `scripts/repair-mojibake.ts` is exactly that case — it corrected twelve
 * fields that were live on four public pages — which is what finally made this
 * endpoint worth building rather than leaving as the note in CLAUDE.md.
 *
 * ## How a route handler differs from the Express equivalent
 *
 * There is no `app.post('/api/revalidate', ...)` line anywhere. The **folder**
 * is the URL and the **exported function name** is the method: `export async
 * function POST` is the entire registration. A `GET` to this path 405s without
 * any code, because no `GET` is exported — which is deliberate here. A GET
 * endpoint that mutates cache state is one that a crawler, a prefetch or a
 * link in an email can fire.
 *
 * You are also handed a standard `Request` and return a standard `Response`,
 * not Express's `req`/`res` pair. Nothing is written to the response; it is
 * constructed and returned, so there is no "did I forget to call `res.end()`"
 * path.
 *
 * ## Security
 *
 * CLAUDE.md: *"If kept, it must be protected by a secret token or it becomes a
 * free denial-of-service."* Regenerating every page on demand is expensive, so
 * an open endpoint is an invitation to make the server do that forever.
 *
 * - **Fails closed.** No `REVALIDATE_SECRET` set, or one under 32 characters,
 *   and every request is refused. An endpoint this powerful must not quietly
 *   become public because an environment variable failed to load — the shape
 *   of mistake that only shows up in production.
 * - **Constant-time comparison.** `===` on a secret returns as soon as two
 *   bytes differ, and that timing difference is measurable across a network;
 *   it lets an attacker recover the token one character at a time. Lengths are
 *   compared first because `timingSafeEqual` throws on a length mismatch.
 * - **404, not 401** — the same reasoning as the admin routes. An
 *   authentication challenge confirms the route is real and worth attacking.
 * - **Paths only.** Every entry must begin with a single `/` and carry no
 *   scheme or host, so this cannot be pointed at anything but this site's own
 *   routes.
 */

/** Generous for a whole-site repair, small enough not to be a workload. */
const MAX_PATHS = 100;

function secretMatches(provided: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET;

  // Fail closed: unset, or too short to be worth anything.
  if (!expected || expected.length < 32) return false;
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  // timingSafeEqual throws unless the buffers are the same length, and the
  // length itself is not the secret.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * A site-relative path and nothing else.
 *
 * `//evil.com` is rejected by the second test: a leading double slash is a
 * protocol-relative URL, which looks like a path and is not one.
 */
function isSafePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('://') &&
    value.length <= 512
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!secretMatches(request.headers.get('x-revalidate-secret'))) {
    return new NextResponse(null, { status: 404 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const paths = (body as { paths?: unknown })?.paths;

  if (!Array.isArray(paths) || paths.length === 0) {
    return NextResponse.json(
      { error: 'Send { "paths": ["/nepal", ...] }.' },
      { status: 400 }
    );
  }

  if (paths.length > MAX_PATHS) {
    return NextResponse.json(
      { error: `At most ${MAX_PATHS} paths per request.` },
      { status: 400 }
    );
  }

  const rejected = paths.filter((p) => !isSafePath(p));

  if (rejected.length) {
    return NextResponse.json(
      { error: 'Every path must be site-relative.', rejected },
      { status: 400 }
    );
  }

  const unique = [...new Set(paths as string[])];

  for (const path of unique) revalidatePath(path);

  return NextResponse.json({ revalidated: unique, count: unique.length });
}
