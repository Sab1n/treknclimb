'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import type {
  SettingsEditorValues,
  StatRow,
  ValuePropRow,
  CommitmentRow,
  SafetyRow,
  SocialRow,
} from '../../types/settingsEditor';
import { newRowKey } from '../../types/tripEditor';
import {
  RepeatableList,
  AddRowButton,
  updateRow,
} from './trip/RepeatableList';
import UnsavedChangesGuard from './UnsavedChangesGuard';
import SaveBar from './SaveBar';
import { TextField, TextAreaField, SelectField, FieldRow } from './fields';
import RichTextEditor from './RichTextEditor';
import { describeSaveFailure } from './saveFailure';

/**
 * The site settings editor.
 *
 * ## One screen, no create and no delete
 *
 * `SiteSettings` is a singleton, so this is the rare admin screen with no list
 * in front of it and no record to choose — `/admin/settings` opens straight
 * into the form. There is no "New" button and no delete, because there is
 * exactly one document and it is seeded rather than created.
 *
 * ## Sections are grouped by where the fields render, not by data type
 *
 * The instinct is to group by shape — all the text fields, then all the
 * repeatable blocks. That would be wrong here. A client opening this screen is
 * not thinking "I want to edit a string", they are thinking "the homepage
 * headline is out of date", and the only way to answer that is to arrange the
 * form the way the site is arranged.
 *
 * So every section says which page it feeds, and the sections are ordered the
 * way someone would walk the site. It is also why NAP sits in its own block
 * with a warning: those four fields have to stay byte-identical with Google
 * Business Profile and every directory, which is a constraint no individual
 * input can express.
 *
 * ## Single column, deliberately
 *
 * Most of what is here is prose — a story, policy copy, six commitments. A
 * two-column layout halves the line length of every textarea to save vertical
 * space on a screen that is visited a handful of times a year.
 */
export default function SettingsEditor({
  initialValues,
  updatedAt,
}: {
  initialValues: SettingsEditorValues;
  updatedAt: string;
}) {
  const router = useRouter();

  const [values, setValues] = useState(initialValues);
  const [baseline, setBaseline] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [revalidated, setRevalidated] = useState<string[] | null>(null);

  function set<K extends keyof SettingsEditorValues>(
    key: K,
    value: SettingsEditorValues[K]
  ) {
    setValues((current) => ({ ...current, [key]: value }));

    setErrors((current) => {
      if (!(key in current)) return current;

      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(baseline),
    [values, baseline]
  );

  async function save() {
    setSaving(true);
    setFormError(null);
    setErrors({});
    setRevalidated(null);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        /*
         * `key` is stripped from every repeatable row. It is a client-side
         * React identity, not data — sending it would fail the schema, which
         * describes exactly the fields the model stores.
         */
        body: JSON.stringify(toPayload(values)),
      });

      if (response.status === 404) {
        /*
         * Either the session was revoked or the settings record is missing.
         * A full load rather than a router push — the cookie may be invalid and
         * a client navigation would render from a stale cache.
         */
        const result = await response.json().catch(() => ({}));

        if (result.error) {
          setFormError(result.error);
          return;
        }

        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin');
        return;
      }

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const failure = describeSaveFailure(response.status, result);

        setErrors(failure.fieldErrors);
        setFormError(failure.message);
        return;
      }

      setBaseline(values);
      setSavedAt(new Date().toISOString());
      setRevalidated((result.revalidated ?? []) as string[]);
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesGuard
        when={dirty && !saving}
        message="Site settings have unsaved changes. Leave the page and they will be lost."
      />

      <SaveBar
        dirty={dirty}
        saving={saving}
        savedAt={savedAt}
        updatedAt={updatedAt}
        formError={formError}
        errorCount={Object.keys(errors).length}
        onSave={save}
        label="settings"
      />

      {/*
        What the save actually purged. Worth showing rather than assuming,
        because the set differs per field — editing the hero headline should
        not regenerate the privacy policy, and seeing which pages moved is the
        only feedback that a settings change reached the public site.
      */}
      {revalidated && (
        <p
          role="status"
          className="rounded border border-confirmed/30 bg-confirmed/5 px-4 py-3 text-sm"
        >
          {revalidated.length > 0 ? (
            <>
              Saved. Rebuilt{' '}
              <span className="font-mono">{revalidated.join(', ')}</span>.
            </>
          ) : (
            <>Saved. Nothing changed that any public page renders.</>
          )}
        </p>
      )}

      <div className="flex max-w-3xl flex-col gap-12 pb-16">
        {/* ============ organisation and NAP ============ */}
        <Section
          title="Organisation"
          renders="Structured data on every page · About · Privacy policy · Terms"
        >
          <p className="max-w-prose rounded border border-hairline bg-white px-4 py-3 text-sm text-muted">
            The name, address and phone here must be{' '}
            <strong className="font-semibold text-ink">byte-identical</strong> to
            your Google Business Profile, TripAdvisor and every directory
            listing. Search engines use them to decide that all those listings
            are the same company; a different abbreviation or a missing comma
            weakens that.
          </p>

          <FieldRow>
            <TextField
              label="Legal name"
              id="legalName"
              value={values.legalName}
              onChange={(v) => set('legalName', v)}
              error={errors.legalName}
              hint="As registered. Appears on the legal pages."
            />
            <TextField
              label="Trading name"
              id="tradingName"
              value={values.tradingName}
              onChange={(v) => set('tradingName', v)}
              error={errors.tradingName}
              hint="If different from the legal name. Falls back to it."
            />
          </FieldRow>

          <FieldRow>
            <TextField
              label="Founding year"
              id="foundingYear"
              value={values.foundingYear}
              onChange={(v) => set('foundingYear', v)}
              error={errors.foundingYear}
              hint="Shown as “since 2004” on About, and as foundingDate in structured data. Leave blank rather than guessing."
            />
            <TextField
              label="Company registration number"
              id="registrationNumber"
              mono
              value={values.registrationNumber}
              onChange={(v) => set('registrationNumber', v)}
              error={errors.registrationNumber}
              hint="The strongest single trust signal on the site. Blank until it is the real one."
            />
          </FieldRow>

          <TextField
            label="Street address"
            id="streetAddress"
            value={values.streetAddress}
            onChange={(v) => set('streetAddress', v)}
            error={errors.streetAddress}
          />

          <FieldRow>
            <TextField
              label="City or town"
              id="addressLocality"
              value={values.addressLocality}
              onChange={(v) => set('addressLocality', v)}
              error={errors.addressLocality}
              hint="Also the “Run from …” line on About."
            />
            <TextField
              label="Region or province"
              id="addressRegion"
              value={values.addressRegion}
              onChange={(v) => set('addressRegion', v)}
              error={errors.addressRegion}
            />
          </FieldRow>

          <FieldRow>
            <TextField
              label="Postal code"
              id="postalCode"
              value={values.postalCode}
              onChange={(v) => set('postalCode', v)}
              error={errors.postalCode}
            />
            <TextField
              label="Country"
              id="addressCountry"
              value={values.addressCountry}
              onChange={(v) => set('addressCountry', v)}
              error={errors.addressCountry}
            />
          </FieldRow>

          <FieldRow>
            <TextField
              label="Phone"
              id="phone"
              mono
              value={values.phone}
              onChange={(v) => set('phone', v)}
              error={errors.phone}
              hint="Full international format. Currently used in structured data only."
            />
            <TextField
              label="Email"
              id="email"
              value={values.email}
              onChange={(v) => set('email', v)}
              error={errors.email}
              hint="Printed on the legal pages as the address for data questions."
            />
          </FieldRow>

          <TextField
            label="WhatsApp number"
            id="whatsappNumber"
            mono
            value={values.whatsappNumber}
            onChange={(v) => set('whatsappNumber', v)}
            error={errors.whatsappNumber}
            hint="Stored but not yet used — the WhatsApp buttons read an environment variable. Filling this in changes nothing on the site today."
          />
        </Section>

        {/* ============ descriptions ============ */}
        <Section title="Descriptions" renders="About · Homepage · Structured data">
          <TextAreaField
            label="Short description"
            id="shortDescription"
            rows={3}
            maxLength={300}
            value={values.shortDescription}
            onChange={(v) => set('shortDescription', v)}
            error={errors.shortDescription}
            hint="One or two sentences. Used under the About heading and as the organisation description in structured data, so it is quoted off-site."
          />

          {/*
            The rich text editor, not a textarea. This field renders through
            `PostBody` on /about, so it is one of the three places where the
            Markdown subset is actually interpreted rather than printed.
          */}
          <RichTextEditor
            label="The company story"
            id="longDescription"
            value={values.longDescription}
            onChange={(v) => set('longDescription', v)}
            error={errors.longDescription}
            hint="The “How this started” section on About."
            minHeight="22rem"
          />
        </Section>

        {/* ============ homepage hero ============ */}
        <Section title="Homepage hero" renders="Homepage">
          <TextField
            label="Headline"
            id="heroHeadline"
            value={values.heroHeadline}
            onChange={(v) => set('heroHeadline', v)}
            error={errors.heroHeadline}
          />

          <TextAreaField
            label="Subheading"
            id="heroSubheading"
            rows={3}
            maxLength={300}
            value={values.heroSubheading}
            onChange={(v) => set('heroSubheading', v)}
            error={errors.heroSubheading}
          />

          <FieldRow>
            <TextField
              label="CTA button label"
              id="heroCtaLabel"
              value={values.heroCtaLabel}
              onChange={(v) => set('heroCtaLabel', v)}
              error={errors.heroCtaLabel}
              hint="“Get a quote” or “Get my free itinerary”. Never “Book now” — there is no checkout behind it."
            />
            <TextField
              label="Office hours"
              id="officeHours"
              value={values.officeHours}
              onChange={(v) => set('officeHours', v)}
              error={errors.officeHours}
            />
          </FieldRow>

          <TextAreaField
            label="Risk reversal line"
            id="riskReversalText"
            rows={2}
            maxLength={200}
            value={values.riskReversalText}
            onChange={(v) => set('riskReversalText', v)}
            error={errors.riskReversalText}
            hint="Sits directly under the CTA. It answers the biggest objection, which is not price — it is what happens when they press the button."
          />
        </Section>

        {/* ============ the named human ============ */}
        <Section title="Who replies" renders="Homepage · About">
          <FieldRow>
            <TextField
              label="Contact person name"
              id="contactPersonName"
              value={values.contactPersonName}
              onChange={(v) => set('contactPersonName', v)}
              error={errors.contactPersonName}
              hint="A named person beside the CTA. Leave blank rather than inventing one."
            />
            <TextField
              label="Their role"
              id="contactPersonRole"
              value={values.contactPersonRole}
              onChange={(v) => set('contactPersonRole', v)}
              error={errors.contactPersonRole}
            />
          </FieldRow>

          <TextField
            label="Response-time promise"
            id="responseTimePromise"
            value={values.responseTimePromise}
            onChange={(v) => set('responseTimePromise', v)}
            error={errors.responseTimePromise}
            hint="Speed is a proxy for legitimacy when a stranger cannot verify you any other way. Promise something you will keep."
          />
        </Section>

        {/* ============ headline stats ============ */}
        <Section
          title="Headline stats"
          renders="Homepage · About"
          note="Only add numbers you can stand behind. An invented “3,800+ trekkers” is the one kind of social proof this site will not carry — leave the list empty and the row disappears."
        >
          <RepeatableList
            rows={values.headlineStats}
            onChange={(rows) => set('headlineStats', rows)}
            label="Headline stats"
            rowLabel={(row, index) => row.label || `Stat ${index + 1}`}
            empty="No stats. The row is hidden on both pages."
          >
            {(row) => (
              <FieldRow>
                <TextField
                  label="Label"
                  id={`stat-${row.key}-label`}
                  required
                  value={row.label}
                  onChange={(v) =>
                    set(
                      'headlineStats',
                      updateRow<StatRow>(values.headlineStats, row.key, { label: v })
                    )
                  }
                  error={rowError(errors, 'headlineStats', values.headlineStats, row.key, 'label')}
                />
                <TextField
                  label="Value"
                  id={`stat-${row.key}-value`}
                  required
                  mono
                  value={row.value}
                  onChange={(v) =>
                    set(
                      'headlineStats',
                      updateRow<StatRow>(values.headlineStats, row.key, { value: v })
                    )
                  }
                  error={rowError(errors, 'headlineStats', values.headlineStats, row.key, 'value')}
                />
              </FieldRow>
            )}
          </RepeatableList>

          <AddRowButton
            onClick={() =>
              set('headlineStats', [
                ...values.headlineStats,
                { key: newRowKey('stat'), label: '', value: '' },
              ])
            }
          >
            Add a stat
          </AddRowButton>
        </Section>

        {/* ============ value propositions ============ */}
        <Section
          title="Value propositions"
          renders="Homepage"
          note="Reasons to choose this operator, written to persuade. The About page’s commitments list is a different thing and lives below."
        >
          <RepeatableList
            rows={values.valuePropositions}
            onChange={(rows) => set('valuePropositions', rows)}
            label="Value propositions"
            rowLabel={(row, index) => row.title || `Point ${index + 1}`}
            empty="No value propositions. The homepage section is hidden."
          >
            {(row) => (
              <div className="flex flex-col gap-4">
                <TextField
                  label="Title"
                  id={`value-${row.key}-title`}
                  required
                  value={row.title}
                  onChange={(v) =>
                    set(
                      'valuePropositions',
                      updateRow<ValuePropRow>(values.valuePropositions, row.key, {
                        title: v,
                      })
                    )
                  }
                  error={rowError(errors, 'valuePropositions', values.valuePropositions, row.key, 'title')}
                />
                <TextAreaField
                  label="Body"
                  id={`value-${row.key}-body`}
                  required
                  rows={3}
                  maxLength={400}
                  value={row.body}
                  onChange={(v) =>
                    set(
                      'valuePropositions',
                      updateRow<ValuePropRow>(values.valuePropositions, row.key, {
                        body: v,
                      })
                    )
                  }
                  error={rowError(errors, 'valuePropositions', values.valuePropositions, row.key, 'body')}
                />
              </div>
            )}
          </RepeatableList>

          <AddRowButton
            onClick={() =>
              set('valuePropositions', [
                ...values.valuePropositions,
                { key: newRowKey('value'), title: '', body: '' },
              ])
            }
          >
            Add a value proposition
          </AddRowButton>
        </Section>

        {/* ============ commitments ============ */}
        <Section
          title="What we will and will not do"
          renders="About"
          note="Each entry is marked as something you do or something you refuse, and the page lays the two out side by side. The refusals are the half that carries weight — anyone can list what they do."
        >
          <RepeatableList
            rows={values.commitments}
            onChange={(rows) => set('commitments', rows)}
            label="Commitments"
            rowLabel={(row, index) =>
              `${row.kind === 'wont' ? 'Will not' : 'Will'} — ${row.title || `Entry ${index + 1}`}`
            }
            empty="No commitments. The About section is hidden."
          >
            {(row) => (
              <div className="flex flex-col gap-4">
                <FieldRow>
                  <TextField
                    label="Title"
                    id={`commitment-${row.key}-title`}
                    required
                    value={row.title}
                    onChange={(v) =>
                      set(
                        'commitments',
                        updateRow<CommitmentRow>(values.commitments, row.key, {
                          title: v,
                        })
                      )
                    }
                    error={rowError(errors, 'commitments', values.commitments, row.key, 'title')}
                  />
                  <SelectField
                    label="Which column"
                    id={`commitment-${row.key}-kind`}
                    required
                    value={row.kind}
                    onChange={(v) =>
                      set(
                        'commitments',
                        updateRow<CommitmentRow>(values.commitments, row.key, {
                          kind: v,
                        })
                      )
                    }
                    options={[
                      { value: 'will', label: 'Something we do' },
                      { value: 'wont', label: 'Something we will not do' },
                    ]}
                    error={rowError(errors, 'commitments', values.commitments, row.key, 'kind')}
                  />
                </FieldRow>

                <TextAreaField
                  label="Body"
                  id={`commitment-${row.key}-body`}
                  required
                  rows={3}
                  maxLength={600}
                  value={row.body}
                  onChange={(v) =>
                    set(
                      'commitments',
                      updateRow<CommitmentRow>(values.commitments, row.key, {
                        body: v,
                      })
                    )
                  }
                  error={rowError(errors, 'commitments', values.commitments, row.key, 'body')}
                />
              </div>
            )}
          </RepeatableList>

          <AddRowButton
            onClick={() =>
              set('commitments', [
                ...values.commitments,
                { key: newRowKey('commitment'), title: '', body: '', kind: 'will' },
              ])
            }
          >
            Add a commitment
          </AddRowButton>
        </Section>

        {/* ============ safety ============ */}
        <Section
          title="Safety and responsibility"
          renders="About"
          note="Insurance and evacuation, guide certification, porter welfare. These are claims about how people are treated and how they are kept safe — they must be accurate, not approximate."
        >
          <RepeatableList
            rows={values.safetyPolicies}
            onChange={(rows) => set('safetyPolicies', rows)}
            label="Safety policies"
            rowLabel={(row, index) => row.title || `Policy ${index + 1}`}
            empty="No safety policies. The About section is hidden."
          >
            {(row) => (
              <div className="flex flex-col gap-4">
                <TextField
                  label="Title"
                  id={`safety-${row.key}-title`}
                  required
                  value={row.title}
                  onChange={(v) =>
                    set(
                      'safetyPolicies',
                      updateRow<SafetyRow>(values.safetyPolicies, row.key, {
                        title: v,
                      })
                    )
                  }
                  error={rowError(errors, 'safetyPolicies', values.safetyPolicies, row.key, 'title')}
                />
                <TextAreaField
                  label="Body"
                  id={`safety-${row.key}-body`}
                  required
                  rows={4}
                  maxLength={1200}
                  value={row.body}
                  onChange={(v) =>
                    set(
                      'safetyPolicies',
                      updateRow<SafetyRow>(values.safetyPolicies, row.key, {
                        body: v,
                      })
                    )
                  }
                  error={rowError(errors, 'safetyPolicies', values.safetyPolicies, row.key, 'body')}
                />
              </div>
            )}
          </RepeatableList>

          <AddRowButton
            onClick={() =>
              set('safetyPolicies', [
                ...values.safetyPolicies,
                { key: newRowKey('safety'), title: '', body: '' },
              ])
            }
          >
            Add a safety policy
          </AddRowButton>
        </Section>

        {/* ============ affiliations ============ */}
        <Section
          title="Affiliation registration numbers"
          renders="About · Structured data"
          note="Four fixed bodies, seeded once. Only the number is editable here — the name, website and logo are facts about an external organisation and are not yours to change. A blank number renders as “to be confirmed” rather than being faked."
        >
          <div className="flex flex-col gap-4">
            {values.affiliations.map((affiliation, index) => (
              <FieldRow key={affiliation.id}>
                <div className="self-center">
                  <p className="text-sm font-semibold">{affiliation.name}</p>
                  <p className="text-xs text-muted">{affiliation.abbreviation}</p>
                </div>

                <TextField
                  label="Registration number"
                  id={`affiliation-${affiliation.id}`}
                  mono
                  value={affiliation.registrationNumber}
                  onChange={(v) =>
                    set(
                      'affiliations',
                      values.affiliations.map((row) =>
                        row.id === affiliation.id
                          ? { ...row, registrationNumber: v }
                          : row
                      )
                    )
                  }
                  error={errors[`affiliations.${index}.registrationNumber`]}
                />
              </FieldRow>
            ))}

            {values.affiliations.length === 0 && (
              <p className="rounded-lg border border-dashed border-hairline bg-white px-4 py-6 text-center text-sm text-muted">
                No affiliations are seeded. Run the seed script first.
              </p>
            )}
          </div>
        </Section>

        {/* ============ social links ============ */}
        <Section
          title="Social profiles"
          renders="Structured data"
          note="These feed sameAs, which tells a search engine that this company and those profiles are one entity. A dead profile left here weakens that rather than helping, so remove one when it closes."
        >
          <RepeatableList
            rows={values.socialLinks}
            onChange={(rows) => set('socialLinks', rows)}
            label="Social profiles"
            rowLabel={(row, index) => row.platform || `Profile ${index + 1}`}
            empty="No profiles. Nothing is emitted."
          >
            {(row) => (
              <FieldRow>
                <TextField
                  label="Platform"
                  id={`social-${row.key}-platform`}
                  required
                  value={row.platform}
                  onChange={(v) =>
                    set(
                      'socialLinks',
                      updateRow<SocialRow>(values.socialLinks, row.key, {
                        platform: v,
                      })
                    )
                  }
                  error={rowError(errors, 'socialLinks', values.socialLinks, row.key, 'platform')}
                />
                <TextField
                  label="Full URL"
                  id={`social-${row.key}-url`}
                  required
                  mono
                  value={row.url}
                  onChange={(v) =>
                    set(
                      'socialLinks',
                      updateRow<SocialRow>(values.socialLinks, row.key, { url: v })
                    )
                  }
                  error={rowError(errors, 'socialLinks', values.socialLinks, row.key, 'url')}
                />
              </FieldRow>
            )}
          </RepeatableList>

          <AddRowButton
            onClick={() =>
              set('socialLinks', [
                ...values.socialLinks,
                { key: newRowKey('social'), platform: '', url: '' },
              ])
            }
          >
            Add a profile
          </AddRowButton>
        </Section>

        {/* ============ policy copy ============ */}
        <Section title="Policy copy" renders="Booking policy">
          <TextAreaField
            label="Deposit policy"
            id="depositPolicyText"
            rows={6}
            maxLength={4000}
            value={values.depositPolicyText}
            onChange={(v) => set('depositPolicyText', v)}
            error={errors.depositPolicyText}
          />

          <TextAreaField
            label="Cancellation policy"
            id="cancellationPolicyText"
            rows={8}
            maxLength={4000}
            value={values.cancellationPolicyText}
            onChange={(v) => set('cancellationPolicyText', v)}
            error={errors.cancellationPolicyText}
            hint="What a customer is entitled to if they cancel. This is the one piece of copy here that may be read in a dispute, so it should say what actually happens."
          />
        </Section>
      </div>
    </div>
  );
}

/**
 * A titled block that says which public page it feeds.
 *
 * The `renders` line is the organising idea of this screen. Without it the form
 * is thirty inputs in a column and the client has to remember which one changes
 * what; with it, "the homepage headline is wrong" has an obvious destination.
 */
function Section({
  title,
  renders,
  note,
  children,
}: {
  title: string;
  renders: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="border-b border-hairline pb-3">
        <h2 className="font-display text-lg font-extrabold tracking-display">
          {title}
        </h2>
        <p className="mt-0.5 text-xs uppercase tracking-wide text-muted">
          Shows on: {renders}
        </p>
        {note && <p className="mt-2 max-w-prose text-sm text-muted">{note}</p>}
      </div>

      {children}
    </section>
  );
}

/**
 * Finds the server's error for one field of one repeatable row.
 *
 * The server keys errors by array **index** — `commitments.2.title` — because
 * that is what Zod's `issue.path` gives it, and the server has never seen the
 * client-side `key`. So the index is recovered by looking the row up. Matching
 * on `key` rather than trusting the row's current position is what keeps the
 * message attached to the right row after a drag.
 */
function rowError(
  errors: Record<string, string>,
  field: string,
  rows: { key: string }[],
  key: string,
  property: string
): string | undefined {
  const index = rows.findIndex((row) => row.key === key);

  if (index === -1) return undefined;

  return errors[`${field}.${index}.${property}`];
}

/**
 * Strips the client-only `key` from every repeatable row.
 *
 * `key` is React identity, not data. The schema describes exactly what the
 * model stores, so an extra property fails the parse — and the failure would
 * arrive as an unhelpful error on a field the client cannot see.
 */
function toPayload(values: SettingsEditorValues) {
  const strip = <T extends { key: string }>(rows: T[]) =>
    rows.map(({ key, ...rest }) => {
      void key;
      return rest;
    });

  return {
    ...values,
    headlineStats: strip(values.headlineStats),
    valuePropositions: strip(values.valuePropositions),
    commitments: strip(values.commitments),
    safetyPolicies: strip(values.safetyPolicies),
    socialLinks: strip(values.socialLinks),
    affiliations: values.affiliations.map((row) => ({
      id: row.id,
      registrationNumber: row.registrationNumber,
    })),
  };
}
