/**
 * Asks the running site to purge cached pages, from a plain Node script.
 *
 * `revalidatePath()` only works inside the Next runtime, and a maintenance
 * script is a plain Node process — so the purge has to go over HTTP to
 * `POST /api/revalidate`, which is guarded by `REVALIDATE_SECRET`.
 *
 * Shared by every script that changes what a public page renders. It was
 * written for scripts/repair-mojibake.ts and moved here when
 * scripts/seed-departures.ts needed the same thing — a second copy would be
 * the one that stopped matching the endpoint's contract.
 *
 * A failure here is reported, never fatal. The data has already been written
 * and verified by the time this runs, and the cache catches up on the next
 * build or when each page's `revalidate` window lapses. Exiting non-zero on an
 * unreachable dev server would make a successful run look failed.
 */
export async function purge(paths: string[]): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET;
  const base = process.env.SITE_ORIGIN ?? 'http://localhost:3000';

  if (!secret) {
    console.log(
      '\nREVALIDATE_SECRET is not set, so nothing was purged. The change is ' +
        'in Atlas; the pages will pick it up on the next build.'
    );
    return;
  }

  try {
    const response = await fetch(`${base}/api/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': secret,
      },
      body: JSON.stringify({ paths }),
    });

    if (response.ok) {
      const result = (await response.json()) as { count: number };
      console.log(`\nPurged ${result.count} path(s) via ${base}/api/revalidate.`);
    } else {
      console.log(
        `\nPurge request returned ${response.status}. The data is written; ` +
          'the pages will refresh on the next build.'
      );
    }
  } catch {
    console.log(
      `\nNo server reachable at ${base}, so nothing was purged. The data is ` +
        'written; the pages will refresh on the next build. Set SITE_ORIGIN ' +
        'to point this at a running deployment.'
    );
  }
}
