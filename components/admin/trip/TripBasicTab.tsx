'use client';

import { useState } from 'react';

import type { TripEditorValues } from '../../../types/tripEditor';
import { slugifyTitle } from '../../../types/tripEditor';
import type {
  DestinationOption,
  ActivityOption,
} from '../../../lib/queries/adminTrips';
import { PUBLISH_STATUSES } from '../../../models/shared/status';
import {
  TextField,
  TextAreaField,
  SelectField,
  CheckboxField,
  FieldRow,
} from '../fields';

/**
 * Basic details: identity, placement in the hierarchy, and the three prose
 * fields.
 */
export default function TripBasicTab({
  values,
  errors,
  set,
  destinations,
  activities,
  destinationHasActivities,
  slugHistory,
}: {
  values: TripEditorValues;
  errors: Record<string, string>;
  set: <K extends keyof TripEditorValues>(
    key: K,
    value: TripEditorValues[K]
  ) => void;
  destinations: DestinationOption[];
  activities: ActivityOption[];
  destinationHasActivities: boolean;
  slugHistory: string[];
}) {
  /*
   * The slug follows the title only until someone edits the slug directly.
   *
   * Auto-generating forever would silently rewrite the URL of a published trip
   * every time a typo in the title was fixed — and on a site whose traffic is
   * the business, that is the most expensive accident the editor could enable.
   * Never generating means every new trip needs it typed twice.
   *
   * Starting locked when the two already disagree matters just as much: an
   * existing trip whose slug was deliberately shortened must not have that
   * undone by the first title edit.
   */
  const [slugLocked, setSlugLocked] = useState(
    () => values.slug !== '' && values.slug !== slugifyTitle(values.title)
  );

  function changeTitle(title: string) {
    set('title', title);

    if (!slugLocked) set('slug', slugifyTitle(title));
  }

  function changeSlug(slug: string) {
    setSlugLocked(true);
    set('slug', slug);
  }

  /*
   * Only this destination's activities. Showing all three Nepal activities
   * while Bhutan is selected would offer a choice that cannot save — the
   * model's validate hook rejects an activity on a destination without an
   * activity layer.
   */
  const activityOptions = activities
    .filter((activity) => activity.destinationId === values.destination)
    .map((activity) => ({ value: activity.id, label: activity.name }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <TextField
        label="Trip title"
        id="title"
        required
        value={values.title}
        onChange={changeTitle}
        error={errors.title}
        hint="What it is called on cards, listings and the page heading."
      />

      <div>
        <TextField
          label="Slug"
          id="slug"
          required
          mono
          value={values.slug}
          onChange={changeSlug}
          error={errors.slug}
          hint={
            slugLocked
              ? 'Edited by hand — it no longer follows the title.'
              : 'Generated from the title as you type. Editing it stops that.'
          }
        />

        {/*
          The URL as it will actually be, assembled from the hierarchy. A slug
          field on its own does not show that a Nepal trip gains an activity
          segment and an India trip does not, and that asymmetry is the single
          most important rule in the codebase.
        */}
        <UrlPreview
          values={values}
          destinations={destinations}
          activities={activities}
        />

        {!slugLocked && values.slug !== '' && (
          <button
            type="button"
            onClick={() => setSlugLocked(true)}
            className="mt-2 text-xs underline underline-offset-4 text-muted"
          >
            Stop following the title
          </button>
        )}

        {slugHistory.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Previously at{' '}
            {slugHistory.map((old, index) => (
              <span key={old}>
                {index > 0 && ', '}
                <code className="font-mono">{old}</code>
              </span>
            ))}
            . Those still 301 here, and changing the slug again adds another.
          </p>
        )}
      </div>

      <FieldRow>
        <SelectField
          label="Destination"
          id="destination"
          required
          value={values.destination}
          onChange={(value) => {
            set('destination', value);

            /*
             * Clear the activity whenever the destination changes. Keeping it
             * would leave a Nepal activity attached to a Bhutan trip, which
             * fails the validate hook with a message about a field that is no
             * longer even on screen.
             */
            set('activity', '');
          }}
          options={destinations.map((destination) => ({
            value: destination.id,
            label: destination.name,
          }))}
          placeholder="Choose a destination"
          error={errors.destination}
        />

        {/*
          The Nepal asymmetry, rendered. The field appears only when the
          selected destination has an activity layer — read from
          `hasActivities`, never from the destination's name.
        */}
        {destinationHasActivities ? (
          <SelectField
            label="Activity"
            id="activity"
            required
            value={values.activity}
            onChange={(value) => set('activity', value)}
            options={activityOptions}
            placeholder="Choose an activity"
            error={errors.activity}
            hint="This destination has an activity layer, so a trip must belong to one."
          />
        ) : (
          values.destination && (
            <div className="self-end rounded border border-hairline bg-white px-3 py-2.5 text-xs text-muted">
              This destination has no activity layer, so the trip sits directly
              beneath it and no activity is stored.
            </div>
          )
        )}
      </FieldRow>

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
        hint="Draft and archived trips are excluded from the site and the sitemap."
      />

      <CheckboxField
        label="Featured"
        id="featured"
        checked={values.featured}
        onChange={(checked) => set('featured', checked)}
        description="Sorts ahead of other trips on destination and activity pages."
        error={errors.featured}
      />

      <TextAreaField
        label="Summary"
        id="summary"
        required
        rows={2}
        maxLength={400}
        value={values.summary}
        onChange={(value) => set('summary', value)}
        error={errors.summary}
        hint="The card and listing teaser. One or two lines."
      />

      <TextAreaField
        label="Answer block"
        id="answerBlock"
        required
        rows={5}
        maxLength={2000}
        value={values.answerBlock}
        onChange={(value) => set('answerBlock', value)}
        error={errors.answerBlock}
        hint="Cost, duration, difficulty and season in plain sentences, near the top of the page. Written, never generated — this is what an AI answer engine extracts, and it converts."
      />

      <TextAreaField
        label="Description"
        id="description"
        required
        rows={12}
        value={values.description}
        onChange={(value) => set('description', value)}
        error={errors.description}
        hint="The long-form overview. Markdown subset only — headings, paragraphs, lists, links and quotes. Nothing here is ever passed to dangerouslySetInnerHTML."
      />
    </div>
  );
}

/** The trip's URL, assembled from the current destination, activity and slug. */
function UrlPreview({
  values,
  destinations,
  activities,
}: {
  values: TripEditorValues;
  destinations: DestinationOption[];
  activities: ActivityOption[];
}) {
  const destination = destinations.find((d) => d.id === values.destination);
  const activity = activities.find((a) => a.id === values.activity);

  if (!destination) return null;

  const segments = [destination.slug];

  if (activity) segments.push(activity.slug);

  segments.push(values.slug || '…');

  return (
    <p className="mt-1.5 font-mono text-xs text-muted">
      treknclimb.com/{segments.join('/')}
    </p>
  );
}
