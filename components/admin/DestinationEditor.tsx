'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { DestinationEditorValues } from '../../types/contentEditor';
import { PERMIT_COMPLEXITIES } from '../../models/shared/permitComplexity';
import ImageField from './ImageField';
import UnsavedChangesGuard from './UnsavedChangesGuard';
import SaveBar from './SaveBar';
import {
  TextField,
  TextAreaField,
  SelectField,
  CheckboxField,
  NumberField,
  FieldRow,
} from './fields';
import RichTextEditor from './RichTextEditor';

/**
 * The destination editor.
 *
 * One of four fixed records. **Nothing here creates or deletes** — the routes
 * for those do not exist, so there is no button to leave out and no handler
 * that refuses. Four destinations were seeded once and the set is closed.
 *
 * ## Single-column, not tabbed
 *
 * The trip editor is tabbed because it has forty fields across eight
 * concerns. This has fourteen, and tabs over fourteen fields hide things for no
 * gain — an admin looking for the comparison labels would have to guess which
 * tab holds them. Sections with headings do the same job without concealment.
 *
 * ## `hasActivities` is shown and not editable
 *
 * It is displayed because it explains why Nepal has an activity layer and the
 * others do not, and an editor that silently omitted it would read as though
 * the field did not exist. It is not editable because flipping it is a
 * migration: every trip beneath the destination would have its
 * `pre('validate')` hook start demanding — or rejecting — an activity it cannot
 * gain or lose, and they would all fail their next save at once.
 */
export default function DestinationEditor({
  id,
  initialValues,
  hasActivities,
  updatedAt,
  slugHistory,
  tripCount,
  activityCount,
}: {
  id: string;
  initialValues: DestinationEditorValues;
  /** Read-only. Shown for context, never sent. */
  hasActivities: boolean;
  updatedAt: string;
  slugHistory: string[];
  tripCount: number;
  activityCount: number;
}) {
  const router = useRouter();

  const [values, setValues] = useState(initialValues);
  const [baseline, setBaseline] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function set<K extends keyof DestinationEditorValues>(
    key: K,
    value: DestinationEditorValues[K]
  ) {
    setValues((current) => ({ ...current, [key]: value }));

    // Clear this field's error as it is edited — leaving it flagged tells the
    // admin their fix was wrong rather than unchecked.
    setErrors((current) => {
      if (!(key in current)) return current;

      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  /*
   * A structural comparison. Every value here is a string or a boolean, and
   * both objects come from the same literal in the mapper, so key order is
   * stable and JSON round-tripping is a faithful check.
   */
  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(baseline),
    [values, baseline]
  );

  async function save() {
    setSaving(true);
    setFormError(null);
    setErrors({});

    try {
      const response = await fetch(`/api/admin/destinations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.status === 404) {
        /*
         * The session was revoked. A full page load, not a router push: the
         * cookie may no longer be valid, and a client-side navigation would
         * render from the router cache built while signed in.
         */
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin/destinations');
        return;
      }

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrors((result.fieldErrors ?? {}) as Record<string, string>);
        setFormError(result.error ?? 'Could not save.');
        return;
      }

      /*
       * The server may have normalised the slug — lowercased or trimmed it — so
       * the saved value is read back rather than assumed. Otherwise the form
       * would look dirty again immediately, against a baseline that never
       * existed in the database.
       */
      const saved = { ...values, slug: result.slug ?? values.slug };

      setValues(saved);
      setBaseline(saved);
      setSavedAt(new Date().toISOString());

      // Re-render the server component so the slug history and the "last
      // edited" line match what was just written.
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/*
        Catches a sidebar click, which `beforeunload` cannot see — the App
        Router swaps pages without the browser unloading. Mounted only while
        dirty, so a clean form never interrupts anything.
      */}
      <UnsavedChangesGuard
        when={dirty}
        message="This destination has unsaved changes. Leave the page and they will be lost."
      />

      <SaveBar
        dirty={dirty}
        saving={saving}
        savedAt={savedAt}
        updatedAt={updatedAt}
        formError={formError}
        errorCount={Object.keys(errors).length}
        onSave={save}
        label="destination"
      />

      <div className="flex max-w-3xl flex-col gap-10 pb-16">
        {/* ---------------- identity ---------------- */}

        <section className="flex flex-col gap-6">
          <TextField
            label="Name"
            id="name"
            required
            value={values.name}
            onChange={(value) => set('name', value)}
            error={errors.name}
          />

          <div>
            <TextField
              label="Slug"
              id="slug"
              required
              mono
              value={values.slug}
              onChange={(value) => set('slug', value)}
              error={errors.slug}
              hint="The top-level URL segment. Changing it 301s the old one and every page beneath it."
            />

            <p className="mt-1.5 font-mono text-xs text-muted">
              treknclimb.com/{values.slug || '…'}
            </p>

            {/*
              A destination rename is the most consequential edit on this
              screen: it moves its own page, its activity pages and every trip
              page beneath it. Saying how many is more useful than saying it
              happens.
            */}
            {(tripCount > 0 || activityCount > 0) && (
              <p className="mt-1.5 text-xs text-muted">
                Renaming moves {activityCount > 0 && `${activityCount} activity `}
                {activityCount > 0 && tripCount > 0 && 'and '}
                {tripCount > 0 && `${tripCount} trip `}
                {activityCount + tripCount === 1 ? 'page' : 'pages'} with it. The
                old URLs will 301 to the new ones.
              </p>
            )}

            {slugHistory.length > 0 && (
              <p className="mt-1.5 text-xs text-muted">
                Previously at{' '}
                {slugHistory.map((old, index) => (
                  <span key={old}>
                    {index > 0 && ', '}
                    <code className="font-mono">/{old}</code>
                  </span>
                ))}
                . Those still 301 here.
              </p>
            )}
          </div>

          {/*
            Read-only, and the explanation is the point. An editor that omitted
            this entirely would read as though the field did not exist; one that
            let it be toggled would offer a migration disguised as a checkbox.
          */}
          <div className="rounded border border-hairline bg-white p-4">
            <p className="text-sm font-semibold">
              Activity layer:{' '}
              {hasActivities ? 'this destination has one' : 'none'}
            </p>
            <p className="mt-1 text-xs text-muted">
              {hasActivities
                ? 'Trips here belong to an activity, and the URL carries it — /nepal/trekking/everest-base-camp-trek.'
                : 'Trips here sit directly beneath the destination — /bhutan/druk-path-trek.'}{' '}
              Not editable. Changing it would make every trip beneath this
              destination fail its next save, because each one would suddenly
              need — or need to lose — an activity. That is a migration, not a
              setting.
            </p>
          </div>

          <NumberField
            label="Display order"
            id="displayOrder"
            value={values.displayOrder}
            onChange={(value) => set('displayOrder', value)}
            error={errors.displayOrder}
            hint="Lower sorts first on /destinations and the homepage."
          />
        </section>

        {/* ---------------- copy ---------------- */}

        <section className="flex flex-col gap-6">
          <h2 className="font-display text-lg font-extrabold tracking-display">
            Copy
          </h2>

          <TextAreaField
            label="Description"
            id="description"
            required
            rows={4}
            maxLength={2000}
            value={values.description}
            onChange={(value) => set('description', value)}
            error={errors.description}
            hint="The card blurb, used on /destinations and in the hero. One paragraph."
          />

          {/*
            Rich text, because this field goes through `parseLongForm` and then
            `PostBody`. Its `##` headings become the page's sections and its
            first `>` in each section becomes that section's pull quote — so the
            markup here is load-bearing structure, not decoration.
          */}
          <RichTextEditor
            label="Activities introduction"
            id="activitiesIntro"
            value={values.activitiesIntro}
            onChange={(value) => set('activitiesIntro', value)}
            error={errors.activitiesIntro}
            minHeight="24rem"
            hint={
              hasActivities
                ? 'The editorial body of the /activities page — seasons, permits, how to choose between activity types. Each H2 starts a new section, and the first quote inside a section is pulled out as its pull quote.'
                : 'This destination has no activities page, so this is not rendered anywhere. Leave it blank.'
            }
          />
        </section>

        {/* ---------------- image ---------------- */}

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-extrabold tracking-display">
            Cover image
          </h2>

          <ImageField
            label="Cover image"
            id="coverImage"
            collection="destinations"
            recordId={id}
            required
            publicId={values.coverImage}
            alt={values.coverImageAlt}
            onPublicIdChange={(value) => set('coverImage', value)}
            onAltChange={(value) => set('coverImageAlt', value)}
            errors={errors}
            publicIdField="coverImage"
            altField="coverImageAlt"
          />
        </section>

        {/* ---------------- comparison ---------------- */}

        <section className="flex flex-col gap-6">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-display">
              How it compares
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              The comparison row on /destinations. All four are optional and the
              table renders only for destinations that have them.
            </p>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Written by hand rather than calculated from the trips, on purpose:
              these describe the <em>region</em>, not whichever trips happen to
              be published. Deriving &ldquo;typical length&rdquo; from trip
              durations would make Nepal read &ldquo;3&ndash;18 days&rdquo; the
              day a short hike goes live — true of the catalogue, misleading
              about the country.
            </p>
          </div>

          <FieldRow>
            <TextField
              label="Typical length"
              id="typicalLengthLabel"
              value={values.typicalLengthLabel}
              onChange={(value) => set('typicalLengthLabel', value)}
              error={errors.typicalLengthLabel}
              placeholder="9–18 days"
            />

            <TextField
              label="Maximum altitude"
              id="maxAltitudeLabel"
              value={values.maxAltitudeLabel}
              onChange={(value) => set('maxAltitudeLabel', value)}
              error={errors.maxAltitudeLabel}
              placeholder="Up to 5,545 m"
            />
          </FieldRow>

          <FieldRow>
            <TextField
              label="Best months"
              id="bestMonthsLabel"
              value={values.bestMonthsLabel}
              onChange={(value) => set('bestMonthsLabel', value)}
              error={errors.bestMonthsLabel}
              placeholder="Mar–May, Sep–Nov"
            />

            <SelectField
              label="Permit complexity"
              id="permitComplexity"
              value={values.permitComplexity}
              onChange={(value) => set('permitComplexity', value)}
              options={PERMIT_COMPLEXITIES.map((level) => ({
                value: level,
                label: level,
              }))}
              placeholder="Not stated"
              error={errors.permitComplexity}
              hint="Editorial. Nothing in the trip data implies it."
            />
          </FieldRow>
        </section>

        {/* ---------------- seo ---------------- */}

        <section className="flex flex-col gap-6">
          <h2 className="font-display text-lg font-extrabold tracking-display">
            SEO
          </h2>

          <FieldRow>
            <TextField
              label="SEO title"
              id="metaTitle"
              value={values.metaTitle}
              onChange={(value) => set('metaTitle', value)}
              error={errors.metaTitle}
              hint="Falls back to the name."
            />

            <TextField
              label="Canonical URL"
              id="canonicalUrl"
              value={values.canonicalUrl}
              onChange={(value) => set('canonicalUrl', value)}
              error={errors.canonicalUrl}
              hint="Override only. Blank canonicals to itself, which is almost always right."
            />
          </FieldRow>

          <TextAreaField
            label="Meta description"
            id="metaDescription"
            rows={3}
            maxLength={155}
            value={values.metaDescription}
            onChange={(value) => set('metaDescription', value)}
            error={errors.metaDescription}
            hint="Falls back to the description. Not a ranking factor, but it is the sentence that decides the click."
          />

          <FieldRow>
            <TextField
              label="OG title"
              id="ogTitle"
              value={values.ogTitle}
              onChange={(value) => set('ogTitle', value)}
              error={errors.ogTitle}
              hint="Social shares only. Falls back to the SEO title."
            />

            <TextField
              label="OG image"
              id="ogImage"
              value={values.ogImage}
              onChange={(value) => set('ogImage', value)}
              error={errors.ogImage}
              hint="Falls back to the cover image."
            />
          </FieldRow>

          <TextAreaField
            label="OG description"
            id="ogDescription"
            rows={2}
            value={values.ogDescription}
            onChange={(value) => set('ogDescription', value)}
            error={errors.ogDescription}
            hint="Falls back to the meta description."
          />

          <FieldRow>
            <TextField
              label="Schema type override"
              id="schemaType"
              value={values.schemaType}
              onChange={(value) => set('schemaType', value)}
              error={errors.schemaType}
              hint="Blank emits the default for this page type."
            />

            <div />
          </FieldRow>

          <CheckboxField
            label="Hide from search engines"
            id="noIndex"
            checked={values.noIndex}
            onChange={(checked) => set('noIndex', checked)}
            error={errors.noIndex}
            description="Adds noindex and drops the page from the sitemap. The page stays reachable by anyone with the link — this keeps it out of results, it does not hide it."
          />
        </section>
      </div>
    </div>
  );
}
