import { getCldImageUrl } from 'next-cloudinary';
import { ITripPopulated } from '../models/Trip';
import type { TripFilterMeta } from '../lib/tripFilters';

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
export function toTripFilterMeta(trip: ITripPopulated): TripFilterMeta {
  return {
    id: String(trip._id),
    title: trip.title,
    destinationSlug: trip.destination.slug,
    activitySlug: trip.activity ? trip.activity.slug : null,
    durationDays: trip.durationDays,
    difficulty: trip.difficulty ?? null,
    price: trip.price,
    featured: trip.featured,
    displayOrder: trip.displayOrder,
  };
}
