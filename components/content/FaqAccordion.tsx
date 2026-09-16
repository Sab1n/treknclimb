/**
 * A list of questions and answers, open-and-close, with no JavaScript.
 *
 * ## `<details>` / `<summary>`, not a JS accordion
 *
 * A Server Component — no `'use client'`, no state, no bundle. The browser owns
 * the open and closed states, so the section works before hydration, works with
 * JavaScript disabled, and is keyboard- and screen-reader-correct without a
 * single ARIA attribute written by hand.
 *
 * It also matters for what this content is *for*. CLAUDE.md makes GEO
 * architectural, and most AI crawlers do not execute JavaScript: an answer
 * behind a JS accordion is an answer that is not in the HTML. Inside
 * `<details>` it is in the markup whether it is open or not.
 *
 * The same pattern the trip page already uses for its embedded FAQs, so the two
 * sections look and behave identically — which is the point, since a visitor
 * has no idea one comes from a Trip document and the other from a Faq one.
 */
export interface FaqEntry {
  question: string;
  answer: string;
}

export default function FaqAccordion({
  entries,
  /** Used to key open state and ids when several lists sit on one page. */
  idPrefix,
}: {
  entries: FaqEntry[];
  idPrefix: string;
}) {
  if (entries.length === 0) return null;

  return (
    <ul className="overflow-hidden rounded-lg border border-hairline bg-white">
      {entries.map((entry, index) => (
        <li
          key={`${idPrefix}-${index}`}
          className="border-b border-hairline last:border-0"
        >
          <details className="group">
            <summary
              /*
               * `list-none` plus `marker:hidden` — Safari uses a
               * `::-webkit-details-marker` and everything else uses
               * `list-style`, so both have to be turned off or a stray triangle
               * appears beside the plus sign on one browser only.
               */
              className="flex cursor-pointer list-none items-start gap-4 p-5 font-semibold marker:hidden hover:bg-paper"
            >
              <span className="flex-1">{entry.question}</span>

              {/*
                Decorative. The open/closed state is already announced by
                `<summary>` itself, so a screen reader hearing "plus" as well
                would be hearing it twice.
              */}
              <span
                aria-hidden="true"
                className="text-muted transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>

            {/*
              `whitespace-pre-line` so an answer written as two paragraphs in
              the admin textarea renders as two paragraphs. Plain text, not
              Markdown — this is not passed to `dangerouslySetInnerHTML` and
              never will be.
            */}
            <p className="max-w-prose whitespace-pre-line px-5 pb-5 leading-relaxed text-muted">
              {entry.answer}
            </p>
          </details>
        </li>
      ))}
    </ul>
  );
}
