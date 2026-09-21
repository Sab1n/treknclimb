import { getCldImageUrl } from 'next-cloudinary';
import { ITripPopulated } from '../models/Trip';
import type { TripFilterMeta } from '../lib/tripFilters';
import type { TripDifficulty } from '../models/Trip';
import { GRADE_ORDER } from '../lib/difficultyGrades';
import {
  formatRange,
  formatDays,
  formatMetres,
} from '../components/content/ActivityOverviewCard';

/**
 * Serialized shapes for the server/client boundary.
 *
 * Only plain objects cross into a Client Component. A Mongoose document carries
 * `Types.ObjectId` values, which are class instances, not plain objects — React
 * refuses to serialize them. So anything a Client Component needs gets mapped
 * to a DTO here first.
 *
 * Rules for anything added to this file:
 *
 * - `_id` and every ref become `string`. Nothing in the browser needs an
 *   ObjectId, and `String(id)` is the whole conversion.
 * - Cloudinary URLs are built here, on the server. That keeps the Cloudinary
 *   SDK and the cloud name out of the client bundle, and lets a missing
 *   configuration degrade to `null` rather than throwing mid-render.
 * - Only shapes that actually cross a boundary today. This file grows when a
 *   component needs it, not in anticipation.
 *
 * Note: neither DTO below carries an id, because no Client Component needs one
 * yet. The first one that does gets `id: string`, not `_id`.
 *
 * **Client Components must import from here with `import type`.** A value
 * import would pull `next-cloudinary` into the browser bundle; `import type`
 * is erased at compile time and costs nothing.
 */

export interface GalleryImageDTO {
  /** Grid-sized URL, or null when Cloudinary is not configured. */
  thumbUrl: string | null;
  /** Lightbox-sized URL. */
  fullUrl: string | null;
  alt: string;
  caption: string | null;
}

export interface ElevationPointDTO {
  day: number;
  title: string;
  altitudeM: number;
}

/**
 * Builds a transformed Cloudinary URL, returning null instead of throwing when
 * `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is unset. Callers render the styled
 * placeholder on null rather than taking the page down.
 */
export function cloudinaryUrl(
  publicId: string,
  width: number,
  height: number
): string | null {
  try {
    return getCldImageUrl({
      src: publicId,
      width,
      height,
      crop: { type: 'fill', gravity: 'auto', source: true },
    });
  } catch {
    return null;
  }
}

/**
 * The trip's images for the gallery: cover first, then the gallery array.
 * The cover is the featured image in the mosaic.
 */
export function toGalleryImages(trip: ITripPopulated): GalleryImageDTO[] {
  return [
    {
      thumbUrl: cloudinaryUrl(trip.coverImage, 1200, 800),
      fullUrl: cloudinaryUrl(trip.coverImage, 1800, 1200),
      alt: trip.coverImageAlt,
      caption: null,
    },
    ...trip.gallery.map((image) => ({
      thumbUrl: cloudinaryUrl(image.url, 800, 600),
      fullUrl: cloudinaryUrl(image.url, 1800, 1200),
      alt: image.alt,
      caption: image.caption ?? null,
    })),
  ];
}

/**
 * Itinerary days that have an altitude, for the elevation graph.
 *
 * Returns `[]` when the trip has no elevation profile, so the caller can decide
 * on length alone rather than checking the flag twice. `maxAltitudeM` is
 * optional on the interface — conditionally required only when
 * `hasElevationProfile` is set — hence the filter before the cast.
 */
export function toElevationPoints(trip: ITripPopulated): ElevationPointDTO[] {
  if (!trip.hasElevationProfile) return [];

  return trip.itinerary
    .filter((itineraryDay) => itineraryDay.maxAltitudeM != null)
    .map((itineraryDay) => ({
      day: itineraryDay.day,
      title: itineraryDay.title,
      altitudeM: itineraryDay.maxAltitudeM as number,
    }));
}

/**
 * The trip fields the /trips filters read, as plain serializable values.
 *
 * Deliberately not the whole trip: the filter component only needs enough to
 * decide whether a card is shown and in what order. The card itself is still a
 * Server Component, rendered on the server and handed across as a React node,
 * so none of its Cloudinary work reaches the browser.
 */
export function toTripFilterMeta(
  trip: ITripPopulated,
  /**
   * Region slugs keyed by stringified region id.
   *
   * Passed in rather than populated on the trip, deliberately. Adding `region`
   * to `ITripPopulated` would make that interface's promise false at every
   * other `.populate()` site that does not ask for it — and `.lean<T>()` is an
   * assertion, not a check, so nothing would catch it until a page threw.
   * The filters need one string, and one small lookup buys it without making
   * four other queries carry a join they have no use for.
   *
   * Defaults to empty so a caller with no regions in play is unaffected.
   */
  regionSlugById: ReadonlyMap<string, string> = new Map()
): TripFilterMeta {
  return {
    id: String(trip._id),
    title: trip.title,
    destinationSlug: trip.destination.slug,
    activitySlug: trip.activity ? trip.activity.slug : null,
    regionSlug: trip.region
      ? (regionSlugById.get(String(trip.region)) ?? null)
      : null,
    durationDays: trip.durationDays,
    difficulty: trip.difficulty ?? null,
    price: trip.price,
    featured: trip.featured,
    displayOrder: trip.displayOrder,
  };
}

/* ------------------------------------------------------------------ *
 * Activity comparison
 * ------------------------------------------------------------------ */

/**
 * One row of the activity comparison table, flat and serializable.
 *
 * The table is a Client Component now — sortable headers need state — so an
 * `IActivity` cannot cross the boundary: its `_id` and `destination` are
 * `Types.ObjectId`, which are class instances rather than plain objects, and
 * React refuses to serialize them.
 *
 * Every column is pre-resolved to a **sortable primitive plus a display
 * string**. The alternative — passing formatted text and parsing it back in
 * the browser to sort — is how "11–14 days" ends up sorting after "5 days".
 * `sortAltitude` and friends are what the comparator actually reads;
 * `altitude` is what the cell renders.
 *
 * `null` sort keys are activities with no published trips. They sort last in
 * both directions, because an unknown is not a small value.
 */
export interface ActivityComparisonRow {
  id: string;
  name: string;
  href: string;

  altitude: string;
  /** Highest altitude reached, for sorting. Null when no trip records one. */
  sortAltitude: number | null;

  length: string;
  /** Longest trip in days, for sorting. */
  sortLength: number | null;

  fitness: string;
  /** Index into GRADE_ORDER of the hardest grade that occurs. */
  sortFitness: number | null;

  tripCount: number;
}

/**
 * Builds the comparison rows on the server.
 *
 * The display strings and the sort keys are produced together, from the same
 * values, so they cannot disagree — which is the failure mode of formatting in
 * one place and sorting in another.
 *
 * `sortAltitude` and `sortLength` use the **maximum** of each range. Sorting a
 * range needs one number, and the top of the range is what someone comparing
 * "which of these goes highest" is asking about.
 */
export function toActivityComparisonRows(
  activities: { _id: unknown; name: string; slug: string }[],
  destinationSlug: string,
  stats: Map<
    string,
    {
      tripCount: number;
      minDuration: number | null;
      maxDuration: number | null;
      minAltitudeM: number | null;
      maxAltitudeM: number | null;
      difficulties: TripDifficulty[];
    }
  >
): ActivityComparisonRow[] {
  return activities.map((activity) => {
    const row = stats.get(String(activity._id));

    const ordered = GRADE_ORDER.filter((grade) =>
      (row?.difficulties ?? []).includes(grade)
    );

    return {
      id: String(activity._id),
      name: activity.name,
      href: `/${destinationSlug}/${activity.slug}`,

      altitude:
        formatRange(
          row?.minAltitudeM ?? null,
          row?.maxAltitudeM ?? null,
          formatMetres
        ) ?? '—',
      sortAltitude: row?.maxAltitudeM ?? null,

      length:
        formatRange(row?.minDuration ?? null, row?.maxDuration ?? null, formatDays)
          ?.concat(' days') ?? '—',
      sortLength: row?.maxDuration ?? null,

      fitness:
        ordered.length === 0
          ? '—'
          : ordered.length === 1
            ? ordered[0]
            : `${ordered[0]} to ${ordered[ordered.length - 1]}`,
      // Index of the hardest grade present, so "Easy to Moderate" sorts below
      // "Challenging" — the top of the range is what makes an activity hard.
      sortFitness:
        ordered.length === 0
          ? null
          : GRADE_ORDER.indexOf(ordered[ordered.length - 1]),

      tripCount: row?.tripCount ?? 0,
    };
  });
}
