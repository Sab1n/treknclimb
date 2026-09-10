import Link from 'next/link';
import type { Metadata } from 'next';

import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';

/**
 * Where the confirmation link lands.
 *
 * Reads `?status=`, so it is dynamic — correct here. It is noindexed, has no
 * cache value, and every visit is one person's one-off outcome.
 *
 * The status comes from our own redirect, but it arrives through the address
 * bar and anyone can type anything into it. So it is matched against a closed
 * list and falls back to the neutral case — never interpolated into the page.
 */
export const metadata: Metadata = {
  title: 'Newsletter',
  robots: { index: false, follow: false },
};

const OUTCOMES = {
  confirmed: {
    heading: 'You are on the list',
    body: 'Field notes will arrive a few times a year — permit changes, route conditions and season advice, written by the guides who walk these routes.',
  },
  already: {
    heading: 'You were already subscribed',
    body: 'Nothing has changed and you have not been added twice. If you have not been receiving anything, check your spam folder or write to us.',
  },
  expired: {
    heading: 'That link has expired',
    body: 'Confirmation links last seven days. Sign up again and a fresh one will be on its way in a moment.',
  },
  invalid: {
    heading: 'That link has already been used',
    body: 'Confirmation links work once. If you have already clicked it, you are subscribed and there is nothing more to do. If you are not sure, sign up again — it will not add you twice.',
  },
} as const;

type Outcome = keyof typeof OUTCOMES;

function resolve(status?: string): Outcome {
  return status && status in OUTCOMES ? (status as Outcome) : 'invalid';
}

export default async function NewsletterConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const outcome = OUTCOMES[resolve(status)];

  return (
    <>
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <h1 className="font-display text-3xl font-extrabold tracking-display sm:text-4xl">
            {outcome.heading}
          </h1>

          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            {outcome.body}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/blog"
              className="inline-block rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
            >
              Read the field notes
            </Link>
            <Link
              href="/trips"
              className="inline-block rounded-full border border-hairline px-5 py-2.5 text-sm font-semibold transition-colors hover:border-ink"
            >
              Browse trips
            </Link>
          </div>

          <p className="mt-10 text-sm text-muted">
            Every email has an unsubscribe link, and we never sell your address.
            See the{' '}
            <Link
              href="/privacy-policy"
              className="font-semibold underline underline-offset-4"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
