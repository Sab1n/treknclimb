'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { BlogCategoryEditorValues } from '../../types/contentEditor';
import { slugifyTitle } from '../../types/tripEditor';
import UnsavedChangesGuard from './UnsavedChangesGuard';
import SaveBar from './SaveBar';
import { TextField, TextAreaField, CheckboxField, NumberField, FieldRow } from './fields';
import { describeSaveFailure } from './saveFailure';

/**
 * The blog category editor, used for both creating and editing.
 *
 * Structurally the region editor — same one-component-for-both-modes shape,
 * same slug-follows-name behaviour, same delete guard reading a count from the
 * server. It is the shortest of the content editors because a category is the
 * smallest content type: a label, a URL and the SEO set.
 *
 * Two differences from the region editor, both from the same fact — **a
 * category's archive exists the moment the record does**:
 *
 * 1. There is a single live URL and it is shown, rather than a shape with a
 *    placeholder segment in it.
 * 2. Creating one publishes a page, so the create form says so instead of
 *    saying the opposite.
 */
export default function BlogCategoryEditor({
  mode,
  id,
  initialValues,
  updatedAt,
  slugHistory = [],
  postCount = 0,
  publishedCount = 0,
}: {
  mode: 'create' | 'edit';
  /** Absent while creating — there is no record yet. */
  id?: string;
  initialValues: BlogCategoryEditorValues;
  /** Absent while creating. */
  updatedAt?: string;
  slugHistory?: string[];
  /** Every post filed here, drafts included — see the delete note below. */
  postCount?: number;
  publishedCount?: number;
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

  function set<K extends keyof BlogCategoryEditorValues>(
    key: K,
    value: BlogCategoryEditorValues[K]
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

  const drafts = postCount - publishedCount;

  async function save() {
    setSaving(true);
    setFormError(null);
    setErrors({});

    try {
      const response = await fetch(
        mode === 'create'
          ? '/api/admin/blog-categories'
          : `/api/admin/blog-categories/${id}`,
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
        window.location.assign('/admin/blog/categories');
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
         * button would let a second click create a second category.
         */
        router.push(`/admin/blog/categories/${result.id}`);
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
        `Delete "${values.name}"? The archive at /blog/category/${values.slug} will start returning 404. This cannot be undone.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/admin/blog-categories/${id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        // 409 means posts still reference it. The message says how many and
        // what to do, so it is shown as-is rather than softened.
        setFormError(result.error ?? 'Could not delete this category.');
        return;
      }

      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/blog/categories');
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
        message="This category has unsaved changes. Leave the page and they will be lost."
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
          label="category"
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
            hint="Shown on the archive page, on every post card and in the blog's category pills."
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

            <p className="mt-1.5 font-mono text-xs text-muted">
              treknclimb.com/blog/category/{values.slug || '…'}
            </p>

            {mode === 'edit' && (
              <p className="mt-1.5 text-xs text-muted">
                Renaming moves the archive and records a 301 from the old URL.
                Every post in the category is regenerated too, because each one
                links here by name.
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
            <NumberField
              label="Display order"
              id="displayOrder"
              value={values.displayOrder}
              onChange={(value) => set('displayOrder', value)}
              error={errors.displayOrder}
              hint="Lower sorts first, in the pills and the footer."
            />

            <div />
          </FieldRow>

          {mode === 'edit' && (
            <div className="rounded border border-hairline bg-paper px-4 py-3 text-sm">
              <p className="font-semibold">Live at</p>
              <a
                href={`/blog/category/${values.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block font-mono text-xs underline underline-offset-4"
              >
                /blog/category/{values.slug}
              </a>
              <p className="mt-2 text-xs text-muted">
                {postCount === 0
                  ? 'No posts are filed here yet. The archive still serves, as a heading and an empty state — and it is noindex until it has something in it.'
                  : `${postCount} post${postCount === 1 ? '' : 's'} filed here${
                      drafts > 0 ? `, ${publishedCount} of them published` : ''
                    }.`}
              </p>
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
            rows={4}
            maxLength={2000}
            value={values.description}
            onChange={(value) => set('description', value)}
            error={errors.description}
            hint="Optional, shown under the heading on the archive. Plain text — this is one of the few fields that is not run through the Markdown subset."
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
              hint="Falls back to “<Name> — field notes”."
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
            description="Adds noindex and drops the archive from the sitemap. It stays reachable by link."
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
              {saving ? 'Creating…' : 'Create category'}
            </button>

            <Link
              href="/admin/blog/categories"
              className="text-sm underline underline-offset-4"
            >
              Cancel
            </Link>

            <p className="w-full text-sm text-muted">
              A category has no draft state — its archive goes live as soon as
              it is created, empty, as a heading and an empty state. It is
              noindex and off the sitemap until a post is filed under it.
            </p>
          </div>
        ) : (
          /*
           * Delete sits at the bottom, outside the save bar and styled as a
           * plain destructive control rather than a button next to Save. An
           * irreversible action should not be one mis-aimed click away from
           * the one performed constantly.
           */
          <section className="border-t border-hairline pt-6">
            <h2 className="font-display text-base font-extrabold tracking-display">
              Delete this category
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              {postCount > 0 ? (
                <>
                  {postCount} {postCount === 1 ? 'post is' : 'posts are'} filed
                  under this category
                  {drafts > 0 && ` — ${publishedCount} published and ${drafts} not`}
                  , so it cannot be deleted. Move{' '}
                  {postCount === 1 ? 'it' : 'them'} to another category first.
                  Every post must have one, so deleting now would leave{' '}
                  {postCount === 1 ? 'that post' : 'those posts'} unopenable in
                  the editor — and a draft is the one nobody would think to
                  check.
                </>
              ) : (
                <>
                  Nothing is filed here, so no post would be orphaned. The
                  archive URL starts returning 404 and no redirect is recorded —
                  there is no replacement page to point at, and a 301 to /blog
                  would be a lie about what the visitor asked for.
                </>
              )}
            </p>

            <button
              type="button"
              onClick={remove}
              disabled={deleting || postCount > 0}
              className="mt-3 rounded-full border-2 border-error px-5 py-2 text-sm font-semibold text-error transition-colors hover:bg-error hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete category'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
