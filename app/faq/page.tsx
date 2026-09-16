import Link from 'next/link';
import type { Metadata } from 'next';

import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import AffiliationStrip from '../../components/layout/AffiliationStrip';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import FaqAccordion from '../../components/content/FaqAccordion';

import {
  getSitewideFaqs,
  groupFaqsByCategory,
} from '../../lib/queries/faqs';
import { faqPageJsonLd, jsonLdScript, SITE_URL } from '../../lib/jsonLd';

/**
 * The general FAQ page.
 *
 * Answers attached to nothing — no trip, no destination. A question about one
 * trek belongs on that trek's page, where the person asking it already is; this
 * page carries the ones that apply before a trip has been chosen, which is
 * where most of the doubt sits on a site selling a $2,000 commitment to
 * strangers abroad.
 *
 * ## Why this is worth its own page rather than a section somewhere
 *
 * It is an AI-extraction target. CLAUDE.md makes GEO architectural, and a page
 * of plainly-worded question-and-answer pairs with `FAQPage` markup is the
 * shape an assistant can quote. The answers are server-rendered inside
 * `<details>`, so they are in the HTML whether or not anything executes
 * JavaScript.
 *
 * ## `export const metadata`, not `generateMetadata()`
 *
 * There are no params and nothing here depends on a database read, so a
 * function that ignores its arguments would be ceremony. CLAUDE.md draws the
 * line exactly there.
 */
export const metadata: Metadata = {
  title: 'Frequently asked questions',
  description:
    'Permits, altitude, group sizes, payment and what happens after you send an inquiry — the questions we are asked before a trip is chosen.',
  alternates: { canonical: `${SITE_URL}/faq` },
  openGraph: {
    title: 'Frequently asked questions | Trek & Climb Adventure',
    description:
      'Permits, altitude, group sizes, payment and what happens after you send an inquiry.',
    url: `${SITE_URL}/faq`,
    type: 'website',
  },
};

/**
 * ISR backstop. On-demand `revalidatePath('/faq')` from the admin is the
 * primary mechanism — this only catches anything that misses it.
 */
export const revalidate = 3600;

export default async function FaqPage() {
  const entries = await getSitewideFaqs();
  const groups = groupFaqsByCategory(entries);

  /*
   * One node for the whole page, built from every entry rather than one node
   * per category — the markup describes the page, and several `FAQPage` nodes
   * on one URL is not what the vocabulary means.
   */
  const jsonLd = faqPageJsonLd(
    entries.map((entry) => ({ question: entry.question, answer: entry.answer })),
    `${SITE_URL}/faq`
  );

  return (
    <>
      <Header />

      <main className="flex-1">
        {/* Hero — Ink band, part of the 30% */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <Breadcrumbs
              crumbs={[{ label: 'Home', href: '/' }, { label: 'FAQ' }]}
            />

            <div className="mt-6 max-w-3xl">
              <h1 className="font-display text-4xl font-extrabold tracking-display sm:text-5xl">
                Frequently asked questions
              </h1>

              <p className="mt-4 max-w-prose text-base leading-relaxed text-paper/80 sm:text-lg">
                The questions we are asked most often before a trip is booked.
                Anything specific to a route is answered on that trip&rsquo;s own
                page.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-hairline">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            {groups.length > 0 ? (
              <div className="grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-16">
                {/*
                  A plain jump list, not a sticky filter. Anchors work without
                  JavaScript, they survive a page share, and on a page of this
                  size a filter would be machinery for something scrolling
                  already does.
                */}
                <nav aria-label="FAQ categories" className="lg:sticky lg:top-6 lg:self-start">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    On this page
                  </h2>

                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 lg:flex-col lg:gap-2">
                    {groups.map((group, index) => (
                      <li key={group.category ?? 'general'}>
                        <a
                          href={`#${slugForGroup(group.category, index)}`}
                          className="text-sm underline underline-offset-4 hover:text-muted"
                        >
                          {group.category ?? 'Other questions'}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>

                <div className="flex flex-col gap-10">
                  {groups.map((group, index) => {
                    const id = slugForGroup(group.category, index);

                    return (
                      <section key={id} id={id} className="scroll-mt-6">
                        <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                          {group.category ?? 'Other questions'}
                        </h2>

                        <div className="mt-4">
                          <FaqAccordion
                            entries={group.entries.map((entry) => ({
                              question: entry.question,
                              answer: entry.answer,
                            }))}
                            idPrefix={id}
                          />
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            ) : (
              /*
                Required empty state. Not a blank page and not an apology — it
                says what is missing, gives the reader the thing they came for
                anyway, and routes to the site's one conversion event.
              */
              <div className="mx-auto max-w-2xl rounded-lg border border-dashed border-hairline bg-white p-8 text-center sm:p-12">
                <h2 className="font-display text-xl font-extrabold tracking-display">
                  No questions published yet
                </h2>

                <p className="mx-auto mt-3 max-w-prose text-muted">
                  We are writing these up. In the meantime the fastest way to an
                  answer is to ask us directly — we reply to every inquiry, and
                  a real person writes the reply.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/contact"
                    className="rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
                  >
                    Ask us a question
                  </Link>
                  <Link
                    href="/trips"
                    className="rounded-full px-5 py-2.5 text-sm font-semibold underline underline-offset-4 hover:text-muted"
                  >
                    Browse trips
                  </Link>
                </div>

                <p className="mt-4 text-xs text-muted">
                  No payment now. Deposit only after you approve the plan.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Closing CTA — the page's one marigold button */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div>
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Still not sure?
                </h2>
                <p className="mt-3 max-w-prose text-paper/80">
                  Send your dates and whatever you are unsure about. We will come
                  back with a day-by-day plan and a final price.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    href="/contact"
                    className="rounded-full bg-marigold px-6 py-3 font-semibold text-ink transition-opacity hover:opacity-90"
                  >
                    Get my free itinerary
                  </Link>
                </div>

                <p className="mt-3 text-sm text-paper/60">
                  No payment now. Deposit only after you approve the plan.
                </p>
              </div>

              <div className="lg:justify-self-end">
                <AffiliationStrip variant="dark" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {jsonLd && (
        <script
          type="application/ld+json"
          // Serialised through `jsonLdScript`, which escapes `<` so an answer
          // containing `</script>` cannot close this tag early.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
      )}
    </>
  );
}

/**
 * A stable anchor id for a category heading.
 *
 * The index is the fallback rather than part of every id, so a link to
 * `#booking` keeps working when a category is added above it. Only the
 * uncategorised group, which has no name to derive from, depends on position.
 */
function slugForGroup(category: string | null, index: number): string {
  if (!category) return `faq-group-${index}`;

  const slug = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return slug ? `faq-${slug}` : `faq-group-${index}`;
}
