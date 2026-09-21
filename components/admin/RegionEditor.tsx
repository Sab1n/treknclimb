'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { RegionEditorValues } from '../../types/contentEditor';
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
 * The region editor, used for both creating and editing.
 *
 * Structurally the activity editor — same one-component-for-both-modes shape,
 * same slug-follows-name behaviour, same delete guard. Two things differ, and
 * both come from the same fact: **a region has no page of its own.**
 *
 * 1. **Its URL depends on an activity.** A region lives at
 *    `/<destination>/<activity>/region/<slug>`, and which activities render it
 *    is decided by the trips filed under it — so this form cannot show one
 *    canonical "View live" link. `livePaths` is passed in by the page, which
 *    reads the actual pairs.
 * 2. **It can be created before it has anywhere to appear.** That is fine and
 *    expected: the client adds Langtang, then files trips under it. The form
 *    says so rather than pretending the record is live.
 */
export default function RegionEditor({
  mode,
  id,
  initialValues,
  destinations,
  updatedAt,
  slugHistory = [],
  tripCount = 0,
  livePaths = [],
}: {
  mode: 'create' | 'edit';
  /** Absent while creating — there is no record yet. */
  id?: string;
  initialValues: RegionEditorValues;
  destinations: DestinationOption[];
  /** Absent while creating. */
  updatedAt?: string;
  slugHistory?: string[];
  tripCount?: number;
  /**
   * The pages this region actually renders on right now, one per activity that
   * has trips in it. Empty for a region with no published trips yet.
   */
  livePaths?: string[];
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
   * The slug follows the name until the slug is edited by hand. Starts locked
   * on an existing record whose slug and name already disagree — a deliberately
   * shortened slug must not be undone by a name fix.
   */
  const [slugLocked, setSlugLocked] = useState(
    () =>
      mode === 'edit' &&
      values.slug !== '' &&
      values.slug !== slugifyTitle(values.name)
  );

  function set<K extends keyof RegionEditorValues>(
    key: K,
    value: RegionEditorValues[K]
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

  async function save() {
    setSaving(true);
    setFormError(null);
    setErrors({});

    try {
      const response = await fetch(
        mode === 'create' ? '/api/admin/regions' : `/api/admin/regions/${id}`,
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
        window.location.assign('/admin/regions');
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
         * `saving` stays true: the navigation is in flight and re-enabling the
         * button would let a second click create a second region.
         */
        router.push(`/admin/regions/${result.id}`);
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
    if (
      !window.confirm(
        `Delete "${values.name}"? This cannot be undone, and any page showing this region will start returning 404.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/admin/regions/${id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        // 409 means trips still reference it. The message says how many and
        // what to do, so it is shown as-is rather than softened.
        setFormError(result.error ?? 'Could not delete this region.');
        return;
      }

      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/regions');
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
        message="This region has unsaved changes. Leave the page and they will be lost."
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
          label="region"
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

            {/*
              The URL carries an activity, and a region can render under more
              than one, so the preview shows the shape rather than a single
              address. The `…` is honest: which activities appear depends on
              what is filed here.
            */}
            {selectedDestination && (
              <p className="mt-1.5 font-mono text-xs text-muted">
                treknclimb.com/{selectedDestination.slug}/&lt;activity&gt;/region/
                {values.slug || '…'}
              </p>
            )}

            {tripCount > 0 && (
              <p className="mt-1.5 text-xs text-muted">
                Renaming moves every page showing this region. The old URLs will
                301 to the new ones.
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
            {/*
              Every destination, not only those with an activity layer.

              A region is a place, and India has real ones. What a region under
              India does not have today is a URL, because the only region route
              sits under an activity segment — so the record is allowed and the
              hint below says plainly that it will not render yet. Forbidding it
              here would have to be undone the moment that route exists.
            */}
            <SelectField
              label="Destination"
              id="destination"
              required
              value={values.destination}
              onChange={(value) => set('destination', value)}
              options={destinations.map((destination) => ({
                value: destination.id,
                label: destination.name,
              }))}
              placeholder="Choose a destination"
              error={errors.destination}
              hint={
                selectedDestination && !selectedDestination.hasActivities
                  ? `${selectedDestination.name} has no activity layer, so this region will not have a page yet. The record is fine to create.`
                  : 'Regions belong to a destination, not to an activity.'
              }
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

          {mode === 'edit' && (
            <div className="rounded border border-hairline bg-paper px-4 py-3 text-sm">
              {livePaths.length > 0 ? (
                <>
                  <p className="font-semibold">Live on</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {livePaths.map((path) => (
                      <li key={path}>
                        <a
                          href={path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs underline underline-offset-4"
                        >
                          {path}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted">
                    One page per activity with published trips in this region.
                    File a trip from another activity here and its page appears
                    too.
                  </p>
                </>
              ) : (
                <p className="text-muted">
                  No published trips are filed under this region yet, so it has
                  no live page. Set the region on a trip in the trip editor and
                  its page appears.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="font-display text-lg font-extrabold tracking-display">
            Copy
          </h2>

          <TextAreaField
            label="Description"
            id="description"
            required
            rows={8}
            maxLength={4000}
            value={values.description}
            onChange={(value) => set('description', value)}
            error={errors.description}
            hint="The editorial body of the region page — what the place is, how it is reached, seasons, permits. Markdown subset: ## ### - > **bold** *italic* [text](url)."
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-extrabold tracking-display">
            Cover image
          </h2>

          <ImageField
            label="Cover image"
            id="coverImage"
            collection="regions"
            /*
             * While creating there is no record to file the image under, so the
             * slug currently in the form is used instead. Safe because the
             * server still picks the collection folder and always appends a
             * random suffix.
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

          {/*
            One region record, potentially several pages. An override here
            applies to all of them — the trekking page and the peak-climbing
            page would get the same title. Said out loud because the field looks
            like it belongs to one page and does not.
          */}
          <p className="-mt-2 max-w-prose text-sm text-muted">
            These apply to every page this region renders on. If it has both a
            trekking and a peak-climbing page, a title written here is used by
            both — leave them blank to get a per-activity title generated from
            the names instead.
          </p>

          <FieldRow>
            <TextField
              label="SEO title"
              id="metaTitle"
              value={values.metaTitle}
              onChange={(value) => set('metaTitle', value)}
              error={errors.metaTitle}
              hint="Falls back to “<Activity> in <Region>, <Destination>”."
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
            description="Adds noindex and drops every page for this region from the sitemap. They stay reachable by link."
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
              {saving ? 'Creating…' : 'Create region'}
            </button>

            <Link
              href="/admin/regions"
              className="text-sm underline underline-offset-4"
            >
              Cancel
            </Link>

            <p className="w-full text-sm text-muted">
              A region has no draft state, but it also has no page until a trip
              is filed under it — so creating this publishes nothing on its own.
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
              Delete this region
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              {tripCount > 0 ? (
                <>
                  {tripCount} {tripCount === 1 ? 'trip is' : 'trips are'} filed
                  under this region, so it cannot be deleted. Clear the region on{' '}
                  {tripCount === 1 ? 'it' : 'them'} first — deleting now would
                  leave {tripCount === 1 ? 'that trip' : 'those trips'} pointing
                  at a record that no longer exists.
                </>
              ) : (
                <>
                  Nothing references it, so no page is showing it. No redirect is
                  recorded on delete — there is no replacement URL to point at,
                  and a 301 to somewhere else would be a lie about what the
                  visitor asked for.
                </>
              )}
            </p>

            <button
              type="button"
              onClick={remove}
              disabled={deleting || tripCount > 0}
              className="mt-3 rounded-full border-2 border-error px-5 py-2 text-sm font-semibold text-error transition-colors hover:bg-error hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete region'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
