'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { ActivityEditorValues } from '../../types/contentEditor';
import type { DestinationOption } from '../../lib/queries/adminTrips';
import { slugifyTitle } from '../../types/tripEditor';
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
import { describeSaveFailure } from './saveFailure';

/**
 * The activity editor, used for both creating and editing.
 *
 * One component for both, unlike trips. A trip needed a separate create screen
 * because five of its required fields cannot exist until the record does; an
 * activity has no such field, so a reduced create form would just be this form
 * with things missing that are needed a minute later.
 *
 * The only real difference is where the save goes — `POST` to the collection or
 * `PATCH` to the record — and what happens afterwards.
 *
 * ## An activity is live the moment it is created
 *
 * There is no draft state on this model. A new activity appears on its
 * destination's activities page immediately, which is why the form asks for the
 * description and cover image up front rather than letting them wait.
 */
export default function ActivityEditor({
  mode,
  id,
  initialValues,
  destinations,
  updatedAt,
  slugHistory = [],
  tripCount = 0,
}: {
  mode: 'create' | 'edit';
  /** Absent while creating — there is no record yet. */
  id?: string;
  initialValues: ActivityEditorValues;
  destinations: DestinationOption[];
  /** Absent while creating. */
  updatedAt?: string;
  slugHistory?: string[];
  tripCount?: number;
}) {
  const router = useRouter();

  const [values, setValues] = useState(initialValues);
  const [baseline, setBaseline] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /*
   * The slug follows the name until the slug is edited by hand.
   *
   * Starts locked on an existing record whose slug and name already disagree —
   * a deliberately shortened slug must not be undone by a name fix. Starts
   * unlocked when creating, because there is nothing deliberate to protect yet.
   */
  const [slugLocked, setSlugLocked] = useState(
    () =>
      mode === 'edit' &&
      values.slug !== '' &&
      values.slug !== slugifyTitle(values.name)
  );

  function set<K extends keyof ActivityEditorValues>(
    key: K,
    value: ActivityEditorValues[K]
  ) {
    setValues((current) => ({ ...current, [key]: value }));

    setErrors((current) => {
      if (!(key in current)) return current;

      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function changeName(name: string) {
    set('name', name);

    if (!slugLocked) set('slug', slugifyTitle(name));
  }

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(baseline),
    [values, baseline]
  );

  const selectedDestination = destinations.find(
    (destination) => destination.id === values.destination
  );

  /*
   * Only destinations with an activity layer. Offering Bhutan would offer a
   * choice that cannot save — the route refuses it, because an activity filed
   * under a destination without the layer would render on no page at all.
   */
  const eligibleDestinations = destinations.filter(
    (destination) => destination.hasActivities
  );

  async function save() {
    setSaving(true);
    setFormError(null);
    setErrors({});

    try {
      const response = await fetch(
        mode === 'create' ? '/api/admin/activities' : `/api/admin/activities/${id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(values),
        }
      );

      if (response.status === 404) {
        // Session revoked. A full load, not a router push — the cookie may be
        // invalid and a client navigation would render from a stale cache.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin/activities');
        return;
      }

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const failure = describeSaveFailure(response.status, result);

        setErrors(failure.fieldErrors);
        setFormError(failure.message);
        return;
      }

      if (mode === 'create') {
        /*
         * Into the editor for the record just made. `push`, not `replace`, so
         * Back returns to the list — and the activity is already saved, so
         * there is nothing on this form to preserve.
         *
         * `saving` stays true: the navigation is in flight and re-enabling the
         * button would let a second click create a second activity.
         */
        router.push(`/admin/activities/${result.id}`);
        return;
      }

      // The server may have normalised the slug, so it is read back rather than
      // assumed — otherwise the form looks dirty against a baseline that never
      // existed in the database.
      const saved = { ...values, slug: result.slug ?? values.slug };

      setValues(saved);
      setBaseline(saved);
      setSavedAt(new Date().toISOString());
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Nothing was saved.');
    } finally {
      if (mode === 'edit') setSaving(false);
    }
  }

  async function remove() {
    /*
     * `confirm` rather than a styled modal. It is synchronous, which is what
     * lets it actually stop the action, and it is the dialog people already
     * recognise as "this is irreversible".
     */
    if (
      !window.confirm(
        `Delete "${values.name}"? This cannot be undone, and the page at /${selectedDestination?.slug ?? '…'}/${values.slug} will start returning 404.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/admin/activities/${id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        // 409 means trips still reference it. The message says how many and
        // what to do, so it is shown as-is rather than softened.
        setFormError(result.error ?? 'Could not delete this activity.');
        return;
      }

      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/activities');
    } catch {
      setFormError('Could not reach the server. Nothing was deleted.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesGuard
        when={dirty && !saving}
        message="This activity has unsaved changes. Leave the page and they will be lost."
      />

      {mode === 'edit' ? (
        <SaveBar
          dirty={dirty}
          saving={saving}
          savedAt={savedAt}
          updatedAt={updatedAt ?? new Date().toISOString()}
          formError={formError}
          errorCount={Object.keys(errors).length}
          onSave={save}
          label="activity"
        />
      ) : (
        formError && (
          <p
            role="alert"
            className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
          >
            {formError}
          </p>
        )
      )}

      <div className="flex max-w-3xl flex-col gap-10 pb-16">
        <section className="flex flex-col gap-6">
          <TextField
            label="Name"
            id="name"
            required
            value={values.name}
            onChange={changeName}
            error={errors.name}
          />

          <div>
            <TextField
              label="Slug"
              id="slug"
              required
              mono
              value={values.slug}
              onChange={(value) => {
                setSlugLocked(true);
                set('slug', value);
              }}
              error={errors.slug}
              hint={
                slugLocked
                  ? 'Edited by hand — it no longer follows the name.'
                  : 'Generated from the name as you type. Editing it stops that.'
              }
            />

            {selectedDestination && (
              <p className="mt-1.5 font-mono text-xs text-muted">
                treknclimb.com/{selectedDestination.slug}/{values.slug || '…'}
              </p>
            )}

            {tripCount > 0 && (
              <p className="mt-1.5 text-xs text-muted">
                Renaming moves {tripCount}{' '}
                {tripCount === 1 ? 'trip page' : 'trip pages'} with it. The old
                URLs will 301 to the new ones.
              </p>
            )}

            {slugHistory.length > 0 && (
              <p className="mt-1.5 text-xs text-muted">
                Previously at{' '}
                {slugHistory.map((old, index) => (
                  <span key={old}>
                    {index > 0 && ', '}
                    <code className="font-mono">{old}</code>
                  </span>
                ))}
                . Those still 301 here.
              </p>
            )}
          </div>

          <FieldRow>
            <SelectField
              label="Destination"
              id="destination"
              required
              value={values.destination}
              onChange={(value) => set('destination', value)}
              options={eligibleDestinations.map((destination) => ({
                value: destination.id,
                label: destination.name,
              }))}
              placeholder="Choose a destination"
              error={errors.destination}
              hint="Only destinations with an activity layer are listed."
            />

            <NumberField
              label="Display order"
              id="displayOrder"
              value={values.displayOrder}
              onChange={(value) => set('displayOrder', value)}
              error={errors.displayOrder}
              hint="Lower sorts first."
            />
          </FieldRow>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="font-display text-lg font-extrabold tracking-display">
            Copy
          </h2>

          <TextAreaField
            label="Description"
            id="description"
            required
            rows={6}
            maxLength={4000}
            value={values.description}
            onChange={(value) => set('description', value)}
            error={errors.description}
            hint="What this activity is. Rendered on the activity page and used as the card blurb."
          />

          <TextAreaField
            label="Suitability"
            id="suitability"
            rows={5}
            maxLength={4000}
            value={values.suitability}
            onChange={(value) => set('suitability', value)}
            error={errors.suitability}
            hint="Who it is for — a different question from what it is, and one the generic difficulty table cannot answer for a specific activity. Optional."
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-extrabold tracking-display">
            Cover image
          </h2>

          <ImageField
            label="Cover image"
            id="coverImage"
            collection="activities"
            /*
             * While creating there is no record to file the image under, so the
             * slug currently in the form is used instead. Safe because the
             * server still picks the collection folder and always appends a
             * random suffix — see the note on the sign route.
             */
            recordId={mode === 'edit' && id ? id : { newSlug: values.slug || 'new' }}
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
              hint="Override only."
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
            hint="Falls back to the description."
          />

          <FieldRow>
            <TextField
              label="OG title"
              id="ogTitle"
              value={values.ogTitle}
              onChange={(value) => set('ogTitle', value)}
              error={errors.ogTitle}
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
          />

          <FieldRow>
            <TextField
              label="Schema type override"
              id="schemaType"
              value={values.schemaType}
              onChange={(value) => set('schemaType', value)}
              error={errors.schemaType}
            />

            <div />
          </FieldRow>

          <CheckboxField
            label="Hide from search engines"
            id="noIndex"
            checked={values.noIndex}
            onChange={(checked) => set('noIndex', checked)}
            error={errors.noIndex}
            description="Adds noindex and drops the page from the sitemap. It stays reachable by link."
          />
        </section>

        {mode === 'create' ? (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Creating…' : 'Create activity'}
            </button>

            <Link
              href="/admin/activities"
              className="text-sm underline underline-offset-4"
            >
              Cancel
            </Link>

            <p className="w-full text-sm text-muted">
              An activity has no draft state — it goes live on its
              destination&rsquo;s activities page as soon as it is created.
            </p>
          </div>
        ) : (
          /*
           * Delete sits at the bottom, outside the save bar and styled as a
           * plain destructive link rather than a button next to Save. An
           * irreversible action should not be one mis-aimed click away from the
           * one performed constantly.
           */
          <section className="border-t border-hairline pt-6">
            <h2 className="font-display text-base font-extrabold tracking-display">
              Delete this activity
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              {tripCount > 0 ? (
                <>
                  {tripCount} {tripCount === 1 ? 'trip belongs' : 'trips belong'}{' '}
                  to this activity, so it cannot be deleted. Move{' '}
                  {tripCount === 1 ? 'it' : 'them'} elsewhere first — deleting
                  now would leave {tripCount === 1 ? 'that trip' : 'those trips'}{' '}
                  pointing at nothing, and they would fail to build.
                </>
              ) : (
                <>
                  Nothing references it. The page will start returning 404 — no
                  redirect is recorded, because there is no replacement URL to
                  point at and a 301 to somewhere else would be a lie about what
                  the visitor asked for.
                </>
              )}
            </p>

            <button
              type="button"
              onClick={remove}
              disabled={deleting || tripCount > 0}
              className="mt-3 rounded-full border-2 border-error px-5 py-2 text-sm font-semibold text-error transition-colors hover:bg-error hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete activity'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
