'use client';

import { useEffect, useState } from 'react';

/**
 * A sticky table of contents that follows the reader down the article.
 *
 * Same anchor-link pattern as the legal pages, but a **companion rather than
 * the primary navigation** — a privacy policy's TOC is how you find the one
 * clause you came for, whereas this sits beside prose most people will read in
 * order. So it is quieter, it highlights where you are rather than only where
 * you can go, and on a phone it disappears entirely instead of pushing the
 * article down the page.
 *
 * ## Scroll spy
 *
 * `IntersectionObserver`, not a scroll listener. A scroll handler fires on
 * every frame of every scroll and has to measure element positions itself,
 * which is layout thrash on the main thread; the observer is handed the work
 * by the browser and only calls back when a boundary is actually crossed.
 *
 * The `rootMargin` is the whole trick: `-96px 0px -70% 0px` shrinks the
 * viewport to a band near the top, so "current" means the heading that has
 * reached reading position — not whichever heading happens to be visible at
 * the bottom of a tall screen, which is the naive version and feels a section
 * ahead of where you are.
 *
 * Elements are looked up by id in the effect rather than held as refs: the
 * headings are rendered by a Server Component, so this has nothing to attach a
 * ref to, and reading refs during render is a React rule violation anyway.
 */
export default function ArticleToc({
  sections,
}: {
  sections: { id: string; heading: string }[];
}) {
  const [activeId, setActiveId] = useState<string | null>(
    sections[0]?.id ?? null
  );

  useEffect(() => {
    const targets = sections
      .map((section) => document.getElementById(section.id))
      .filter((node): node is HTMLElement => node !== null);

    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        /*
         * Several headings can be inside the band at once on a short section,
         * so take the topmost intersecting one rather than the last entry the
         * observer happened to report.
         */
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          );

        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 }
    );

    for (const target of targets) observer.observe(target);

    return () => observer.disconnect();
  }, [sections]);

  if (sections.length < 2) return null;

  return (
    /* Stickiness lives on the wrapper in LongFormArticle, which pins the TOC
       and the facts card together. Two nested sticky elements fight. */
    <nav aria-label="Sections of this article">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        In this section
      </h3>

      <ul className="mt-3 flex flex-col">
        {sections.map((section) => {
          const active = section.id === activeId;

          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                // `aria-current` rather than colour alone — the highlight has
                // to be announced, not only seen.
                aria-current={active ? 'true' : undefined}
                className={`block border-l-2 py-2 pl-3 text-sm transition-colors ${
                  active
                    ? 'border-marigold font-semibold text-ink'
                    : 'border-hairline text-muted hover:border-ink hover:text-ink'
                }`}
              >
                {section.heading}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
