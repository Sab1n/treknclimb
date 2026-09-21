'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { BlogPostEditorValues } from '../../types/blogEditor';
import type { CategoryOption, TripOption } from '../../lib/queries/adminContent';
import { PUBLISH_STATUSES } from '../../models/shared/status';
import { slugifyTitle } from '../../types/tripEditor';
import ImageField from './ImageField';
import RichTextEditor from './RichTextEditor';
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
 * The blog post editor.
 *
 * One component for create and edit. A post's `body`, `excerpt` and
 * `featuredImage` are **required to publish, not required to exist** — the same
 * rule as the five Trip fields, and it is what lets a draft be started with a
 * title and a category and finished later. So there is no reduced create
 * screen: this form works from the first keystroke.
 *
 * ## The body is the rich text editor
 *
 * It emits the Markdown subset `PostBody` renders, round-tripped byte-for-byte
 * — `lib/richText.test.ts` asserts that against every stored body. The dirty
 * check below is ordinary because of it: the editor pushes Markdown up through
 * `onChange` exactly like a text input, and stays silent while loading, so
 * `values` and `baseline` compare the way they do for every other field.
 *
 * ## Related trips is the conversion mechanism
 *
 * Blog traffic arrives top-of-funnel and converts badly against a generic CTA.
 * A hand-picked link from the answer to the trips that address it is what turns
 * a reader into an inquiry — which is why this is a deliberate picker and not
 * a category match. The model's own comment makes the point: inferred pairings
 * are confidently wrong, and the editorial judgement is the whole value.
 */
export default function BlogPostEditor({
  mode,
  id,
  initialValues,
  categories,
  trips,
  updatedAt,
  slugHistory = [],
}: {
  mode: 'create' | 'edit';
  /** Absent while creating — there is no record yet. */
  id?: string;
  initialValues: BlogPostEditorValues;
  categories: CategoryOption[];
  trips: TripOption[];
  /** Absent while creating. */
  updatedAt?: string;
  slugHistory?: string[];
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
   * The slug follows the title until the slug is edited by hand. Starts locked
   * on an existing post whose slug and title already disagree — a deliberately
   * shortened slug must not be undone by a title fix, and on a published post
   * a slug change costs a 301.
   */
  const [slugLocked, setSlugLocked] = useState(
    () =>
      mode === 'edit' &&
      values.slug !== '' &&
      values.slug !== slugifyTitle(values.title)
  );

  function set<K extends keyof BlogPostEditorValues>(
    key: K,
    value: BlogPostEditorValues[K]
  ) {
    setValues((current) => ({ ...current, [key]: value }));

    setErrors((current) => {
      if (!(key in current)) return current;

      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function changeTitle(title: string) {
    set('title', title);

    if (!slugLocked) set('slug', slugifyTitle(title));
  }

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(baseline),
    [values, baseline]
  );

  const publishing = values.status === 'published';

  async function save() {
    setSaving(true);
    setFormError(null);
    setErrors({});

    try {
      const response = await fetch(
        mode === 'create' ? '/api/admin/blog' : `/api/admin/blog/${id}`,
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
        window.location.assign('/admin/blog');
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
         * `saving` stays true through the navigation — re-enabling the button
         * would let a second click create a second post.
         */
        router.push(`/admin/blog/${result.id}`);
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
        `Delete “${values.title}”? This cannot be undone, and /blog/${values.slug} will start returning 404 with no redirect. To take it off the site and keep it, set the status to archived instead.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/admin/blog/${id}`, { method: 'DELETE' });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setFormError(result.error ?? 'Could not delete this post.');
        return;
      }

      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/blog');
    } catch {
      setFormError('Could not reach the server. Nothing was deleted.');
    } finally {
      setDeleting(false);
    }
  }

  function toggleTrip(tripId: string) {
    set(
      'relatedTrips',
      values.relatedTrips.includes(tripId)
        ? values.relatedTrips.filter((value) => value !== tripId)
        : [...values.relatedTrips, tripId]
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesGuard
        when={dirty && !saving}
        message="This post has unsaved changes. Leave the page and they will be lost."
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
          label="post"
          status={
            <span
              className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${
                publishing
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
        {/* ---------------- identity ---------------- */}
        <section className="flex flex-col gap-6">
          <TextField
            label="Title"
            id="title"
            required
            value={values.title}
            onChange={changeTitle}
            error={errors.title}
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
                  ? 'Edited by hand — it no longer follows the title.'
                  : 'Generated from the title as you type. Editing it stops that.'
              }
            />

            <p className="mt-1.5 font-mono text-xs text-muted">
              treknclimb.com/blog/{values.slug || '…'}
            </p>

            {/*
              A rename on a published post costs a redirect, and the reader
              deserves to know before rather than after. Drafts have never had a
              URL, so nothing is recorded for them.
            */}
            {mode === 'edit' && publishing && (
              <p className="mt-1.5 text-xs text-muted">
                Changing this on a published post records a 301 from the old URL
                automatically. The old address keeps working.
              </p>
            )}

            {slugHistory.length > 0 && (
              <p className="mt-1.5 text-xs text-muted">
                Previously at{' '}
                {slugHistory.map((old, index) => (
                  <span key={old}>
                    {index > 0 && ', '}
                    <code className="font-mono">/blog/{old}</code>
                  </span>
                ))}
                . Those still 301 here.
              </p>
            )}
          </div>

          <FieldRow>
            <SelectField
              label="Category"
              id="category"
              required
              value={values.category}
              onChange={(value) => set('category', value)}
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              placeholder="Choose a category"
              error={errors.category}
              hint="Decides which archive page lists it. Moving a post rebuilds both archives."
            />

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
              hint="A draft needs only a title, slug and category. Publishing needs the body, excerpt and image."
            />
          </FieldRow>

          <TextAreaField
            label="Excerpt"
            id="excerpt"
            required={publishing}
            rows={3}
            maxLength={300}
            value={values.excerpt}
            onChange={(value) => set('excerpt', value)}
            error={errors.excerpt}
            hint="The card blurb on /blog and the homepage, and the fallback search snippet. Two sentences that answer the title."
          />
        </section>

        {/* ---------------- body ---------------- */}
        <section className="flex flex-col gap-4">
          <RichTextEditor
            label="Body"
            id="body"
            required={publishing}
            value={values.body}
            onChange={(value) => set('body', value)}
            error={errors.body}
            minHeight="30rem"
            hint="The post itself. Headings become the article structure; the toolbar is limited to what the site renders."
          />
        </section>

        {/* ---------------- featured image ---------------- */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-display">
              Featured image
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              The card image on /blog and the homepage, and the social preview.
              Required to publish; alt text is required as soon as there is an
              image, draft or not.
            </p>
          </div>

          <ImageField
            label="Featured image"
            id="featuredImage"
            collection="blog"
            /*
             * The record's id where there is one. While creating there is not,
             * so the segment falls back to the slug being typed — safe because
             * the server still picks the folder from a closed list and always
             * appends eight random bytes.
             */
            recordId={
              mode === 'edit' && id ? id : { newSlug: values.slug || 'new' }
            }
            required={publishing}
            publicId={values.featuredImage}
            alt={values.featuredImageAlt}
            onPublicIdChange={(value) => set('featuredImage', value)}
            onAltChange={(value) => set('featuredImageAlt', value)}
            errors={errors}
            publicIdField="featuredImage"
            altField="featuredImageAlt"
          />
        </section>

        {/* ---------------- byline ---------------- */}
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-display">
              Byline
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              These are an experience claim, and an invented one is a
              misrepresentation. A post about altitude sickness is judged partly
              on whether the person writing it plausibly knows — so put a real
              person here, with what they actually do.
            </p>
          </div>

          <FieldRow>
            <TextField
              label="Author"
              id="author"
              value={values.author}
              onChange={(value) => set('author', value)}
              error={errors.author}
            />

            <TextField
              label="Their role"
              id="authorRole"
              value={values.authorRole}
              onChange={(value) => set('authorRole', value)}
              error={errors.authorRole}
              hint="“Operations lead, Pokhara” — specific beats senior."
            />
          </FieldRow>

          <TextAreaField
            label="Author bio"
            id="authorBio"
            rows={3}
            maxLength={600}
            value={values.authorBio}
            onChange={(value) => set('authorBio', value)}
            error={errors.authorBio}
            hint="One or two sentences of credentials, shown in the byline box at the foot of the post."
          />

          <FieldRow>
            <NumberField
              label="Read time"
              id="readTimeMinutes"
              value={values.readTimeMinutes}
              onChange={(value) => set('readTimeMinutes', value)}
              error={errors.readTimeMinutes}
              suffix="minutes"
              hint="Shown on the card. Leave blank to omit it rather than guessing."
            />

            <div>
              <label htmlFor="publishedAt" className="text-sm font-semibold">
                Publish date
              </label>
              <p className="mt-0.5 text-xs text-muted">
                Leave blank and it is stamped the first time you publish. Set it
                to back-date an imported post.
              </p>
              <input
                id="publishedAt"
                type="date"
                value={values.publishedAt}
                onChange={(event) => set('publishedAt', event.target.value)}
                aria-invalid={errors.publishedAt ? true : undefined}
                className={`mt-1.5 w-full rounded border bg-white px-3 py-2.5 text-sm outline-none focus:border-ink ${
                  errors.publishedAt ? 'border-error' : 'border-hairline'
                }`}
              />
              {errors.publishedAt && (
                <p role="alert" className="mt-1.5 text-sm text-error">
                  {errors.publishedAt}
                </p>
              )}
            </div>
          </FieldRow>
        </section>

        {/* ---------------- related trips ---------------- */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-display">
              Related trips
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Shown at the foot of the post. This is how blog traffic becomes an
              inquiry — a reader who arrived asking a question converts on the
              trips that answer it, not on a generic call to action. Pick them
              deliberately; two right ones beat six plausible ones.
            </p>
          </div>

          {trips.length === 0 ? (
            <p className="rounded-lg border border-dashed border-hairline bg-white px-4 py-6 text-center text-sm text-muted">
              No trips exist yet.
            </p>
          ) : (
            <fieldset className="rounded-lg border border-hairline bg-white p-4">
              <legend className="sr-only">Related trips</legend>

              <div className="grid gap-2 sm:grid-cols-2">
                {trips.map((trip) => (
                  <label
                    key={trip.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={values.relatedTrips.includes(trip.id)}
                      onChange={() => toggleTrip(trip.id)}
                      className="mt-0.5 size-4 shrink-0 accent-ink"
                    />
                    <span>
                      {trip.title}
                      <span className="block text-xs text-muted">
                        {trip.destinationName}
                        {trip.status !== 'published' && ` · ${trip.status}`}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {errors.relatedTrips && (
                <p role="alert" className="mt-2 text-sm text-error">
                  {errors.relatedTrips}
                </p>
              )}
            </fieldset>
          )}

          {/*
            A draft trip linked from a published post would render a card
            pointing at a 404. The public query filters to published trips, so
            the link is dropped rather than broken — but the editor should say
            so rather than letting someone pick one and wonder.
          */}
          {values.relatedTrips.some(
            (tripId) =>
              trips.find((trip) => trip.id === tripId)?.status !== 'published'
          ) && (
            <p className="text-xs text-muted">
              One or more of these is not published. Unpublished trips are left
              out of the section on the live page until they go live.
            </p>
          )}
        </section>

        {/* ---------------- SEO ---------------- */}
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
              hint="Falls back to the title."
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
            hint="Falls back to the excerpt."
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
              hint="Falls back to the featured image."
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
              hint="Defaults to BlogPosting."
            />

            <div />
          </FieldRow>

          <CheckboxField
            label="Hide from search engines"
            id="noIndex"
            checked={values.noIndex}
            onChange={(checked) => set('noIndex', checked)}
            error={errors.noIndex}
            description="Adds noindex and drops the post from the sitemap. It stays reachable by link."
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
              {saving ? 'Creating…' : 'Create post'}
            </button>

            <Link href="/admin/blog" className="text-sm underline underline-offset-4">
              Cancel
            </Link>

            <p className="w-full text-sm text-muted">
              A draft needs only a title, a slug and a category. The body,
              excerpt and image are required to publish, not to save.
            </p>
          </div>
        ) : (
          /*
           * Delete at the bottom, styled as a destructive link rather than a
           * button beside Save. An irreversible action should not be one
           * mis-aimed click from the routine one.
           */
          <section className="border-t border-hairline pt-6">
            <h2 className="font-display text-base font-extrabold tracking-display">
              Delete this post
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Nothing references a post, so deleting one strands nothing — but
              the URL starts returning 404 with no redirect, because there is no
              replacement to point at. If it is simply out of date, archive it:
              it comes off the site and keeps its place in the record.
            </p>

            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="mt-3 rounded-full border-2 border-error px-5 py-2 text-sm font-semibold text-error transition-colors hover:bg-error hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete post'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
