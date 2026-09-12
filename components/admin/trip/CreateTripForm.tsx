'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type {
  DestinationOption,
  ActivityOption,
} from '../../../lib/queries/adminTrips';
import {
  createTripSchema,
  emptyCreateTrip,
  type CreateTripInput,
} from '../../../lib/validators/createTrip';
import { slugifyTitle } from '../../../types/tripEditor';
import { isReservedSlug } from '../../../models/shared/reservedSlugs';
import {
  TextField,
  NumberField,
  SelectField,
  FieldRow,
} from '../fields';

/**
 * The last availability answer, tagged with the slug it describes.
 *
 * `unknown` is a real outcome, not a missing one: it means the check could not
 * be made — a network failure — and the form says nothing rather than either
 * accusing a good slug or claiming a bad one is fine.
 */
type SlugCheck =
  | { slug: string; state: 'available' }
  | { slug: string; state: 'taken'; reason: string }
  | { slug: string; state: 'unknown' };

/**
 * Create a trip.
 *
 * ## Seven fields, and why not more
 *
 * A Trip has eleven required paths. Five of them — summary, answer block,
 * description, cover image and its alt text — are **required to publish, not
 * required to exist**, so a draft does not need them and this does not ask.
 *
 * The cover image could not be asked for even if it were wanted: an upload
 * signature is derived from an existing trip's slug, so there is nothing to
 * sign against until the trip is saved. That deadlock is what makes this a
 * separate screen rather than the editor opened against a blank document.
 *
 * Group sizes are missing for a different reason — they carry schema defaults
 * of 1 and 12, and a create form that asks for a default is a create form
 * asking the admin to do nothing useful.
 *
 * ## The slug is checked three ways, at three different moments
 *
 * Shape and the reserved list are **pure functions with no database behind
 * them**, so they run in the browser on every keystroke and the admin sees the
 * problem while typing. Uniqueness needs the server, so it is asked for on a
 * debounce. Neither is the guarantee — the unique index and the create route's
 * own checks are — but between them they mean a failed submit is rare rather
 * than routine.
 */
export default function CreateTripForm({
  destinations,
  activities,
}: {
  destinations: DestinationOption[];
  activities: ActivityOption[];
}) {
  const router = useRouter();

  const [values, setValues] = useState<CreateTripInput>(emptyCreateTrip);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /*
   * The slug follows the title until the slug is edited directly.
   *
   * On a *new* trip this starts unlocked, unlike the editor — where it starts
   * locked if the stored slug and title already disagree, so an existing
   * deliberate slug is not undone by a title fix. There is nothing deliberate
   * to protect yet here.
   */
  const [slugLocked, setSlugLocked] = useState(false);

  /*
   * The last answer the server gave, **tagged with the slug it was about**.
   *
   * Tagging is what makes this derivable rather than synchronised. A plain
   * boolean would need clearing whenever the slug changed — a `setState` in an
   * effect body, which is the pattern the React Compiler rejects and which
   * costs a second render to compute something already known. Comparing the tag
   * against the current slug at render time answers "is this answer still
   * about what is on screen?" with no extra state and no extra pass.
   */
  const [checked, setChecked] = useState<SlugCheck | null>(null);

  function set<K extends keyof CreateTripInput>(key: K, value: CreateTripInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));

    // Clear this field's error as it is edited — leaving it would tell an
    // admin their fix was wrong rather than unchecked.
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

  function changeSlug(slug: string) {
    setSlugLocked(true);
    set('slug', slug);
  }

  /*
   * The local slug problems — shape and the reserved list. Both are pure, so
   * they are computed on render rather than fetched, and they take priority
   * over the availability check: there is no point asking the server whether
   * `admin` is taken when it could never be used regardless.
   */
  const slug = values.slug.trim();

  const localSlugProblem =
    slug === ''
      ? null
      : !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        ? 'Use lowercase letters, numbers and single hyphens only'
        : isReservedSlug(slug)
          ? `"${slug}" is a reserved slug — it would shadow the static /${slug} route and this page would never be reachable.`
          : null;

  /** Debounced uniqueness check — the one question only the server can answer. */
  useEffect(() => {
    // Nothing worth asking the server about yet. No state is touched here —
    // the render below already knows not to show anything.
    if (slug === '' || localSlugProblem) return;

    let ignore = false;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/admin/trips/slug-available?slug=${encodeURIComponent(slug)}`
        );

        if (!response.ok) {
          /*
           * A failed check is not a failed slug. Recorded as `unknown` rather
           * than as "taken", so a network hiccup never accuses a perfectly good
           * slug — and rather than left unset, which would leave "Checking…" on
           * screen forever.
           */
          if (!ignore) setChecked({ slug, state: 'unknown' });
          return;
        }

        const result = await response.json();

        if (ignore) return;

        setChecked(
          result.available
            ? { slug, state: 'available' }
            : {
                slug,
                state: 'taken',
                reason: result.reason ?? 'Another trip already uses this slug.',
              }
        );
      } catch {
        if (!ignore) setChecked({ slug, state: 'unknown' });
      }
    }, 400);

    /*
     * `ignore` guards against out-of-order responses: without it, a slow answer
     * about a slug the admin has already changed could land after a fast one
     * about the slug on screen. The tag on `checked` would catch that anyway,
     * which makes this belt and braces — but it also cancels the pending timer,
     * so a fast typist fires one request rather than one per keystroke.
     */
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [slug, localSlugProblem]);

  /*
   * Derived, not stored. An answer tagged with a different slug is an answer
   * about something the admin has moved on from, so it reads as still checking.
   */
  const availability: SlugCheck['state'] | 'checking' | null =
    slug === '' || localSlugProblem
      ? null
      : checked && checked.slug === slug
        ? checked.state
        : 'checking';

  /*
   * The Nepal asymmetry. The activity field exists only when the selected
   * destination has an activity layer — read from `hasActivities`, never from
   * the destination's name. The model's `pre('validate')` hook is what enforces
   * it; this is the form not offering an impossible combination in the first
   * place.
   */
  const selectedDestination = destinations.find(
    (destination) => destination.id === values.destination
  );

  const destinationHasActivities = selectedDestination?.hasActivities ?? false;

  const activityOptions = activities
    .filter((activity) => activity.destinationId === values.destination)
    .map((activity) => ({ value: activity.id, label: activity.name }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    setFormError(null);

    /*
     * Parsed in the browser first, with the same schema the route uses. Not
     * because the browser can be trusted — the server parses it again — but
     * because a round trip to be told "Title is required" is a round trip that
     * did not need to happen.
     */
    const parsed = createTripSchema.safeParse(values);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};

      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }

      setErrors(fieldErrors);
      setFormError('Some fields need checking.');

      // Focus the first field that failed, in the order they appear on screen
      // rather than the order Zod reported them.
      const first = FIELD_ORDER.find((field) => fieldErrors[field]);
      if (first) document.getElementById(first)?.focus();

      return;
    }

    setSaving(true);
    setErrors({});

    try {
      const response = await fetch('/api/admin/trips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.status === 404) {
        /*
         * The session was revoked. A full page load, not a router push: the
         * cookie may no longer be valid, and a client-side navigation would
         * render from the router cache built while signed in.
         */
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin/trips');
        return;
      }

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fieldErrors = (result.fieldErrors ?? {}) as Record<string, string>;

        setErrors(fieldErrors);
        setFormError(result.error ?? 'Could not create the trip.');

        const first = FIELD_ORDER.find((field) => fieldErrors[field]);
        if (first) document.getElementById(first)?.focus();

        return;
      }

      /*
       * Straight into the editor. `push`, not `replace`: Back should return to
       * the trips list, which is where this was reached from — and the created
       * trip is already saved, so there is nothing on this form to preserve.
       *
       * `saving` is deliberately left true. The navigation is in flight and
       * re-enabling the button would let a second click create a second trip.
       */
      router.push(`/admin/trips/${result.id}`);
    } catch {
      setFormError('Could not reach the server. Nothing was created.');
      setSaving(false);
    }
  }

  const slugError = errors.slug ?? localSlugProblem ?? undefined;

  return (
    <form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-6">
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
          error={slugError}
          hint={
            slugLocked
              ? 'Edited by hand — it no longer follows the title.'
              : 'Generated from the title as you type. Editing it stops that.'
          }
        />

        <UrlPreview
          destination={selectedDestination}
          activity={activities.find((a) => a.id === values.activity)}
          slug={values.slug}
        />

        {/*
          Availability, shown only once the slug is locally valid. `role="status"`
          rather than `alert`: this updates while the admin types, and an
          assertive region would interrupt a screen reader mid-word on every
          keystroke.
        */}
        {!slugError && availability && availability !== 'unknown' && (
          <p role="status" className="mt-1.5 text-sm">
            {availability === 'checking' && (
              <span className="text-muted">Checking…</span>
            )}
            {availability === 'available' && (
              <span className="text-confirmed">That slug is free.</span>
            )}
            {availability === 'taken' && checked?.state === 'taken' && (
              <span className="text-error">{checked.reason}</span>
            )}
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
             * longer on screen.
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
          values.destination !== '' && (
            <div className="self-end rounded border border-hairline bg-white px-3 py-2.5 text-xs text-muted">
              This destination has no activity layer, so the trip sits directly
              beneath it and no activity is stored.
            </div>
          )
        )}
      </FieldRow>

      <FieldRow>
        <TextField
          label="Start point"
          id="startPoint"
          required
          value={values.startPoint}
          onChange={(value) => set('startPoint', value)}
          error={errors.startPoint}
          placeholder="Kathmandu"
        />

        <TextField
          label="End point"
          id="endPoint"
          required
          value={values.endPoint}
          onChange={(value) => set('endPoint', value)}
          error={errors.endPoint}
          placeholder="Pokhara"
        />
      </FieldRow>

      <FieldRow>
        <NumberField
          label="Duration"
          id="durationDays"
          required
          suffix="days"
          value={values.durationDays}
          onChange={(value) => set('durationDays', value)}
          error={errors.durationDays}
        />

        <NumberField
          label="Price"
          id="price"
          required
          suffix="USD per person"
          value={values.price}
          onChange={(value) => set('price', value)}
          error={errors.price}
          hint="Stored in USD, always. Adjustable later."
        />
      </FieldRow>

      {formError && (
        <p
          role="alert"
          className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
        >
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'Creating…' : 'Create draft and continue'}
        </button>

        <Link href="/admin/trips" className="text-sm underline underline-offset-4">
          Cancel
        </Link>
      </div>

      <p className="text-sm text-muted">
        The trip is created as a <strong>draft</strong> and is not visible on the
        site. You will land in the full editor to write the description, upload a
        cover image and fill in the itinerary — all of which are required before
        it can be published.
      </p>
    </form>
  );
}

/**
 * Fields in the order they appear on screen.
 *
 * Used to decide which invalid field to focus. Zod reports issues in schema
 * order, which is close but not identical, and focusing the *second* visible
 * error while the first sits above it unhighlighted is disorienting.
 */
const FIELD_ORDER = [
  'title',
  'slug',
  'destination',
  'activity',
  'startPoint',
  'endPoint',
  'durationDays',
  'price',
];

/**
 * The URL this trip will have, assembled from the hierarchy.
 *
 * Worth showing here rather than only in the editor, because the asymmetry is
 * the thing most likely to surprise: a Nepal trip gains an activity segment and
 * a Bhutan trip does not, and the slug field alone shows neither.
 */
function UrlPreview({
  destination,
  activity,
  slug,
}: {
  destination?: DestinationOption;
  activity?: ActivityOption;
  slug: string;
}) {
  if (!destination) return null;

  const segments = [destination.slug];

  if (activity) segments.push(activity.slug);

  segments.push(slug || '…');

  return (
    <p className="mt-1.5 font-mono text-xs text-muted">
      treknclimb.com/{segments.join('/')}
    </p>
  );
}
