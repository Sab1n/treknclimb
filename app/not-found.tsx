import Link from 'next/link';

import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';

/**
 * The 404 page.
 *
 * **No redirect logic here, and that is not an oversight.** A
 * `permanentRedirect()` thrown while rendering the not-found boundary is
 * swallowed by Next — the response stays a 404 with no `Location` header, which
 * was confirmed by trying it rather than assumed. The redirect lookup therefore
 * lives in `lib/redirects.ts`, called from the pages and from the deep-path
 * catch-all, both of which can actually throw a redirect.
 *
 * By the time this renders, a redirect has already been looked for and not
 * found, and the path has been recorded in the unmapped-404 log.
 *
 * Full site chrome rather than a bare message: a 404 is a page a real visitor
 * lands on from a stale link, and the useful thing to give them is a way back
 * into the trips rather than an apology.
 */
export default function NotFound() {
  return (
    <>
      <Header />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start px-4 py-20 sm:px-6 lg:px-8">
        <p className="font-mono text-sm text-muted">404</p>

        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-display sm:text-4xl">
          That page isn&rsquo;t here
        </h1>

        <p className="mt-4 max-w-prose text-muted">
          The link may be out of date, or the page may have moved. Nothing is
          lost — everything the site offers is a click or two away.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/trips"
            className="rounded-full bg-marigold px-6 py-3 font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Browse all trips
          </Link>

          <Link
            href="/destinations"
            className="rounded-full border-2 border-ink px-6 py-3 font-semibold transition-colors hover:bg-ink hover:text-paper"
          >
            Destinations
          </Link>
        </div>

        <p className="mt-10 text-sm text-muted">
          Looking for something specific?{' '}
          <Link href="/contact" className="underline underline-offset-4">
            Ask us
          </Link>{' '}
          — we answer every message.
        </p>
      </main>

      <Footer />
    </>
  );
}
