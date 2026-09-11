import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import Trip from '../../../../../models/Trip';
import Destination from '../../../../../models/Destination';
import Activity from '../../../../../models/Activity';
import Redirect from '../../../../../models/Redirect';
import { adminTripSchema } from '../../../../../lib/validators/adminTrip';
import { isSlugTaken } from '../../../../../lib/queries/adminTrips';
import { findStalePriceCopy } from '../../../../../lib/staleCopy';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/trips/[id] — save a trip.
 *
 * ## How this differs from the Express equivalent
 *
 * The dynamic segment is the folder name, not a path pattern: this file is
 * what `app.patch('/api/admin/trips/:id', ...)` would have been. There is no
 * `req.params` — params arrive as the handler's **second argument**, and in
 * Next 15+ they are a Promise that must be awaited. The exported function name
 * is the method, so a GET here is a 405 with nothing written, and there is no
 * `router.use(requireAuth)`: the auth check is the first line of the function.
 *
 * The one thing with no Express equivalent at all is `revalidatePath()` — see
 * below.
 */

/** The paths a trip appears on. Built twice per save: before and after. */
interface TripLocation {
  destinationSlug: string;
  activitySlug: string | null;
  tripSlug: string;
}

function tripPagePath(location: TripLocation): string {
  const segments = [location.destinationSlug];

  if (location.activitySlug) segments.push(location.activitySlug);

  segments.push(location.tripSlug);

  return `/${segments.join('/')}`;
}

/**
 * Every cached page this trip's content appears on.
 *
 * Not just the trip page. A price shows on the destination page, the activity
 * page, the /trips listing and the activities overview, and a client who edits
 * a price, sees it change on one screen and not the others concludes the CMS is
 * broken — which is worse than it not updating at all, because it looks like
 * data loss.
 */
function affectedPaths(location: TripLocation): string[] {
  const paths = [
    tripPagePath(location),
    `/${location.destinationSlug}`,
    `/${location.destinationSlug}/activities`,
    '/trips',
  ];

  if (location.activitySlug) {
    paths.push(`/${location.destinationSlug}/${location.activitySlug}`);
  }

  return paths;
}

async function resolveLocation(
  destinationId: unknown,
  activityId: unknown,
  tripSlug: string
): Promise<TripLocation | null> {
  const destination = await Destination.findById(destinationId)
    .select('slug')
    .lean<{ slug: string }>()
    .exec();

  if (!destination) return null;

  const activity = activityId
    ? await Activity.findById(activityId).select('slug').lean<{ slug: string }>().exec()
    : null;

  return {
    destinationSlug: destination.slug,
    activitySlug: activity?.slug ?? null,
    tripSlug,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    // 404, not 403 — an authorisation error confirms the endpoint exists and is
    // worth attacking. Same reasoning as the middleware.
    return new NextResponse(null, { status: 404 });
  }

  /*
   * The session cookie is SameSite=Lax, which already blocks a cross-site form
   * post. This covers what Lax does not: it is a same-*site* policy, so a
   * subdomain that was ever compromised could otherwise drive this endpoint.
   */
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const parsed = adminTripSchema.safeParse(body);

  if (!parsed.success) {
    // Field-keyed, so the editor can attach each message to its input and open
    // the tab that holds it.
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }

    return NextResponse.json(
      { error: 'Some fields need checking.', fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  await connectDB();

  /*
   * `findById` → assign → `save()`, per CLAUDE.md — never `findByIdAndUpdate`.
   * Query middleware does not run `pre('validate')`, and Trip's Nepal/activity
   * rule lives in exactly that hook. `runValidators: true` would run the path
   * validators and skip the hook, so a Bhutan trip could be given an activity
   * and save cleanly.
   */
  let trip;

  try {
    trip = await Trip.findById(id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!trip) return new NextResponse(null, { status: 404 });

  if (await isSlugTaken(data.slug, id)) {
    return NextResponse.json(
      {
        error: 'Some fields need checking.',
        fieldErrors: { slug: 'Another trip already uses this slug.' },
      },
      { status: 400 }
    );
  }

  /*
   * Where the trip lives *now*, captured before anything is reassigned. If the
   * slug, destination or activity changes, the old URL's cached page has to be
   * revalidated too — otherwise it keeps serving the trip from a path that no
   * longer resolves, and two URLs show the same trip until something else
   * evicts one. That is a duplicate-content problem on a site whose traffic is
   * the business.
   */
  const previousLocation = await resolveLocation(
    trip.destination,
    trip.activity,
    trip.slug
  );

  const previousSlug = trip.slug;
  const wasPublished = trip.status === 'published';
  // Kept for the stale-copy check after the save.
  const previousPrice = trip.price;

  // --- assign ---

  trip.title = data.title;
  trip.slug = data.slug;
  trip.destination = new mongoose.Types.ObjectId(data.destination);
  /*
   * `null`, not `undefined`, when no activity is selected. Assigning undefined
   * leaves the stored value untouched, so moving a trip from Nepal to Bhutan
   * would keep its Nepal activity and then fail the validate hook with a
   * message about a field the admin thought they had cleared.
   */
  trip.activity = data.activity
    ? new mongoose.Types.ObjectId(data.activity)
    : null;
  trip.summary = data.summary;
  trip.answerBlock = data.answerBlock;
  trip.description = data.description;
  trip.status = data.status;
  trip.featured = data.featured;

  trip.durationDays = data.durationDays;
  trip.difficulty = data.difficulty as typeof trip.difficulty;
  trip.bestMonths = data.bestMonths;
  trip.region = data.region;
  trip.maxAltitudeM = data.maxAltitudeM;
  trip.peakName = data.peakName;
  trip.tripGrade = data.tripGrade;
  trip.minGroupSize = data.minGroupSize;
  trip.maxGroupSize = data.maxGroupSize;
  /*
   * Turning this off never clears stored itinerary altitudes — the model says
   * so explicitly and this route must not quietly do otherwise. Unticking a box
   * is usually a mistake, and the values reappear if it is ticked again.
   */
  trip.hasElevationProfile = data.hasElevationProfile;
  trip.startPoint = data.startPoint;
  trip.endPoint = data.endPoint;

  trip.price = data.price;
  trip.discountedPrice = data.discountedPrice;
  trip.priceLabel = data.priceLabel;

  /*
   * `key` is stripped from every row. It is the editor's React key — a
   * rendering detail — and storing it would put it in MongoDB on every
   * subdocument, where it outlives the component that made it.
   */
  trip.groupPricing = data.groupPricing.map((tier) => ({
    minPeople: tier.minPeople,
    maxPeople: tier.maxPeople,
    pricePerPerson: tier.pricePerPerson,
    label: tier.label,
  }));

  /*
   * `day` is renumbered from the array order, never taken from the client.
   *
   * The editor reorders by dragging, so the array order *is* the itinerary
   * order — and a day number sent alongside it would be a second source of
   * truth that disagrees the moment anything moves. Renumbering here means a
   * drag cannot produce "Day 3, Day 2, Day 4", and a deleted day cannot leave
   * a gap.
   */
  trip.itinerary = data.itinerary.map((entry, index) => ({
    day: index + 1,
    title: entry.title,
    description: entry.description,
    location: entry.location,
    maxAltitudeM: entry.maxAltitudeM,
    distanceKm: entry.distanceKm,
    durationHours: entry.durationHours,
    accommodation: entry.accommodation,
    meals: entry.meals,
    image: entry.image,
    imageAlt: entry.imageAlt,
  }));

  trip.includes = data.includes;
  trip.excludes = data.excludes;

  trip.faqs = data.faqs.map((faq) => ({
    question: faq.question,
    answer: faq.answer,
  }));

  trip.coverImage = data.coverImage;
  trip.coverImageAlt = data.coverImageAlt;
  trip.gallery = data.gallery.map((image) => ({
    url: image.url,
    alt: image.alt,
    caption: image.caption,
  }));

  trip.metaTitle = data.metaTitle;
  trip.metaDescription = data.metaDescription;
  trip.canonicalUrl = data.canonicalUrl;
  trip.ogTitle = data.ogTitle;
  trip.ogDescription = data.ogDescription;
  trip.ogImage = data.ogImage;
  trip.schemaType = data.schemaType;
  trip.noIndex = data.noIndex;

  /*
   * A changed slug on a published trip retains the old one and gets a 301.
   *
   * CLAUDE.md makes this a rule for every slugged model, and it is the single
   * highest-cost thing to forget here: a renamed published trip abandons
   * whatever ranking the old URL held, and every existing inbound link starts
   * 404ing. `slugHistory` feeds the catch-all; the Redirect row is what the
   * migration screen reports on.
   *
   * Only when it *was* published. Renaming a draft nobody has ever been able to
   * reach would otherwise fill the redirect table with rows pointing at URLs
   * that never existed, and bury the real ones from the WordPress cutover.
   */
  if (previousSlug !== data.slug && wasPublished) {
    if (!trip.slugHistory.includes(previousSlug)) {
      trip.slugHistory.push(previousSlug);
    }
  }

  /*
   * A trip's current slug must never appear in its own history.
   *
   * Renaming A → B → A is not hypothetical — it is what happens when someone
   * tries a new title, does not like it, and changes it back. Without this,
   * `everest-base-camp-trek` ends up in the history of the trip that currently
   * lives at `everest-base-camp-trek`, and the 301 catch-all then redirects the
   * live URL away from itself. The page becomes unreachable, and the cause
   * looks nothing like the edit that caused it.
   *
   * Unconditional, not inside the branch above: history written by an earlier
   * save has to be cleaned up too, not just history written by this one.
   */
  trip.slugHistory = trip.slugHistory.filter((old) => old !== data.slug);

  try {
    await trip.save();
  } catch (error) {
    /*
     * Two shapes arrive here and admin error handling has to cope with both.
     *
     * A document hook produces a ValidationError with a populated `.errors`
     * keyed by field path — which maps straight onto form fields. The Nepal
     * asymmetry check is one of these. But query middleware has no document to
     * attach errors to, and a duplicate-key collision is a MongoServerError
     * with neither: code that only unwraps `err.errors` shows nothing at all
     * for those, and the admin sees a spinner stop with no explanation.
     */
    if (error instanceof mongoose.Error.ValidationError) {
      const fieldErrors: Record<string, string> = {};

      for (const [path, detail] of Object.entries(error.errors)) {
        // Subdocument paths arrive as `itinerary.3.maxAltitudeM`; the editor
        // keys on the top-level field, so the tab can be opened.
        fieldErrors[path] = detail.message;
      }

      return NextResponse.json(
        { error: 'Some fields need checking.', fieldErrors },
        { status: 400 }
      );
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json(
        {
          error: 'Some fields need checking.',
          fieldErrors: { slug: 'Another trip already uses this slug.' },
        },
        { status: 400 }
      );
    }

    console.error('[admin/trips] Save failed:', error);

    return NextResponse.json(
      { error: 'Could not save. Nothing was changed.' },
      { status: 500 }
    );
  }

  // --- after the save, and only after it ---

  /*
   * Where the trip lives now. Needed by both the redirect bookkeeping and the
   * revalidation below, so it is resolved once.
   */
  const newLocation = await resolveLocation(
    trip.destination,
    trip.activity,
    trip.slug
  );

  /*
   * Nothing may redirect *away from* the URL the trip now occupies.
   *
   * The A → B → A rename is the case: the first save wrote A → B, and after the
   * second save the trip is back at A. Leaving that row means A redirects to B,
   * B redirects to A, and the browser reports a redirect loop on a page that is
   * otherwise perfectly fine. Deleting rather than deactivating, because a
   * disabled row pointing at a stale URL is not a record anyone benefits from
   * keeping.
   */
  if (newLocation) {
    try {
      await Redirect.deleteOne({ oldUrl: tripPagePath(newLocation) });
    } catch (error) {
      console.error('[admin/trips] Could not clear a stale redirect:', error);
    }
  }

  if (previousSlug !== data.slug && wasPublished && previousLocation) {
    /*
     * Written after `save()` succeeds, never before: a redirect pointing at a
     * trip whose save then failed would send visitors to a 404 that the
     * database insists is correct.
     *
     * `updateOne` with `upsert` rather than `create`, because `oldUrl` is
     * unique and an admin renaming A → B → A would otherwise hit a duplicate
     * key and see the whole save reported as failed after it had already
     * succeeded.
     */
    if (newLocation) {
      try {
        await Redirect.updateOne(
          { oldUrl: tripPagePath(previousLocation) },
          {
            $set: {
              newUrl: tripPagePath(newLocation),
              type: 301,
              isActive: true,
            },
          },
          { upsert: true }
        );
      } catch (error) {
        // Never fails the save. The trip is already stored; a missing redirect
        // is a problem to fix, not a reason to tell the admin their edit was
        // lost when it was not.
        console.error('[admin/trips] Could not record the slug redirect:', error);
      }
    }
  }

  /*
   * On-demand revalidation — the mechanism with no Express equivalent.
   *
   * Trip, destination and activity pages are statically generated with ISR.
   * Without this, an edit is invisible until the revalidate window expires,
   * which on this site is an hour. `revalidatePath` marks the cached entry
   * stale so the next request regenerates it, and the change is live in
   * seconds with no rebuild.
   *
   * Both locations are revalidated. If the slug or destination changed, the old
   * path has a cached page for a URL that no longer resolves, and leaving it
   * means the trip is served from two addresses at once.
   */
  const paths = new Set<string>();

  if (previousLocation) affectedPaths(previousLocation).forEach((p) => paths.add(p));
  if (newLocation) affectedPaths(newLocation).forEach((p) => paths.add(p));

  for (const path of paths) revalidatePath(path);

  /*
   * Computed after the save, and returned as `warnings` rather than as errors.
   *
   * The save has already happened — this is advisory, exactly like the
   * flat-price reconciliation. A price change leaves the old figure sitting in
   * the answer block and the meta description, which are the AI-extraction
   * target and the search snippet: the two worst places for a number the
   * company no longer charges, and the two furthest from the field that was
   * just edited.
   */
  const warnings = findStalePriceCopy({
    previousPrice,
    newPrice: trip.price,
    answerBlock: trip.answerBlock,
    metaDescription: trip.metaDescription,
  });

  return NextResponse.json({
    ok: true,
    warnings,
    slug: trip.slug,
    status: trip.status,
    updatedAt: trip.updatedAt,
    revalidated: [...paths],
    slugHistory: trip.slugHistory,
  });
}
