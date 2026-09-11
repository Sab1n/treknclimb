'use client';

import type { TripEditorValues } from '../../../types/tripEditor';
import type {
  DestinationOption,
  ActivityOption,
} from '../../../lib/queries/adminTrips';
import {
  TextField,
  TextAreaField,
  CheckboxField,
  FieldRow,
} from '../fields';

/**
 * The shared SEO field set, plus a live search-result preview.
 *
 * The preview is the point of this tab. These fields are written blind
 * otherwise — an editor types a meta description with no sense of where Google
 * will cut it, and the truncation lands mid-clause on the page that was
 * supposed to bring in the traffic.
 */

/*
 * Google's limits are pixel-based, not character-based, and vary by device and
 * query. These are the conventional approximations, and they are labelled as
 * approximations rather than presented as rules — an editor who trusts a hard
 * number will pad a description to exactly 155 characters and gain nothing.
 */
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 155;

export default function TripSeoTab({
  values,
  errors,
  set,
  destinations,
  activities,
}: {
  values: TripEditorValues;
  errors: Record<string, string>;
  set: <K extends keyof TripEditorValues>(
    key: K,
    value: TripEditorValues[K]
  ) => void;
  destinations: DestinationOption[];
  activities: ActivityOption[];
}) {
  const destination = destinations.find((d) => d.id === values.destination);
  const activity = activities.find((a) => a.id === values.activity);

  const segments = [destination?.slug ?? '…'];
  if (activity) segments.push(activity.slug);
  segments.push(values.slug || '…');

  /*
   * The preview shows the fallbacks, not just what is typed. An empty meta
   * title does not produce an empty result — the page title is used — so a
   * preview that rendered nothing would teach the editor the wrong lesson
   * about what leaving it blank does.
   */
  const previewTitle = values.metaTitle || values.title || 'Untitled trip';
  const previewDescription =
    values.metaDescription || values.summary || 'No description yet.';

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SearchPreview
        title={`${previewTitle} | Trek & Climb Adventure`}
        url={`treknclimb.com/${segments.join('/')}`}
        description={previewDescription}
        usingFallbackTitle={!values.metaTitle}
        usingFallbackDescription={!values.metaDescription}
        noIndex={values.noIndex}
      />

      <TextField
        label="SEO title"
        id="metaTitle"
        value={values.metaTitle}
        onChange={(value) => set('metaTitle', value)}
        error={errors.metaTitle}
        hint={
          <>
            Falls back to the trip title. Around {TITLE_LIMIT} characters before
            Google truncates — currently{' '}
            <span
              className={
                previewTitle.length > TITLE_LIMIT ? 'text-error' : undefined
              }
            >
              {previewTitle.length}
            </span>
            , not counting the site name appended after it.
          </>
        }
      />

      <TextAreaField
        label="Meta description"
        id="metaDescription"
        rows={3}
        maxLength={DESCRIPTION_LIMIT}
        value={values.metaDescription}
        onChange={(value) => set('metaDescription', value)}
        error={errors.metaDescription}
        hint="Falls back to the summary. Not a ranking factor, but it is the sentence that decides whether the click happens."
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
          label="Canonical URL"
          id="canonicalUrl"
          value={values.canonicalUrl}
          onChange={(value) => set('canonicalUrl', value)}
          error={errors.canonicalUrl}
          hint="Override only. Leave blank and the page canonicals to itself, which is almost always right."
        />

        <TextField
          label="Schema type override"
          id="schemaType"
          value={values.schemaType}
          onChange={(value) => set('schemaType', value)}
          error={errors.schemaType}
          hint="Blank emits TouristTrip."
        />
      </FieldRow>

      <CheckboxField
        label="Hide from search engines"
        id="noIndex"
        checked={values.noIndex}
        onChange={(checked) => set('noIndex', checked)}
        error={errors.noIndex}
        description="Adds noindex and drops the page from the sitemap. The page stays reachable by anyone with the link — this is not a way to hide a trip, it is a way to keep it out of search results."
      />

      {/*
        Stated because it is the rule most likely to be undone by someone
        trying to help. Ratings are imported from TripAdvisor rather than
        collected first-party, and emitting them as aggregateRating breaches
        Google's review-snippet policy — a manual action on a site whose entire
        value is organic traffic.
      */}
      <p className="max-w-prose rounded border border-hairline bg-white px-4 py-3 text-xs text-muted">
        Ratings are never emitted as <code>aggregateRating</code> in structured
        data, however they are filled in. They are imported from off-site
        platforms, so marking them up risks a manual action — they are display
        only, always shown with their source.
      </p>
    </div>
  );
}

/**
 * A search result, drawn to scale.
 *
 * The truncation is the useful part: an ellipsis appearing mid-sentence tells
 * an editor more than a character counter does, because it shows *which* words
 * survive. Google truncates on pixel width and this counts characters, so it
 * approximates — the caption says so, rather than implying a precision that
 * would be false.
 */
function SearchPreview({
  title,
  url,
  description,
  usingFallbackTitle,
  usingFallbackDescription,
  noIndex,
}: {
  title: string;
  url: string;
  description: string;
  usingFallbackTitle: boolean;
  usingFallbackDescription: boolean;
  noIndex: boolean;
}) {
  const clamp = (text: string, limit: number) =>
    text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;

  return (
    <section className="rounded-lg border border-hairline bg-white p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Search result preview
      </h2>

      {noIndex ? (
        <p className="mt-3 rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          This trip is set to noindex, so it will not appear in search results
          at all.
        </p>
      ) : (
        <div className="mt-3 max-w-xl">
          <p className="text-xs text-[#4d5156]">{url}</p>
          <p className="mt-0.5 text-lg text-[#1a0dab]">
            {clamp(title, TITLE_LIMIT + 25)}
          </p>
          <p className="mt-0.5 text-sm text-[#4d5156]">
            {clamp(description, DESCRIPTION_LIMIT)}
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        Approximate — Google truncates on pixel width, not character count, and
        rewrites descriptions when it judges another passage a better answer.
        {usingFallbackTitle && ' Title is falling back to the trip title.'}
        {usingFallbackDescription && ' Description is falling back to the summary.'}
      </p>
    </section>
  );
}
