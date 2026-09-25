import type { ISiteSettings } from '../models/SiteSettings';
import type { IAffiliation } from '../models/Affiliation';
import type { EditorRow } from './tripEditor';

/**
 * The Settings editor's form shape.
 *
 * Type-only imports, so this is safe on both sides of the client boundary —
 * `import type` is erased at compile time and pulls no Mongoose into the
 * browser bundle. A value import of either model never would be.
 *
 * Every scalar is a string, because that is what an input holds. `foundingYear`
 * is a number on the model and a string here; it is parsed **once**, on the
 * server, by the Zod schema — the only place that can be trusted to do it. The
 * empty string means "not set" throughout, and the schema maps it back to
 * `undefined` before Mongoose sees it.
 *
 * Hand-written rather than derived from the schema, for the reason
 * `types/contentEditor.ts` records: an optional field's Zod *input* type is
 * `string | undefined`, and a form input never holds `undefined` — it holds
 * `''`. Deriving would describe a shape the form cannot produce.
 */

/** A repeatable row carries a `key` so React and the drag list can track it. */
export interface StatRow extends EditorRow {
  label: string;
  value: string;
}

export interface ValuePropRow extends EditorRow {
  title: string;
  body: string;
}

export interface CommitmentRow extends EditorRow {
  title: string;
  body: string;
  /** `will` or `wont`. A string here; the schema narrows it to the union. */
  kind: string;
}

export interface SafetyRow extends EditorRow {
  title: string;
  body: string;
}

export interface SocialRow extends EditorRow {
  platform: string;
  url: string;
}

/**
 * One affiliation's logo and registration number.
 *
 * Name, abbreviation and URL stay read-only: they are seeded facts about four
 * external bodies that do not change, and making them editable would invite a
 * typo in something that feeds `memberOf` in structured data.
 *
 * The logo and the number are the two things the client has and we do not, so
 * they are the two that are editable. Both are blank today, and both render as
 * nothing rather than as a placeholder until they are filled in.
 */
export interface AffiliationRow {
  id: string;
  name: string;
  abbreviation: string;
  logo: string;
  logoAlt: string;
  registrationNumber: string;
}

export interface SettingsEditorValues {
  // --- organisation and NAP ---
  legalName: string;
  tradingName: string;
  foundingYear: string;
  registrationNumber: string;
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
  phone: string;
  email: string;
  whatsappNumber: string;

  // --- descriptions ---
  shortDescription: string;
  longDescription: string;

  // --- homepage hero ---
  heroHeadline: string;
  heroSubheading: string;
  heroCtaLabel: string;
  riskReversalText: string;
  officeHours: string;

  // --- the named human ---
  contactPersonName: string;
  contactPersonRole: string;
  responseTimePromise: string;

  // --- policy copy ---
  depositPolicyText: string;
  cancellationPolicyText: string;

  // --- repeatable blocks ---
  headlineStats: StatRow[];
  valuePropositions: ValuePropRow[];
  commitments: CommitmentRow[];
  safetyPolicies: SafetyRow[];
  socialLinks: SocialRow[];

  // --- the four affiliation registration numbers ---
  affiliations: AffiliationRow[];
}

/** `undefined` and `null` both become `''` — one empty value, not two. */
function text(value: string | null | undefined): string {
  return value ?? '';
}

function numeric(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * A stable key for a row read from the database.
 *
 * Index-based, and that is safe **here** because it is assigned once when the
 * form loads and then travels with the row through every reorder — the key
 * identifies the row, not its position. New rows get a random key from
 * `newRowKey`. What would break is deriving the key from the index on every
 * render, which is the bug `updateRow` exists to avoid.
 */
function keyed(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

export function toSettingsValues(
  settings: ISiteSettings | null,
  affiliations: IAffiliation[]
): SettingsEditorValues {
  const sorted = <T extends { displayOrder: number }>(rows: T[] | undefined) =>
    [...(rows ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    legalName: text(settings?.legalName),
    tradingName: text(settings?.tradingName),
    foundingYear: numeric(settings?.foundingYear),
    registrationNumber: text(settings?.registrationNumber),
    streetAddress: text(settings?.streetAddress),
    addressLocality: text(settings?.addressLocality),
    addressRegion: text(settings?.addressRegion),
    postalCode: text(settings?.postalCode),
    addressCountry: text(settings?.addressCountry),
    phone: text(settings?.phone),
    email: text(settings?.email),
    whatsappNumber: text(settings?.whatsappNumber),

    shortDescription: text(settings?.shortDescription),
    longDescription: text(settings?.longDescription),

    heroHeadline: text(settings?.heroHeadline),
    heroSubheading: text(settings?.heroSubheading),
    heroCtaLabel: text(settings?.heroCtaLabel),
    riskReversalText: text(settings?.riskReversalText),
    officeHours: text(settings?.officeHours),

    contactPersonName: text(settings?.contactPersonName),
    contactPersonRole: text(settings?.contactPersonRole),
    responseTimePromise: text(settings?.responseTimePromise),

    depositPolicyText: text(settings?.depositPolicyText),
    cancellationPolicyText: text(settings?.cancellationPolicyText),

    headlineStats: sorted(settings?.headlineStats).map((stat, index) => ({
      key: keyed('stat', index),
      label: text(stat.label),
      value: text(stat.value),
    })),

    valuePropositions: sorted(settings?.valuePropositions).map((row, index) => ({
      key: keyed('value', index),
      title: text(row.title),
      body: text(row.body),
    })),

    commitments: sorted(settings?.commitments).map((row, index) => ({
      key: keyed('commitment', index),
      title: text(row.title),
      body: text(row.body),
      kind: row.kind ?? 'will',
    })),

    safetyPolicies: sorted(settings?.safetyPolicies).map((row, index) => ({
      key: keyed('safety', index),
      title: text(row.title),
      body: text(row.body),
    })),

    socialLinks: sorted(settings?.socialLinks).map((row, index) => ({
      key: keyed('social', index),
      platform: text(row.platform),
      url: text(row.url),
    })),

    affiliations: affiliations.map((affiliation) => ({
      id: String(affiliation._id),
      name: affiliation.name,
      abbreviation: affiliation.abbreviation,
      logo: text(affiliation.logo),
      logoAlt: text(affiliation.logoAlt),
      registrationNumber: text(affiliation.registrationNumber),
    })),
  };
}
