import type { Metadata } from 'next';
import { ITripPopulated } from '../models/Trip';
import { tripPath } from './urls';

const SITE_URL = 'https://treknclimb.com';

/**
 * Metadata from a trip's SEO fields, shared by both trip route shapes.
 *
 * Every field falls back to the trip's own content when the admin leaves it
 * blank. The canonical is always `tripPath()` — a trip's canonical URL is the
 * one under its destination and activity hierarchy, so both routes point at the
 * same address rather than competing.
 */
export function buildTripMetadata(trip: ITripPopulated): Metadata {
  const title = trip.metaTitle || trip.title;
  const description = trip.metaDescription || trip.summary;
  const url = `${SITE_URL}${tripPath(trip)}`;

  return {
    title,
    description,
    alternates: { canonical: trip.canonicalUrl || url },
    robots: trip.noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: trip.ogTitle || title,
      description: trip.ogDescription || description,
      url,
      type: 'article',
    },
  };
}
