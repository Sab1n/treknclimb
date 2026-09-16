import { cache } from 'react';

import { connectDB } from '../db';
import Faq, { IFaq } from '../../models/Faq';

/**
 * Public reads for FAQ entries.
 *
 * Separate from `lib/queries/adminContent.ts`, which returns whole documents
 * with unpopulated refs because that is what an editor writes back. These
 * return published entries in display order and nothing else.
 *
 * ## Trip-associated entries are deliberately not read here
 *
 * Trip pages render `Trip.faqs`, the embedded array, and that is the only
 * source for a trip. CLAUDE.md settles it — "**Embedded, not separate
 * collections:** itinerary days, gallery images, group pricing tiers, trip
 * FAQs" — and `Faq.trip` is a single ref, so it could not express "this answer
 * applies to these five trips" even if we wanted a second source. It offers no
 * reuse the embedded array does not, at the cost of two places to look. See the
 * note in `lib/revalidation.ts`.
 *
 * ## `cache()`, not `unstable_cache`
 *
 * Next dedupes `fetch()` automatically and does nothing for Mongoose. React's
 * `cache()` makes the query run once per render rather than once per caller,
 * which matters because the destination page asks for the same entries twice —
 * once to render them and once to build the JSON-LD.
 */

/**
 * Entries for the general `/faq` page: published, attached to nothing.
 *
 * Both associations must be null. An entry attached to a destination is
 * answering a question about that destination and belongs on its page, not
 * mixed into a sitewide list where it would read as a general policy.
 */
export const getSitewideFaqs = cache(async (): Promise<IFaq[]> => {
  await connectDB();

  return Faq.find({ status: 'published', destination: null })
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean<IFaq[]>()
    .exec();
});

/**
 * Entries for one destination's page.
 *
 * Not filtered on `trip: null`. The model allows both associations at once, and
 * an entry carrying both is one the editor deliberately put in two places —
 * excluding it here would silently drop it from one of them. The trip half is
 * simply never read, because trip pages use the embedded array.
 */
export const getFaqsForDestination = cache(
  async (destinationId: string): Promise<IFaq[]> => {
    await connectDB();

    try {
      return await Faq.find({ status: 'published', destination: destinationId })
        .sort({ displayOrder: 1, createdAt: 1 })
        .lean<IFaq[]>()
        .exec();
    } catch {
      /*
       * A malformed id makes Mongoose throw a CastError rather than match
       * nothing. An FAQ section is supplementary — it must never be the reason
       * a destination page 500s — so a failed lookup renders no section.
       */
      return [];
    }
  }
);

/**
 * Groups entries by category, preserving display order within each.
 *
 * Category is optional on the model, so entries without one are collected under
 * a final unnamed group rather than being dropped or given an invented heading.
 * The group order follows first appearance, which means `displayOrder` controls
 * the order of the categories as well as the entries inside them — one number
 * to reason about instead of two.
 */
export interface FaqGroup {
  /** Null for entries with no category. Rendered without a heading. */
  category: string | null;
  entries: IFaq[];
}

export function groupFaqsByCategory(entries: IFaq[]): FaqGroup[] {
  const groups: FaqGroup[] = [];
  const byCategory = new Map<string, FaqGroup>();

  for (const entry of entries) {
    const key = entry.category?.trim() || '';

    let group = byCategory.get(key);

    if (!group) {
      group = { category: key || null, entries: [] };
      byCategory.set(key, group);
      groups.push(group);
    }

    group.entries.push(entry);
  }

  // Uncategorised entries last, wherever they happened to appear.
  return groups.sort((a, b) => {
    if (a.category === null) return 1;
    if (b.category === null) return -1;
    return 0;
  });
}
