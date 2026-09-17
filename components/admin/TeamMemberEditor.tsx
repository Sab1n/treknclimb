'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { TeamMemberEditorValues } from '../../types/contentEditor';
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
 * One team member, create and edit.
 *
 * ## Why the credentials are a list and not a sentence
 *
 * This is the page's whole job. "Experienced team" is unverifiable; "NMA
 * trekking guide licence" is something a stranger can check against a register.
 * Each credential is its own entry so it renders as its own chip, and so one
 * that lapses is **removed** rather than edited out of a paragraph — which is
 * the version that gets missed.
 *
 * ## The photo is optional, its alt text is not
 *
 * CLAUDE.md requires alt text on every image before save, and a member with no
 * photo has no image to describe. So `photoAlt` is required exactly when
 * `photo` is set — the same rule in three places: the model's conditional
 * `required` for document saves, its `pre('findOneAndUpdate')` for query
 * middleware, and the Zod schema so the error arrives keyed to the field
 * rather than after a round trip. The model is the guarantee; this is the
 * message.
 *
 * The photo is filed under the record's **id**, because a person has no slug
 * and their name is neither unique nor stable enough to file images under.
 */
export default function TeamMemberEditor({
  mode,
  id,
  initialValues,
  updatedAt,
}: {
  mode: 'create' | 'edit';
  /** Absent while creating — there is no record yet. */
  id?: string;
  initialValues: TeamMemberEditorValues;
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

  function set<K extends keyof TeamMemberEditorValues>(
    key: K,
    value: TeamMemberEditorValues[K]
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
        mode === 'create' ? '/api/admin/team' : `/api/admin/team/${id}`,
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
        window.location.assign('/admin/team');
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
         * would let a second click create a second record.
         */
        router.push(`/admin/team/${result.id}`);
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
        `Delete ${values.name || 'this team member'}? This cannot be undone. To take them off the About page without losing the record, set the status to archived instead.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/admin/team/${id}`, { method: 'DELETE' });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setFormError(result.error ?? 'Could not delete this team member.');
        return;
      }

      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/team');
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
        message="This team member has unsaved changes. Leave the page and they will be lost."
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
          label="team member"
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
          <FieldRow>
            <TextField
              label="Name"
              id="name"
              required
              value={values.name}
              onChange={(v) => set('name', v)}
              error={errors.name}
              hint="As they would introduce themselves."
            />
            <TextField
              label="Role"
              id="role"
              required
              value={values.role}
              onChange={(v) => set('role', v)}
              error={errors.role}
              hint="Founder, lead trekking guide, operations."
            />
          </FieldRow>

          <TextAreaField
            label="Biography"
            id="bio"
            rows={5}
            maxLength={3000}
            value={values.bio}
            onChange={(v) => set('bio', v)}
            error={errors.bio}
            hint="A short paragraph. What they have actually done, not what they are like — this page exists to be checked, not admired."
          />

          <NumberField
            label="Years guiding"
            id="yearsExperience"
            value={values.yearsExperience}
            onChange={(v) => set('yearsExperience', v)}
            error={errors.yearsExperience}
            suffix="years"
            hint="Years in the profession, not years at this company. Leave blank rather than estimating — it is a claim about a named person."
          />
        </section>

        {/* ---------------- credentials ---------------- */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-display">
              Credentials
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Certifications and licences, one per line. These are the reason
              someone abroad decides this company is real, so each one should be
              something they could look up. Remove one when it lapses rather
              than leaving it.
            </p>
          </div>

          <StringList
            label="Credential"
            values={values.credentials}
            onChange={(next) => set('credentials', next)}
            placeholder="NMA trekking guide licence"
            addLabel="Add a credential"
            emptyLabel="No credentials listed. The chips are hidden on the page."
          />
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-display">
              Languages
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              A practical concern for a client choosing who to walk with.
            </p>
          </div>

          <StringList
            label="Language"
            values={values.languages}
            onChange={(next) => set('languages', next)}
            placeholder="English"
            addLabel="Add a language"
            emptyLabel="No languages listed. The line is hidden on the page."
          />
        </section>

        {/* ---------------- photo ---------------- */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-display">
              Photo
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Optional — the card renders a neutral block without one, so
              someone can be added before a portrait exists. If you add a photo
              it needs alt text, and that is enforced on save whatever this form
              does.
            </p>
          </div>

          <ImageField
            label="Photo"
            id="photo"
            collection="team"
            /*
             * Filed under the record's id where there is one. While creating
             * there is not, so the segment falls back to the name — safe
             * because the server still picks the folder from a closed list and
             * always appends eight random bytes.
             */
            recordId={
              mode === 'edit' && id ? id : { newSlug: values.name.trim() || 'new' }
            }
            publicId={values.photo}
            alt={values.photoAlt}
            onPublicIdChange={(v) => set('photo', v)}
            onAltChange={(v) => set('photoAlt', v)}
            errors={errors}
            publicIdField="photo"
            altField="photoAlt"
          />
        </section>

        {/* ---------------- listing ---------------- */}
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
              onChange={(v) => set('status', v)}
              options={PUBLISH_STATUSES.map((status) => ({
                value: status,
                label: status,
              }))}
              error={errors.status}
              hint="Only published members appear on About. Archive someone who has left rather than deleting them."
            />

            <NumberField
              label="Display order"
              id="displayOrder"
              value={values.displayOrder}
              onChange={(v) => set('displayOrder', v)}
              error={errors.displayOrder}
              hint="Lower sorts first."
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
              {saving ? 'Creating…' : 'Create team member'}
            </button>

            <Link href="/admin/team" className="text-sm underline underline-offset-4">
              Cancel
            </Link>

            <p className="w-full text-sm text-muted">
              Created as a draft. They appear on the About page only once the
              status is set to published.
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
              Delete this team member
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Nothing references a team member, so deleting one strands nothing.
              If they have simply left, archive them instead — it takes them off
              the About page and keeps the record.
            </p>

            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="mt-3 rounded-full border-2 border-error px-5 py-2 text-sm font-semibold text-error transition-colors hover:bg-error hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete team member'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * A repeatable list of plain strings.
 *
 * Smaller than `RepeatableList`, which exists for rows of several fields and
 * carries drag-and-drop. A credential is one input; dragging it is not worth
 * the machinery, and the order of certifications carries no meaning the way an
 * itinerary's does.
 *
 * Keyed by index, which is safe **only** because there is no reordering here —
 * the same assumption would be a bug in the drag lists, which is why those key
 * by a generated id instead.
 */
function StringList({
  label,
  values,
  onChange,
  placeholder,
  addLabel,
  emptyLabel,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  addLabel: string;
  emptyLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {values.length === 0 && (
        <p className="rounded-lg border border-dashed border-hairline bg-white px-4 py-6 text-center text-sm text-muted">
          {emptyLabel}
        </p>
      )}

      {values.map((value, index) => (
        <div key={index} className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label={`${label} ${index + 1}`}
              id={`${label.toLowerCase()}-${index}`}
              value={value}
              onChange={(next) =>
                onChange(values.map((v, i) => (i === index ? next : v)))
              }
              placeholder={placeholder}
            />
          </div>

          <button
            type="button"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
            aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            className="mb-1 rounded px-3 py-2 text-xs font-semibold text-error transition-colors hover:bg-error/10"
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="self-start rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
      >
        {addLabel}
      </button>
    </div>
  );
}
