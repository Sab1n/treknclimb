import { cache } from 'react';
import type { Types } from 'mongoose';

import { connectDB } from '../db';
import Region, { IRegion, IRegionPopulated } from '../../models/Region';
import Trip, { ITripPopulated } from '../../models/Trip';

/*
 * Imported as values because `getRegionRoutes` queries both directly — and
 * that import is load-bearing twice over, because it is also what registers
 * them with Mongoose so `.populate()` can resolve the refs by name at query
 * time. **If the direct use ever goes away, leave a bare
 * `import '../../models/Activity';` behind** rather than deleting the line, or
 * the populate starts working or throwing MissingSchemaError depending on what
 * else the render happened to import first.
 */
import Destination from '../../models/Destination';
import Activity from '../../models/Activity';

/**
 * Public reads for regions.
 *
 * ## Which region pages exist is decided by the trips, not by a flag
 *
 * A region page lives at `/<destination>/<activity>/region/<region>`, so it is
 * addressed by an activity even though a region belongs to a destination. The
 * set of live pages is therefore **derived**: the pair (activity, region)
 * exists as a page when a published trip carries both.
 *
 * That is deliberate, and it is the rule CLAUDE.md states twice.
 * **Nothing here may branch on `activity.slug === 'trekking'`.** Regions are
 * trekking-only today only because that is what the trips say; give a peak
 * climb a region and its page appears with no code change. A name test would
 * look correct now and fail silently on the second activity to get regions,
 * with nothing anywhere to explain the page that did not build.
 */

/**
 * One region by slug, with its destination populated.
 *
 * The destination is needed to build the URL, the breadcrumb, and — most
 * importantly — to check that the region actually belongs to the destination
 * in the path. Without that check `/india/trekking/region/annapurna` would
 * render Nepal's Annapurna page under India, which is a duplicate-content
 * problem rather than a cosmetic one.
 *
 * `cache()` because `generateMetadata` and the page body both call it, and
 * Next deduplicates `fetch()` but has no idea what a Mongoose query is.
 */
export const getRegionBySlug = cache(
  async (slug: string): Promise<IRegionPopulated | null> => {
    await connectDB();

    return Region.findOne({ slug })
      .populate('destination')
      .lean<IRegionPopulated>()
      .exec();
  }
);

/**
 * Published trips in one region **under one activity**.
 *
 * Both halves matter. A region page reached at `/nepal/trekking/region/everest`
 * is a page about trekking in Everest, and listing the peak climbs there too
 * would make it a different page from the one its URL and heading promise.
 */
export const getTripsByRegionAndActivity = cache(
  async (
    regionId: Types.ObjectId,
    activityId: Types.ObjectId
  ): Promise<ITripPopulated[]> => {
    await connectDB();

    return Trip.find({
      region: regionId,
      activity: activityId,
      status: 'published',
    })
      .sort({ featured: -1, displayOrder: 1, title: 1 })
      .populate('destination')
      .populate('activity')
      .lean<ITripPopulated[]>()
      .exec();
  }
);

/**
 * A region plus how many published trips it holds under one activity.
 *
 * `tripCount` is derived per request rather than stored. A counter on the
 * Region document would be one more thing to keep in step on every publish,
 * unpublish, region change and delete — and it would be wrong in a way nobody
 * notices, because a stale count still renders.
 */
export interface IRegionWithTripCount extends IRegion {
  tripCount: number;
}

/**
 * The regions worth linking from an activity page, in display order.
 *
 * Only regions that actually hold a published trip under this activity: a
 * "Browse by region" row offering a region with nothing in it sends visitors to
 * an empty page, which is worse than a shorter row.
 *
 * One aggregation for the counts rather than one query per region.
 */
export const getRegionsForActivity = cache(
  async (
    destinationId: Types.ObjectId,
    activityId: Types.ObjectId
  ): Promise<IRegionWithTripCount[]> => {
    await connectDB();

    const counts = await Trip.aggregate<{
      _id: IRegion['_id'] | null;
      count: number;
    }>([
      {
        $match: {
          destination: destinationId,
          activity: activityId,
          status: 'published',
          region: { $ne: null },
        },
      },
      { $group: { _id: '$region', count: { $sum: 1 } } },
    ]);

    if (counts.length === 0) return [];

    const countById = new Map(counts.map((row) => [String(row._id), row.count]));

    const regions = await Region.find({
      _id: { $in: counts.map((row) => row._id) },
    })
      .sort({ displayOrder: 1, name: 1 })
      .lean<IRegion[]>()
      .exec();

    return regions.map((region) => ({
      ...region,
      tripCount: countById.get(String(region._id)) ?? 0,
    }));
  }
);

/**
 * Every region, keyed by stringified id, for turning a trip's `region` ref
 * into a slug and a label.
 *
 * The `/trips` listing needs this because its trips are not populated with
 * their region — see the note on `toTripFilterMeta`. Regions are a handful of
 * documents, so one small read beats adding a join to a query four other pages
 * share.
 *
 * Keys are strings because two ObjectId instances holding the same value are
 * different object references and would never match as Map keys.
 */
export const getRegionLookup = cache(
  async (): Promise<Map<string, { slug: string; name: string }>> => {
    await connectDB();

    const regions = await Region.find()
      .select('_id slug name')
      .sort({ displayOrder: 1, name: 1 })
      .lean<{ _id: unknown; slug: string; name: string }[]>()
      .exec();

    return new Map(
      regions.map((region) => [
        String(region._id),
        { slug: region.slug, name: region.name },
      ])
    );
  }
);

/**
 * Every region page that has content, for `generateStaticParams` and the
 * sitemap.
 *
 * Built from published trips, so the list is exactly the set of pages with
 * something on them. A region with no published trip under an activity is not
 * prebuilt and not advertised — but the route still renders it on demand with
 * an empty state, which is what an admin who has just created a region and not
 * yet published its trips needs to see.
 */
export async function getRegionRoutes(): Promise<
  { destinationSlug: string; activitySlug: string; regionSlug: string }[]
> {
  await connectDB();

  const rows = await Trip.aggregate<{
    _id: { destination: string; activity: string; region: string };
  }>([
    {
      $match: {
        status: 'published',
        region: { $ne: null },
        activity: { $ne: null },
      },
    },
    {
      $group: {
        _id: {
          destination: '$destination',
          activity: '$activity',
          region: '$region',
        },
      },
    },
  ]);

  if (rows.length === 0) return [];

  /*
   * `$lookup` would do this in the pipeline, but three joins to resolve three
   * slugs is harder to read than three small finds against a handful of
   * documents — there are four destinations, three activities and four
   * regions.
   */
  const [destinations, activities, regions] = await Promise.all([
    Destination.find().select('_id slug').lean<{ _id: unknown; slug: string }[]>(),
    Activity.find().select('_id slug').lean<{ _id: unknown; slug: string }[]>(),
    Region.find().select('_id slug').lean<{ _id: unknown; slug: string }[]>(),
  ]);

  const slugById = (list: { _id: unknown; slug: string }[]) =>
    new Map(list.map((item) => [String(item._id), item.slug]));

  const destinationSlugs = slugById(destinations);
  const activitySlugs = slugById(activities);
  const regionSlugs = slugById(regions);

  const routes: { destinationSlug: string; activitySlug: string; regionSlug: string }[] = [];

  for (const row of rows) {
    const destinationSlug = destinationSlugs.get(String(row._id.destination));
    const activitySlug = activitySlugs.get(String(row._id.activity));
    const regionSlug = regionSlugs.get(String(row._id.region));

    // A broken ref has no URL to build. Skipped rather than guessed at.
    if (!destinationSlug || !activitySlug || !regionSlug) continue;

    routes.push({ destinationSlug, activitySlug, regionSlug });
  }

  return routes;
}
