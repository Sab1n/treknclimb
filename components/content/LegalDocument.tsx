import type { ReactNode } from 'react';

import Header from '../layout/Header';
import Footer from '../layout/Footer';
import Breadcrumbs from '../ui/Breadcrumbs';

/**
 * The shared shell for /privacy-policy, /terms and /booking-policy.
 *
 * Structure from the v1 prototype's legal screen: breadcrumb, page header with
 * a last-updated date in mono, then a two-column grid — a sticky anchor-link
 * table of contents on the left, the prose on the right.
 *
 * **Deliberately plain.** No closing CTA band and no affiliations strip:
 * CLAUDE.md excludes affiliations from legal pages, and someone reading a
 * privacy policy from the consent checkbox is mid-inquiry — selling to them
 * here would be both useless and slightly insulting. The header keeps its own
 * CTA because it is site chrome, and a page with no way back to the site is
 * worse.
 *
 * The table of contents is generated from the same `sections` array that
 * renders the body, so a link can never point at a heading that is not there —
 * the failure mode of every hand-maintained TOC.
 */

export interface LegalSection {
  /** Anchor target. Also the TOC link and the heading's `id`. */
  id: string;
  heading: string;
  body: ReactNode;
}

export default function LegalDocument({
  title,
  lastUpdated,
  intro,
  sections,
}: {
  title: string;
  /** Human-readable, e.g. "10 September 2026". Update it when the text changes. */
  lastUpdated: string;
  intro?: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <>
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Breadcrumbs
            crumbs={[{ label: 'Home', href: '/' }, { label: title }]}
          />

          <div className="mt-6 border-b border-hairline pb-8">
            <h1 className="font-display text-3xl font-extrabold tracking-display sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 font-mono text-xs text-muted tabular">
              Last updated {lastUpdated}
            </p>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
            {/*
              Sticky on desktop only. On a phone it sits above the prose as an
              ordinary list, which is what a jump list should be when there is
              no room to keep it beside the text.
            */}
            <nav aria-label="On this page" className="lg:sticky lg:top-6 lg:self-start">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                On this page
              </h2>

              <ul className="mt-3 flex flex-col">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="block border-l-2 border-hairline py-1.5 pl-3 text-sm text-muted transition-colors hover:border-ink hover:text-ink"
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="min-w-0 max-w-prose">
              {intro && (
                <div className="mb-10 flex flex-col gap-4 text-base leading-relaxed">
                  {intro}
                </div>
              )}

              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  // Anchor links land with the heading a little off the top
                  // edge rather than flush against it.
                  className="mb-10 scroll-mt-6"
                >
                  <h2 className="font-display text-xl font-extrabold tracking-display">
                    {section.heading}
                  </h2>

                  <div className="mt-3 flex flex-col gap-4 text-base leading-relaxed">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

/** A bulleted list, styled once so the three documents match. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
