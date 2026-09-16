'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { FaqEditorValues } from '../../types/contentEditor';
import type { DestinationOption } from '../../lib/queries/adminTrips';
import { PUBLISH_STATUSES } from '../../models/shared/status';
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
 * One FAQ entry, create and edit.
 *
 * The same component for both, like the activity editor and unlike trips: a FAQ
 * has no field that cannot exist before the record does, so a reduced create
 * form would be this form with things missing that are wanted immediately.
 *
 * ## The association decides where it renders
 *
 * `destination` is the only association, and it has two states:
 *
 * - not set   → the general `/faq` page
 * - set       → that destination page
 *
 * There is no trip option. A trip renders `Trip.faqs`, the embedded array,
 * written on the FAQs tab of the trip editor — see `models/Faq.ts` for why a
 * `trip` ref here bought nothing and was removed.
 *
 * The panel below says out loud where the answer will end up, because "where
 * does this appear" is the question an editor asks about a FAQ and a select
 * holding an ObjectId does not answer it. It is derived from the same rule the
 * server uses to decide which pages to purge on save (`faqPaths`); the two can
 * drift, and if they ever do, the panel is the half someone will notice.
 */
export default function FaqEntryEditor({
  mode,
  id,
  initialValues,
  destinations,
  updatedAt,
}: {
  mode: 'create' | 'edit';
  /** Absent while creating — there is no record yet. */
  id?: string;
  initialValues: FaqEditorValues;
  destinations: DestinationOption[];
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

  function set<K extends keyof FaqEditorValues>(
    key: K,
    value: FaqEditorValues[K]
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

  const selectedDestination = destinations.find(
    (destination) => destination.id === values.destination
  );

  /**
   * Where this entry will appear, in the words an editor uses.
   *
   * Mirrors `faqPaths` on the server. Derived rather than stored, so it
   * updates as the selects change — the point is to make the consequence of
   * the association visible while it is being chosen, not afterwards.
   */
  const appearsOn = useMemo(
    () =>
      selectedDestination
        ? `the ${selectedDestination.name} page`
        : 'the general FAQ page at /faq',
    [selectedDestination]
  );

  async function save() {
    setSaving(true);
    setFormError(null);
    setErrors({});

    try {
      const response = await fetch(
        mode === 'create' ? '/api/admin/faqs' : `/api/admin/faqs/${id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(values),
        }
      );

      if (response.status === 404) {
        /*
         * Session revoked. A full load rather than a router push — the cookie
         * may be invalid and a client navigation would render from cache.
         */
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin/faqs');
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
         * Into the editor for the record just made. `saving` stays true: the
         * navigation is in flight, and re-enabling the button would let a
         * second click create a second entry.
         */
        router.push(`/admin/faqs/${result.id}`);
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
        `Delete this FAQ? "${values.question.slice(0, 60)}${values.question.length > 60 ? '…' : ''}" will be gone for good. To hide it without losing it, set the status to archived instead.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/admin/faqs/${id}`, { method: 'DELETE' });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setFormError(result.error ?? 'Could not delete this FAQ.');
        return;
      }

      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/faqs');
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
        message="This FAQ has unsaved changes. Leave the page and they will be lost."
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
          label="FAQ"
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
        {/* ---------------- the answer ---------------- */}

        <section className="flex flex-col gap-6">
          <TextAreaField
            label="Question"
            id="question"
            required
            rows={2}
            maxLength={300}
            value={values.question}
            onChange={(value) => set('question', value)}
            error={errors.question}
            hint="Phrased the way a visitor would ask it. This is what goes into FAQPage structured data, so it is also what an AI assistant reads."
          />

          <TextAreaField
            label="Answer"
            id="answer"
            required
            rows={8}
            maxLength={5000}
            value={values.answer}
            onChange={(value) => set('answer', value)}
            error={errors.answer}
            hint="A complete answer in plain sentences. Half an answer that ends in “contact us” is not extractable, and extraction is most of the value here."
          />
        </section>

        {/* ---------------- where it goes ---------------- */}

        <section className="flex flex-col gap-6">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-display">
              Where it appears
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Leave the destination blank for the general FAQ page. Attaching it
              to a country moves it onto that country&rsquo;s page instead.
            </p>
          </div>

          <FieldRow>
            <SelectField
              label="Destination"
              id="destination"
              value={values.destination}
              onChange={(value) => set('destination', value)}
              options={destinations.map((destination) => ({
                value: destination.id,
                label: destination.name,
              }))}
              placeholder="Not destination-specific"
              error={errors.destination}
              hint="A question about one country — visas, seasons, permits."
            />

            <div />
          </FieldRow>

          {/*
            The consequence, stated. The select above holds an ObjectId; this is
            the only thing on the screen that says what choosing it does.
          */}
          <p
            role="status"
            className="rounded border border-hairline bg-white px-4 py-3 text-sm"
          >
            {values.status === 'published' ? (
              <>
                This answer shows on{' '}
                <strong className="font-semibold">{appearsOn}</strong>.
              </>
            ) : (
              <>
                Once published, this answer will show on{' '}
                <strong className="font-semibold">{appearsOn}</strong>. While it
                is {values.status} it appears nowhere.
              </>
            )}
          </p>

          {/*
            Where trip questions live. Not a warning any more — the trip option
            is gone from the model, so this is a signpost for an editor looking
            for something this screen deliberately does not do.
          */}
          <p className="max-w-prose text-xs text-muted">
            Questions about one specific trip are written on the FAQs tab of that
            trip in the{' '}
            <Link href="/admin/trips" className="underline underline-offset-4">
              trip editor
            </Link>
            , not here — they are stored on the trip itself so they move, copy
            and delete with it.
          </p>
        </section>

        {/* ---------------- listing ---------------- */}

        <section className="flex flex-col gap-6">
          <h2 className="font-display text-lg font-extrabold tracking-display">
            Listing
          </h2>

          <FieldRow>
            <TextField
              label="Category"
              id="category"
              value={values.category}
              onChange={(value) => set('category', value)}
              error={errors.category}
              hint="Groups the general FAQ page — Booking, On the trail, Money. Ignored for trip and destination entries, which are one short list each."
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
              hint="Archived hides it without losing it — the alternative to deleting."
            />
          </FieldRow>

          <NumberField
            label="Display order"
            id="displayOrder"
            value={values.displayOrder}
            onChange={(value) => set('displayOrder', value)}
            error={errors.displayOrder}
            hint="Lower sorts first, within whichever page this appears on. Easier to set by dragging on the list screen than by typing here."
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
              {saving ? 'Creating…' : 'Create FAQ'}
            </button>

            <Link href="/admin/faqs" className="text-sm underline underline-offset-4">
              Cancel
            </Link>
          </div>
        ) : (
          /*
           * Delete at the bottom, outside the save bar and styled as a
           * destructive link rather than a button beside Save. An irreversible
           * action should not be one mis-aimed click from the routine one.
           */
          <section className="border-t border-hairline pt-6">
            <h2 className="font-display text-base font-extrabold tracking-display">
              Delete this FAQ
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              Nothing references a FAQ, so deleting one strands nothing. If the
              answer is simply out of date, set the status to archived instead —
              it comes off the page and stays in the list.
            </p>

            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="mt-3 rounded-full border-2 border-error px-5 py-2 text-sm font-semibold text-error transition-colors hover:bg-error hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Delete FAQ'}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
