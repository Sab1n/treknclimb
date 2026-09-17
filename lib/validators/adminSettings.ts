import { z } from 'zod';

/**
 * The Settings editor's schema.
 *
 * ## There is no create and no delete
 *
 * `SiteSettings` is a singleton — `key: 'site'`, guarded on the model by
 * `unique` + `immutable` + a one-value `enum` together, so a second document
 * cannot be created and this one cannot be renamed out of the way. So this
 * schema serves exactly one verb, `PATCH`, and there is deliberately no
 * `POST` route beside it: an endpoint that exists and always refuses is worse
 * than one that does not exist, because it invites someone to work out why.
 *
 * ## Everything is optional
 *
 * Almost every field on the model is optional, and that is not laziness — the
 * record is created empty by the seed and filled in over time, so a
 * half-completed settings document has to be saveable. A client who cannot save
 * the two fields they have because a third is blank simply stops using the
 * screen.
 *
 * The public pages already cope: every consumer reads `settings?.field` and
 * omits the block when it is missing. That is what makes optional-everywhere
 * safe here and would not be safe on a Trip.
 */

/** `''` → `undefined`. Applied *before* `.optional()`, never after. */
const emptyToUndefined = (value: string) =>
  value.trim() === '' ? undefined : value.trim();

/**
 * An optional free-text field.
 *
 * The order is the bug CLAUDE.md records:
 * `z.string().optional().or(z.literal('').transform(...))` looks right and is
 * not — `.or()` tries the left branch first, `z.string().optional()` accepts
 * `''`, and the transform never runs. Here the consequence would be an empty
 * string stored where the field should be unset, which makes every
 * `{settings?.heroHeadline && ...}` guard on the public site render an empty
 * element instead of falling back.
 */
const optionalText = (max = 500) =>
  z.string().max(max).transform(emptyToUndefined).optional();

/** Required inside a repeatable row — an empty row is a data-entry mistake. */
const rowText = (max = 500) =>
  z.string().trim().min(1, 'This cannot be blank').max(max);

/**
 * The founding year.
 *
 * Bounded rather than left as any number: a typo'd `20004` would be emitted as
 * `foundingDate` in Organization structured data, where a nonsense value is
 * read literally by a machine and repeated.
 */
const foundingYearSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : Number(value)))
  .refine(
    (value) => value === undefined || Number.isInteger(value),
    'Founding year must be a whole number'
  )
  .refine(
    (value) =>
      value === undefined || (value >= 1900 && value <= new Date().getFullYear()),
    `Founding year must be between 1900 and ${new Date().getFullYear()}`
  );

/**
 * An email address, or nothing.
 *
 * Checked because it is printed on the legal pages as the address a visitor
 * writes to about their own data. A privacy policy pointing at a malformed
 * address is a broken promise rather than a cosmetic error.
 */
const emailSchema = z
  .string()
  .trim()
  .transform(emptyToUndefined)
  .optional()
  .refine(
    (value) => value === undefined || z.email().safeParse(value).success,
    'That does not look like an email address'
  );

/**
 * An absolute URL, or nothing.
 *
 * Social links feed `sameAs` in Organization structured data, where a relative
 * path is meaningless — the property asserts "this entity is also at this URL".
 * The scheme check also keeps `javascript:` out of an href the admin controls.
 */
const absoluteUrl = z
  .string()
  .trim()
  .min(1, 'A link is required')
  .max(500)
  .refine(
    (value) => /^https?:\/\//i.test(value),
    'Must be a full URL beginning with http:// or https://'
  );

export const adminSettingsSchema = z.object({
  // --- organisation and NAP ---
  legalName: optionalText(200),
  tradingName: optionalText(200),
  foundingYear: foundingYearSchema,
  registrationNumber: optionalText(100),
  streetAddress: optionalText(300),
  addressLocality: optionalText(120),
  addressRegion: optionalText(120),
  postalCode: optionalText(40),
  addressCountry: optionalText(120),
  phone: optionalText(60),
  email: emailSchema,
  whatsappNumber: optionalText(60),

  // --- descriptions ---
  shortDescription: optionalText(400),
  // The company story. Long, and rendered through the Markdown subset.
  longDescription: optionalText(20_000),

  // --- homepage hero ---
  heroHeadline: optionalText(200),
  heroSubheading: optionalText(400),
  heroCtaLabel: optionalText(80),
  riskReversalText: optionalText(300),
  officeHours: optionalText(200),

  // --- the named human ---
  contactPersonName: optionalText(120),
  contactPersonRole: optionalText(120),
  responseTimePromise: optionalText(300),

  // --- policy copy ---
  depositPolicyText: optionalText(4000),
  cancellationPolicyText: optionalText(4000),

  // --- repeatable blocks ---
  // `displayOrder` is not accepted from the client: it is the array index,
  // assigned by the route. Sending it would let the stored order disagree with
  // the order the admin just dragged things into.
  headlineStats: z
    .array(z.object({ label: rowText(120), value: rowText(60) }))
    .max(8),

  valuePropositions: z
    .array(z.object({ title: rowText(160), body: rowText(1000) }))
    .max(12),

  commitments: z
    .array(
      z.object({
        title: rowText(160),
        body: rowText(1000),
        kind: z.enum(['will', 'wont'], {
          error: 'Choose whether this is something you do or refuse',
        }),
      })
    )
    .max(20),

  safetyPolicies: z
    .array(z.object({ title: rowText(160), body: rowText(2000) }))
    .max(12),

  socialLinks: z
    .array(z.object({ platform: rowText(60), url: absoluteUrl }))
    .max(12),

  /**
   * The four affiliation registration numbers.
   *
   * Addressed by id rather than by position, so a reordered or re-seeded
   * affiliation list cannot write TAAN's number onto the NMA record. The route
   * matches each id against the stored documents and ignores anything it does
   * not recognise.
   */
  affiliations: z
    .array(
      z.object({
        id: z.string().trim().regex(/^[0-9a-f]{24}$/i, 'Bad record reference'),
        registrationNumber: optionalText(100),
      })
    )
    .max(20),
});

export type AdminSettingsInput = z.input<typeof adminSettingsSchema>;
export type AdminSettingsOutput = z.output<typeof adminSettingsSchema>;
