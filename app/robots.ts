import type { MetadataRoute } from 'next';

import { SITE_URL } from '../lib/jsonLd';

/**
 * `/robots.txt`.
 *
 * Same file convention as `app/sitemap.ts` — return data, Next serialises it.
 * The path is `/robots.txt`, which is why it appears in the `STATIC_PATHS` set
 * in `lib/livePaths.ts`.
 *
 * ## What is disallowed, and what a disallow actually does
 *
 * `/admin` and `/api` only. A `Disallow` is a **prefix match**, so `/admin`
 * covers `/admin/inquiries` and everything under it without a wildcard.
 *
 * It is worth being clear about what this buys, because it is easy to
 * overestimate: `robots.txt` is a crawling instruction, not an access control.
 * It asks well-behaved crawlers not to fetch those paths. It does not stop
 * anyone fetching them, and it is a public file listing the paths we would
 * rather nobody looked at. The admin tree is protected by the session guard in
 * three places — middleware, the shell, and every page and route handler
 * calling `getAdminSession()` — and none of that depends on this file.
 *
 * Two things are deliberately **not** disallowed:
 *
 * - **The noindexed confirmation pages** (`/contact/confirmation`,
 *   `/newsletter/confirmed`). They carry `robots: { index: false }` in their
 *   metadata, and a crawler has to fetch a page to read that tag. Blocking
 *   them here would prevent the noindex being seen — the classic way a page
 *   ends up indexed as a bare URL with no snippet.
 * - **Filtered listing URLs** (`/trips?destination=nepal`). Same reasoning:
 *   they canonical back to `/trips`, and a crawler that cannot fetch them
 *   cannot read the canonical.
 *
 * ## The AI crawlers
 *
 * Every one of them is set to **allow**, which is the current state rather
 * than a recommendation — see the note in CLAUDE.md's open items. They are
 * named explicitly rather than left to the `*` rule so that changing the
 * policy for one of them is a one-line edit against a list that already
 * exists, and so the file records that the question was considered.
 *
 * The names are not interchangeable. They fall into two groups that do
 * different jobs for the same company, and a single "allow AI or not" decision
 * cannot express the difference:
 *
 * - **Training corpus collectors** — GPTBot, ClaudeBot, Google-Extended,
 *   CCBot, Bytespider, Applebot-Extended. These take content to train on.
 *   Nothing comes back: no link, no citation, no visit.
 * - **Answer-time retrievers** — OAI-SearchBot, ChatGPT-User, Claude-User,
 *   PerplexityBot. These fetch a page because a person asked a question *now*,
 *   and they are the ones that can cite and link. Blocking these is the same
 *   shape of decision as blocking Googlebot.
 *
 * `Google-Extended` is the sharpest example of why the distinction matters: it
 * controls Gemini training and AI Overviews grounding **only**, and has no
 * effect on normal Google Search ranking. Blocking it does not remove the site
 * from Google; blocking `Googlebot` would, and the two are one careless edit
 * apart.
 */

/**
 * The bots named individually.
 *
 * Kept as a list so the rules are generated rather than typed out ten times —
 * a hand-written block is where one of them quietly ends up with a different
 * `disallow` from the rest.
 */
const AI_CRAWLERS = [
  // OpenAI — training, search index, and live user-initiated fetches.
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic — training, and live user-initiated fetches.
  'ClaudeBot',
  'Claude-User',
  // Perplexity — answer-time retrieval.
  'PerplexityBot',
  // Google's AI products only. Not Google Search.
  'Google-Extended',
  // Common Crawl. Not an AI company, but the corpus most models are built on.
  'CCBot',
  // ByteDance.
  'Bytespider',
  // Apple Intelligence training.
  'Applebot-Extended',
];

/**
 * Applied to every rule, including the AI ones.
 *
 * A named `User-agent` block **replaces** the `*` block for that agent rather
 * than adding to it — a crawler obeys the most specific group that matches it
 * and ignores the others entirely. So naming GPTBot to allow it would, without
 * this, also hand it `/admin` and `/api`, which no other crawler is given. The
 * rules are shared for that reason and not for tidiness.
 */
const DISALLOW = ['/admin', '/api'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
