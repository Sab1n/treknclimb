'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  TripEditorValues,
  TripEditorMeta,
} from '../../types/tripEditor';
import type {
  DestinationOption,
  ActivityOption,
} from '../../lib/queries/adminTrips';
import TripBasicTab from './trip/TripBasicTab';
import TripFactsTab from './trip/TripFactsTab';
import TripPricingTab from './trip/TripPricingTab';
import TripSeoTab from './trip/TripSeoTab';
import TripSaveBar from './trip/TripSaveBar';
import ItineraryEditor from './trip/ItineraryEditor';
import ListEditor from './trip/ListEditor';
import GalleryUploader from './trip/GalleryUploader';
import FaqEditor from './trip/FaqEditor';
import UnsavedChangesGuard from './UnsavedChangesGuard';
import type { StaleCopyWarning } from '../../lib/staleCopy';

/**
 * The trip editor.
 *
 * The largest screen in the admin, and the one a content editor spends real
 * time in. Three decisions shape it.
 *
 * ## One form, tabs as views over it
 *
 * The tabs are **not** separate forms and do not save independently. All of
 * `values` is held here and submitted in one request, because the model has
 * cross-field rules — max group size against min, discounted price against
 * price, activity against the destination's `hasActivities` — and a per-tab
 * save cannot evaluate a rule whose other half lives on a tab that was not
 * submitted. It would also make a half-saved trip a normal outcome.
 *
 * The consequence is that a validation error can belong to a tab that is not
 * open, so `TAB_FOR_FIELD` maps every field back to its tab and a failed save
 * switches to the first one holding an error. An error the admin cannot see is
 * the same as no error at all — the save button just stops working.
 *
 * ## State is a plain object, not react-hook-form
 *
 * The public forms use RHF because they need per-field touch state, focus
 * management on submit and a resolver wired to a schema that runs in the
 * browser. This needs none of that: it is one submit, server-validated, with
 * ~30 flat fields and a dirty check. A `useState` object and a `set` helper is
 * less machinery for the same result, and it keeps the dirty comparison honest
 * — `initial` is the server's values, and `dirty` is a comparison against
 * them rather than a library's opinion.
 *
 * ## Unsaved-changes protection
 *
 * `beforeunload` catches the tab closing. It does not catch a client-side
 * navigation, which in the App Router is the far more likely way to lose an
 * edit — the sidebar is right there. That gap is real and is called out on the
 * save bar rather than papered over.
 */

const TABS = [
  'Basic',
  'Facts',
  'Pricing',
  'Itinerary',
  'Includes',
  'Gallery',
  'FAQs',
  'SEO',
] as const;

type TabName = (typeof TABS)[number];

/**
 * Which tab holds each field, so a server error can open the tab it belongs to.
 *
 * Keyed by the field name the API returns. Mongoose subdocument errors arrive
 * as `itinerary.3.maxAltitudeM`, so the lookup takes the first path segment.
 */
const TAB_FOR_FIELD: Record<string, TabName> = {
  title: 'Basic',
  slug: 'Basic',
  destination: 'Basic',
  activity: 'Basic',
  summary: 'Basic',
  answerBlock: 'Basic',
  description: 'Basic',
  status: 'Basic',
  featured: 'Basic',

  durationDays: 'Facts',
  difficulty: 'Facts',
  bestMonths: 'Facts',
  region: 'Facts',
  maxAltitudeM: 'Facts',
  peakName: 'Facts',
  tripGrade: 'Facts',
  minGroupSize: 'Facts',
  maxGroupSize: 'Facts',
  hasElevationProfile: 'Facts',
  startPoint: 'Facts',
  endPoint: 'Facts',

  price: 'Pricing',
  discountedPrice: 'Pricing',
  priceLabel: 'Pricing',
  groupPricing: 'Pricing',

  itinerary: 'Itinerary',
  includes: 'Includes',
  excludes: 'Includes',
  gallery: 'Gallery',
  coverImage: 'Gallery',
  coverImageAlt: 'Gallery',
  faqs: 'FAQs',

  metaTitle: 'SEO',
  metaDescription: 'SEO',
  canonicalUrl: 'SEO',
  ogTitle: 'SEO',
  ogDescription: 'SEO',
  ogImage: 'SEO',
  schemaType: 'SEO',
  noIndex: 'SEO',
};

export default function TripEditor({
  initialValues,
  meta,
  destinations,
  activities,
}: {
  initialValues: TripEditorValues;
  meta: TripEditorMeta;
  destinations: DestinationOption[];
  activities: ActivityOption[];
}) {
  const router = useRouter();

  const [tab, setTab] = useState<TabName>('Basic');
  const [values, setValues] = useState<TripEditorValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<StaleCopyWarning[]>([]);

  /*
   * The baseline the dirty check compares against.
   *
   * State, not a ref. A ref looks right — it is bookkeeping, not something
   * rendered — but reading `.current` during render is exactly what the React
   * Compiler forbids, and for a real reason: the compiler may skip a re-render
   * it believes nothing depends on, leaving "Unsaved changes" on screen after a
   * successful save. As state it is a dependency the compiler can see, and
   * updating it after a save is a re-render that has to happen anyway.
   */
  const [baseline, setBaseline] = useState(initialValues);

  const set = useCallback(
    <K extends keyof TripEditorValues>(key: K, value: TripEditorValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));

      /*
       * Clear this field's error as soon as it is edited. Leaving it would
       * mean an admin fixing a value and still seeing it flagged, which reads
       * as "my fix was wrong" rather than "this has not been rechecked".
       */
      setErrors((current) => {
        if (!(key in current)) return current;

        const next = { ...current };
        delete next[key as string];
        return next;
      });
    },
    []
  );

  /*
   * A structural comparison rather than a per-field one. Every value here is a
   * string, a boolean or an array of strings, so JSON round-tripping is a
   * faithful comparison — and key order is stable because both objects are
   * built from the same literal in `toTripEditorValues`.
   */
  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(baseline),
    [values, baseline]
  );

  /*
   * The destination decides whether the activity field exists at all — the
   * Nepal asymmetry, read from `hasActivities` rather than from a destination
   * name. Resolved here so the Basic tab renders it and the save bar can warn
   * about it without either re-deriving the rule.
   */
  const selectedDestination = destinations.find(
    (destination) => destination.id === values.destination
  );

  const destinationHasActivities = selectedDestination?.hasActivities ?? false;

  const errorCount = Object.keys(errors).length;

  /** How many errors each tab is holding, for the badge on the tab button. */
  const errorsByTab = useMemo(() => {
    const counts: Partial<Record<TabName, number>> = {};

    for (const field of Object.keys(errors)) {
      const tabName = TAB_FOR_FIELD[field.split('.')[0]];
      if (tabName) counts[tabName] = (counts[tabName] ?? 0) + 1;
    }

    return counts;
  }, [errors]);

  async function save() {
    setSaving(true);
    setFormError(null);
    setErrors({});
    setWarnings([]);

    try {
      const response = await fetch(`/api/admin/trips/${meta.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.status === 404) {
        /*
         * The session was revoked, or the trip is gone. A full page load, not
         * a router push: the cookie may no longer be valid, and a client-side
         * navigation would render the next screen from the router cache built
         * while signed in. A real request is what lets the middleware see the
         * state and redirect.
         */
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin/trips');
        return;
      }

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fieldErrors = (result.fieldErrors ?? {}) as Record<string, string>;

        setErrors(fieldErrors);
        setFormError(result.error ?? 'Could not save.');

        // Open the first tab that actually holds an error, in tab order rather
        // than in whatever order the server happened to report them.
        const firstTab = TABS.find((candidate) =>
          Object.keys(fieldErrors).some(
            (field) => TAB_FOR_FIELD[field.split('.')[0]] === candidate
          )
        );

        if (firstTab) setTab(firstTab);

        return;
      }

      /*
       * The server may have normalised the slug — lowercased it, or trimmed
       * it — so the saved value is read back rather than assumed. Otherwise
       * the editor would immediately look dirty again against a baseline that
       * never existed in the database.
       */
      const saved: TripEditorValues = { ...values, slug: result.slug ?? values.slug };

      setValues(saved);
      setBaseline(saved);
      setSavedAt(new Date().toISOString());
      /*
       * Advisory, and arriving *after* a successful save. These are not
       * validation failures — the trip is written — so they never block and
       * never revert anything.
       */
      setWarnings((result.warnings ?? []) as StaleCopyWarning[]);

      /*
       * Refresh the server component so the header's status chip, the slug
       * history and the trip list behind it match what was just written.
       */
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
        Catches a click on the sidebar, which `beforeunload` cannot see — the
        App Router swaps pages without the browser unloading. Mounted only while
        the form is dirty, so a clean editor never interrupts anything.
      */}
      <UnsavedChangesGuard
        when={dirty}
        message="This trip has unsaved changes. Leave the page and they will be lost."
      />

      <TripSaveBar
        dirty={dirty}
        saving={saving}
        status={values.status}
        savedAt={savedAt}
        updatedAt={meta.updatedAt}
        errorCount={errorCount}
        formError={formError}
        warnings={warnings}
        onDismissWarnings={() => setWarnings([])}
        onGoToField={(field) => {
          const target = TAB_FOR_FIELD[field];
          if (target) setTab(target);
        }}
        onSave={save}
      />

      {/* ---------------- tabs ---------------- */}

      {/*
        `role="tablist"` with real `aria-selected` and `aria-controls`, and the
        panel is a single `role="tabpanel"` that swaps content. Only the active
        panel is rendered, so an input on a hidden tab is not in the tab order —
        which is the thing that makes an off-screen form field impossible to
        reach with a keyboard and easy to leave half-filled.
      */}
      <div className="overflow-x-auto border-b border-hairline">
        <div role="tablist" aria-label="Trip sections" className="flex gap-1">
          {TABS.map((name) => {
            const active = tab === name;
            const tabErrors = errorsByTab[name] ?? 0;

            return (
              <button
                key={name}
                type="button"
                role="tab"
                id={`tab-${name}`}
                aria-selected={active}
                aria-controls="trip-tabpanel"
                onClick={() => setTab(name)}
                className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-ink text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {name}
                {tabErrors > 0 && (
                  <span
                    className="ml-2 rounded-full bg-error px-1.5 py-0.5 text-xs text-white"
                    /* The count alone reads as "2" next to a word. */
                    aria-label={`${tabErrors} ${tabErrors === 1 ? 'error' : 'errors'}`}
                  >
                    {tabErrors}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id="trip-tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="pb-24"
      >
        {tab === 'Basic' && (
          <TripBasicTab
            values={values}
            errors={errors}
            set={set}
            destinations={destinations}
            activities={activities}
            destinationHasActivities={destinationHasActivities}
            slugHistory={meta.slugHistory}
          />
        )}

        {tab === 'Facts' && (
          <TripFactsTab values={values} errors={errors} set={set} />
        )}

        {tab === 'Pricing' && (
          <TripPricingTab values={values} errors={errors} set={set} />
        )}

        {tab === 'SEO' && (
          <TripSeoTab
            values={values}
            errors={errors}
            set={set}
            destinations={destinations}
            activities={activities}
          />
        )}

        {tab === 'Itinerary' && (
          <ItineraryEditor
            days={values.itinerary}
            onChange={(days) => set('itinerary', days)}
            errors={errors}
            /*
             * Passed down live from the Facts tab. The altitude requirement is
             * derived from this on every render, so ticking the box over there
             * changes the label and the banner here immediately — rather than
             * surfacing minutes later as a save failure about another tab.
             */
            hasElevationProfile={values.hasElevationProfile}
            durationDays={values.durationDays}
          />
        )}

        {tab === 'Includes' && (
          <div className="flex max-w-3xl flex-col gap-10">
            <ListEditor
              label="What's included"
              hint="What the price covers. One item per line."
              id="includes"
              lines={values.includes}
              onChange={(lines) => set('includes', lines)}
              placeholder="All permits and national park fees"
            />

            <ListEditor
              label="What's not included"
              hint="What it does not. The honest version of this prevents arguments later."
              id="excludes"
              lines={values.excludes}
              onChange={(lines) => set('excludes', lines)}
              placeholder="International flights"
            />
          </div>
        )}

        {tab === 'Gallery' && (
          <GalleryUploader
            tripId={meta.id}
            coverImage={values.coverImage}
            coverImageAlt={values.coverImageAlt}
            gallery={values.gallery}
            errors={errors}
            onCoverChange={(value) => set('coverImage', value)}
            onCoverAltChange={(value) => set('coverImageAlt', value)}
            onGalleryChange={(rows) => set('gallery', rows)}
          />
        )}

        {tab === 'FAQs' && (
          <FaqEditor
            faqs={values.faqs}
            onChange={(faqs) => set('faqs', faqs)}
            errors={errors}
          />
        )}
      </div>
    </div>
  );
}
