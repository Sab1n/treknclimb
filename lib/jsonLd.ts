import { ISiteSettings } from '../models/SiteSettings';
import { IAffiliation } from '../models/Affiliation';

export const SITE_URL = 'https://treknclimb.com';

/**
 * Structured data builders.
 *
 * Two rules run through everything here:
 *
 * 1. **Nothing is invented.** Every value comes from SiteSettings or the
 *    Affiliations collection, and a field with no data is left out entirely.
 *    `JSON.stringify` drops `undefined` properties, so an absent phone number
 *    simply does not appear rather than appearing empty. A wrong address in
 *    structured data is worse than no address: it damages entity resolution,
 *    which is the thing this markup exists to help.
 * 2. **No `aggregateRating`, ever.** Our ratings are imported from off-site
 *    platforms and Google's review-snippet policy requires first-party
 *    collection, so emitting them risks a manual action on a site whose entire
 *    value is organic traffic. See CLAUDE.md.
 */

/**
 * `Organization` / `TravelAgency` for the site.
 *
 * `TravelAgency` is a subtype of `LocalBusiness`, which is itself an
 * `Organization`, so one node carries the business identity, the NAP and the
 * memberships. It lives on the homepage, which is the URL search engines treat
 * as the entity's home; other pages reference it by `@id` rather than
 * repeating it.
 *
 * - `identifier` carries the company registration number — the strongest
 *   signal that this is a registered business rather than a page.
 * - `memberOf` carries the four licensing and membership bodies, each with its
 *   own registration number when the client has supplied one.
 * - `sameAs` carries every official profile, so the same entity on TripAdvisor
 *   and Facebook resolves to this one.
 *
 * The NAP must stay byte-identical with the footer and every off-site
 * directory, which is why both read the same SiteSettings document instead of
 * being typed twice.
 */
export function organizationJsonLd(
  settings: ISiteSettings | null,
  affiliations: IAffiliation[],
  /** Destination names, for `areaServed`. Passed in rather than hardcoded. */
  areaServed: string[] = []
): Record<string, unknown> {
  const name =
    settings?.tradingName || settings?.legalName || 'Trek & Climb Adventure';

  // Only build the address node if there is something in it. A PostalAddress
  // with one field is worse than none.
  const hasAddress =
    settings?.streetAddress ||
    settings?.addressLocality ||
    settings?.postalCode ||
    settings?.addressCountry;

  return {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    '@id': `${SITE_URL}/#organization`,
    name,
    legalName: settings?.legalName || undefined,
    url: SITE_URL,
    description: settings?.shortDescription || undefined,
    telephone: settings?.phone || undefined,
    email: settings?.email || undefined,
    foundingDate: settings?.foundingYear
      ? String(settings.foundingYear)
      : undefined,

    // The company registration number. Omitted until the client supplies it —
    // a placeholder licence number is a lie in structured data.
    identifier: settings?.registrationNumber || undefined,

    address: hasAddress
      ? {
          '@type': 'PostalAddress',
          streetAddress: settings?.streetAddress || undefined,
          addressLocality: settings?.addressLocality || undefined,
          addressRegion: settings?.addressRegion || undefined,
          postalCode: settings?.postalCode || undefined,
          addressCountry: settings?.addressCountry || undefined,
        }
      : undefined,

    memberOf: affiliations.length
      ? affiliations.map((affiliation) => ({
          '@type': 'Organization',
          name: affiliation.name,
          alternateName: affiliation.abbreviation,
          url: affiliation.url,
          identifier: affiliation.registrationNumber || undefined,
        }))
      : undefined,

    sameAs: settings?.socialLinks?.length
      ? [...settings.socialLinks]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((link) => link.url)
      : undefined,

    /*
     * `Place`, not `Country`. Three of the four destinations are countries and
     * Tibet is an autonomous region of China — typing it as a country would be
     * a factual error asserted in machine-readable markup, which is the one
     * place a small inaccuracy is read literally and repeated.
     */
    areaServed: areaServed.length
      ? areaServed.map((placeName) => ({ '@type': 'Place', name: placeName }))
      : undefined,
  };
}

/**
 * The homepage `WebSite` node.
 *
 * Deliberately without `SearchAction`. That property advertises a site-wide
 * search endpoint, and `/trips` is a facet listing, not a text search —
 * claiming one that does not exist is the kind of small dishonesty in
 * structured data that costs trust across a whole site.
 */
export function websiteJsonLd(
  settings: ISiteSettings | null
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name:
      settings?.tradingName || settings?.legalName || 'Trek & Climb Adventure',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

/**
 * `FAQPage` for a list of questions and answers.
 *
 * Emitted by `/faq`, by a destination page that has entries, and — through its
 * own inline copy — by the trip page. This builder exists so the first two
 * share one shape; the trip page predates it and builds the same structure from
 * its embedded array.
 *
 * Returns null for an empty list rather than a `FAQPage` with no
 * `mainEntity`, which is invalid markup and reads to a validator as a broken
 * page rather than a page without FAQs.
 *
 * **One `FAQPage` node per page.** Google's guidance is that the markup
 * describes the page, so a destination page emitting one node for its FAQ
 * section is correct and emitting two would not be.
 */
export function faqPageJsonLd(
  entries: { question: string; answer: string }[],
  /** Canonical URL of the page the markup describes. */
  pageUrl: string
): Record<string, unknown> | null {
  if (entries.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

/**
 * Serialises structured data for a `<script type="application/ld+json">`.
 *
 * ## Why this is not plain `JSON.stringify`
 *
 * An HTML parser looks for the literal characters `</script` inside a script
 * element and ends the element there, before any JSON parsing happens. So an
 * FAQ answer containing `</script>` — or the string `<!--` — closes the tag
 * early and drops the rest of the JSON into the document as markup. The
 * content here is admin-authored free text, which is exactly the kind that
 * eventually contains an angle bracket.
 *
 * Escaping `<` as `\u003c` is the standard fix and is invisible to a JSON
 * parser: `"\u003c/script>"` is the same string to a consumer and is inert to
 * the HTML parser. `>` and `&` are escaped too, which costs nothing and closes
 * the `]]>` and entity cases as well.
 *
 * This is the one place `dangerouslySetInnerHTML` is used deliberately, and it
 * is not the case CLAUDE.md forbids. That rule is about *post bodies* — visitor-
 * facing prose, which goes through the Markdown parser instead. Here the input
 * is an object we built, serialised by `JSON.stringify`, so the output is
 * always valid JSON and never arbitrary markup.
 */
/*
 * String.raw below, not a quoted escape. The replacement must be the six
 * characters \u003c, a JSON escape sequence. A quoted '\u003c' in source is
 * the single character <, which makes the replace a no-op that reads exactly
 * like a working escape. That is what shipped here first time, and it was
 * caught by asserting on the output rather than by reading the code.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, String.raw`\u003c`)
    .replace(/>/g, String.raw`\u003e`)
    .replace(/&/g, String.raw`\u0026`);
}
