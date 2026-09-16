'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { TestimonialEditorValues } from '../../types/contentEditor';
import type { TripOption } from '../../lib/queries/adminContent';
import { PUBLISH_STATUSES } from '../../models/shared/status';
import ImageField from './ImageField';
import UnsavedChangesGuard from './UnsavedChangesGuard';
import SaveBar from './SaveBar';
import {
  TextField,
  TextAreaField,
  SelectField,
  NumberField,
  FieldRow,
} from './fields';

/**
 * One testimonial, create and edit.
 *
 * ## The photo is optional and its alt text is not — conditionally
 *
 * CLAUDE.md requires alt text on every image before save. A testimonial with no
 * photo has no image to describe, so `photoAlt` is required exactly when
 * `photo` is set — the same rule the model applies through a conditional
 * `required` function, and the same rule `ImageField` renders by showing the
 * "Required" marker only once there is an image. Three places, one condition,
 * and the model is the one that actually guarantees it.
 *
 * ## The photo is filed under the record's id, not a slug
 *
 * Testimonials have no slug, and a person's name is neither unique nor stable
 * enough to file images under. While creating there is no id yet, so the
 * uploader falls back to the sign route's `newSlug` path — safe because the
 * server still picks the folder from a closed list and always appends eight
 * random bytes, so no value can name an existing asset.
 */
export default function TestimonialEditor({
  mode,
  id,
  initialValues,
  trips,
  updatedAt,
}: {
  mode: 'create' | 'edit';
  /** Absent while creating — there is no record yet. */
  id?: string;
  initialValues: TestimonialEditorValues;
  trips: TripOption[];
  /** Absent while creating. */
  updatedAt?: string;
}) {
  const router = useRouter();

  const [values, setValues] = useState(initialValues);
  const [baseline, setBaseline] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function set<K extends keyof TestimonialEditorValues>(
    key: K,
    value: TestimonialEditorValues[K]
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

    try {
      const response = await fetch(
        mode === 'create'
          ? '/api/admin/testimonials'
          : `/api/admin/testimonials/${id}`,
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
        window.location.assign('/admin/testimonials');
        return;
      }

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrors((result.fieldErrors ?? {}) as Record<string, string>);
        setFormError(result.error ?? 'Could not save.');
        return;
      }

      if (mode === 'create') {
        /*
         * `saving` stays true through the navigation: re-enabling the button
         * would let a second click create a second testimonial.
         */
        router.push(`/admin/testimonials/${result.id}`);
        return;
      }

      setBaseline(values);
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
        `Delete the testimonial from ${values.name}? This cannot be undone. To take it off the site without losing it, set the status to archived instead.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/admin/testimonials/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setFormError(result.error ?? 'Could not delete this testimonial.');
        return;
      }

      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/testimonials');
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
        message="This testimonial has unsaved changes. Leave the page and they will be lost."
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
          label="testimonial"
          status={
            <span
              className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${
                values.status === 'published'
                  ? 'border-confirmed/30 bg-confirmed/10 text-confirmed'
                  : values.status === 'archived'
                    ? 'border-hairline bg-paper text-muted'
                    : 'border-marigold/40 bg-marigold/10 text-ink'
              }`}
            >
              {values.status}
            </span>
          }
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
          <TextAreaField
            label="Quote"
            id="quote"
            required
            rows={6}
            maxLength={2000}
            value={values.quote}
            onChange={(value) => set('quote', value)}
            error={errors.quote}
            hint="Their words, as they wrote them. Tidy the punctuation if you must; do not write it for them."
          />

          <FieldRow>
            <TextField
              label="Name"
              id="name"
              required
              value={values.name}
              onChange={(value) => set('name', value)}
              error={errors.name}
            />

            <TextField
              label="Country"
              id="country"
              value={values.country}
              onChange={(value) => set('country', value)}
              error={errors.country}
              hint="Shown beside the name. A stranger abroad reads “Sarah, Australia” as more real than “Sarah”."
            />
          </FieldRow>

          <SelectField
            label="Trip"
            id="trip"
            value={values.trip}
            onChange={(value) => set('trip', value)}
            options={trips.map((trip) => ({
              value: trip.id,
              label: `${trip.title} (${trip.destinationName})${
                trip.status === 'published' ? '' : ` — ${trip.status}`
              }`,
            }))}
            placeholder="Not about a specific trip"
            error={errors.trip}
            hint="Optional. A quote attributed to a named route carries more than a floating one."
          />
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-display">
              Photo
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Optional — the card renders without one. If you add a photo it
              needs alt text, and that is enforced on save whatever this form
              does.
            </p>
          </div>

          <ImageField
            label="Photo"
            id="photo"
            collection="testimonials"
            /*
             * The record's id where there is one. While creating there is not,
             * so the segment falls back to the name — see the note at the top.
             */
            recordId={
              mode === 'edit' && id
                ? id
                : { newSlug: values.name.trim() || 'new' }
            }
            publicId={values.photo}
            alt={values.photoAlt}
            onPublicIdChange={(value) => set('photo', value)}
            onAltChange={(value) => set('photoAlt', value)}
            errors={errors}
            publicIdField="photo"
            altField="photoAlt"
            hint="The Cloudinary public ID. Set by the upload — edit it only if you know what you are pointing at."
          />
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="font-display text-lg font-extrabold tracking-display">
            Listing
          </h2>

          <FieldRow>
            <SelectField
              label="Status"
              id="status"
              required
              value={values.status}
              onChange={(value) => set('status', value)}
              options={PUBLISH_STATUSES.map((status) => ({
                value: status,
                label: status,
              }))}
              error={errors.status}
              hint="Only published testimonials appear on the site."
            />

            <NumberField
              label="Display order"
              id="displayOrder"
              value={values.displayOrder}
              onChange={(value) => set('displayOrder', value)}
              error={errors.displayOrder}
              hint="Lower sorts first. The homepage shows the first three."
            />
          </FieldRow>
        </section>

        {mode === 'create' ? (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Creating…' : 'Create testimonial'}
            </button>

            <Link
              href="/admin/testimonials"
              className="text-sm underline underline-offset-4"
            >
              Cancel
            </Link>
          </div>
        ) : (
          <section className="border-t border-hairline pt-6">
            <h2 className="font-display text-base font-extrabold tracking-display">
              Delete this testimonial
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Nothing references a testimonial, so deleting one strands nothing.
              Archiving takes it off the site and keeps the record, which is
              usually what is wanted.
            </p>

            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="mt-3 rounded-full border-2 border-error px-5 py-2 text-sm font-semibold text-error transition-colors hover:bg-error hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete testimonial'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
