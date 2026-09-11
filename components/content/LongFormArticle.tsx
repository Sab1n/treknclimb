import type { ReactNode } from 'react';

import PostBody from './PostBody';
import ArticleToc from './ArticleToc';
import { parseLongForm } from '../../lib/longForm';

/**
 * The composed long-form section.
 *
 * The measure is the thing that was right about the old version and stays:
 * `max-w-prose` holds the text at roughly 68 characters, which is where
 * continuous reading is comfortable. **The problem was never the text width —
 * it was the empty half of the page beside it**, and a column of grey with no
 * landmarks in it.
 *
 * So the right column earns its keep and the left column gets structure:
 *
 * - **A sticky table of contents**, built from the `##` headings, highlighting
 *   the section you are actually in. A companion to the reading, not the
 *   primary navigation — see `ArticleToc`.
 * - **A facts card** under it, carrying the region numbers that used to clutter
 *   the hero. They were wrong there — nobody choosing between activities needs
 *   a permit rating first — and they are right here, beside prose about seasons
 *   and permits.
 * - **Pull quotes**, set large in the margin. Authored, never chosen: the
 *   parser lifts the `>` line the writer marked, and a section without one gets
 *   none. See `parseLongForm`.
 * - **Numbered section dividers** with real weight, so four `##` sections read
 *   as four things rather than one continuous scroll.
 *
 * ## Mobile
 *
 * One column. The TOC does not render at all below `lg` — a jump list above an
 * article people will read top to bottom is a screenful of links between them
 * and the first sentence. Pull quotes stay, because breaking up the grey
 * matters more on a narrow screen, not less; they simply sit inline rather
 * than in a margin that does not exist.
 */
export default function LongFormArticle({
  body,
  heading,
  /** Rendered in the right column under the TOC, and inline on mobile. */
  aside,
}: {
  body: string;
  heading: string;
  aside?: ReactNode;
}) {
  const { lede, sections } = parseLongForm(body);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
        {heading}
      </h2>

      {/*
        The lede runs at the same measure as the body but a size up — it is the
        entry into the article, and setting it identically to everything below
        is what makes a wall of text look like a wall of text.
      */}
      {lede && (
        <div className="mt-5 max-w-prose text-lg leading-relaxed text-muted">
          <PostBody body={lede} />
        </div>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-14">
        <div className="min-w-0">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              {/*
                The divider. A rule plus a number rather than a bare `<hr>`:
                the number is what makes four sections read as an ordered set,
                and it costs nothing because the index is already here.

                Not on the first section — a divider above the opening heading
                separates it from the lede it belongs to.
              */}
              {index > 0 && (
                <div
                  aria-hidden="true"
                  className="mb-10 mt-12 flex items-center gap-4"
                >
                  <span className="font-mono text-xs text-muted tabular">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="h-px flex-1 bg-hairline" />
                </div>
              )}

              <h3 className="max-w-prose font-display text-xl font-extrabold tracking-display sm:text-2xl">
                {section.heading}
              </h3>

              {section.pullQuote && (
                /*
                  Set large and hung off the left edge on wide screens with a
                  negative margin, so it breaks the measure rather than sitting
                  politely inside it. That break is the entire point — a pull
                  quote that respects the column is just a bigger paragraph.
                */
                <blockquote className="my-8 border-l-2 border-marigold py-1 pl-5 lg:-ml-6">
                  <p className="max-w-prose font-display text-xl font-extrabold leading-snug tracking-display text-ink sm:text-2xl">
                    {section.pullQuote}
                  </p>
                </blockquote>
              )}

              <div className="mt-5 max-w-prose">
                <PostBody body={section.body} />
              </div>

              {/*
                The aside, inline on mobile, dropped into the middle of the
                article rather than after it. `Math.floor(length / 2)` rather
                than a fixed index — the placement has to hold at four sections
                and at nine, and hard-coding "after the second" is exactly the
                count assumption that breaks when the client rewrites this.
              */}
              {aside && index === Math.floor(sections.length / 2) - 1 && (
                <div className="mt-10 max-w-prose lg:hidden">{aside}</div>
              )}
            </section>
          ))}
        </div>

        {/*
          The right column. `hidden lg:block` rather than reordering with
          flex — it genuinely should not exist on a phone, and rendering it
          hidden keeps the DOM order sensible for a screen reader, which reads
          the article and then the supporting material.
        */}
        <aside className="hidden lg:block">
          <div className="flex flex-col gap-8 lg:sticky lg:top-8">
            <ArticleToc
              sections={sections.map(({ id, heading: sectionHeading }) => ({
                id,
                heading: sectionHeading,
              }))}
            />

            {aside}
          </div>
        </aside>
      </div>
    </div>
  );
}
