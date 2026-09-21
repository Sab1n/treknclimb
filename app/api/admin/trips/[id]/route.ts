import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import mongoose from 'mongoose';

import { connectDB } from '../../../../../lib/db';
import { requireAdmin } from '../../../../../lib/adminAuth';
import Trip from '../../../../../models/Trip';
import Destination from '../../../../../models/Destination';
import Activity from '../../../../../models/Activity';
import Region from '../../../../../models/Region';
import Redirect from '../../../../../models/Redirect';
import BlogPost from '../../../../../models/BlogPost';
import Testimonial from '../../../../../models/Testimonial';
import BookingRequest from '../../../../../models/BookingRequest';
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

/**
 * The paths a trip appears on. Built twice per save: before and after.
 *
 * `regionSlug` is here for the same reason `activitySlug` is: it is part of a
 * URL the trip appears on, and **moving the trip changes it**. A location built
 * only from the new values could not name the page the trip has just left, and
 * that page is the one still serving stale HTML.
 *
 * Both are `| null` rather than optional, because null is a real value here:
 * three destinations out of four have no activity layer, and most trips have no
 * region. `?` would invite `undefined` checks that read as "this field might
 * be missing" when what is meant is "this trip genuinely has none".
 */
interface TripLocation {
  destinationSlug: string;
  activitySlug: string | null;
  regionSlug: string | null;
  tripSlug: string;
}

/**
 * The region listing this trip appears on, or null if it has no URL.
 *
 * Needs both halves. A region page is addressed as
 * `/<destination>/<activity>/region/<region>`, so a trip with a region but no
 * activity — an India trip filed under Ladakh — has no region page to purge:
 * the only region route sits under an activity segment. That is a recorded
 * design decision, not a gap, so the null is returned rather than a path
 * assembled out of the pieces that do exist.
 */
function regionPagePath(location: TripLocation): string | null {
  if (!location.activitySlug || !location.regionSlug) return null;

  return `/${location.destinationSlug}/${location.activitySlug}/region/${location.regionSlug}`;
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
    /*
     * Both are generated from every published trip — the sitemap lists the URL
     * and its `lastModified`, and /llms.txt carries the published count and the
     * price range. Every save changes at least `updatedAt`, so there is no
     * condition worth writing here: purging them unconditionally is both
     * simpler and a superset of "purge when the URL set changes".
     *
     * The case that made this necessary is publish and archive. Archiving takes
     * a trip out of `getSitemapRoutes()`, but the cached /sitemap.xml keeps
     * offering the URL to crawlers for the full revalidate window — a sitemap
     * advertising a page that now 404s.
     */
    '/sitemap.xml',
    '/llms.txt',
  ];

  if (location.activitySlug) {
    paths.push(`/${location.destinationSlug}/${location.activitySlug}`);
  }

  /*
   * The region listing, when this trip has one.
   *
   * Built from the trip's own location rather than by querying the region's
   * trips, and that difference is the whole point. A query run after the save
   * returns the trips that are in the region *now*, so a trip that has just
   * left one would not name the page it left — and if it was the region's only
   * trip, the query returns nothing at all and purges nothing. The page would
   * go on serving its cached, indexable version of a region that is now empty
   * and supposed to be `noindex`.
   *
   * The activity page above is already in the list, which matters here too: its
   * "Browse by region" row carries the trip count, and a region that just
   * emptied has to disappear from it.
   */
  const regionPath = regionPagePath(location);

  if (regionPath) paths.push(regionPath);

  return paths;
}

async function resolveLocation(
  destinationId: unknown,
  activityId: unknown,
  regionId: unknown,
  tripSlug: string
): Promise<TripLocation | null> {
  const destination = await Destination.findById(destinationId)
    .select('slug')
    .lean<{ slug: string }>()
    .exec();

  if (!destination) return null;

  /*
   * Both refs are optional and both are looked up only when set, so a trip with
   * no activity and no region costs one query rather than three.
   */
  const [activity, region] = await Promise.all([
    activityId
      ? Activity.findById(activityId).select('slug').lean<{ slug: string }>().exec()
      : null,
    regionId
      ? Region.findById(regionId).select('slug').lean<{ slug: string }>().exec()
      : null,
  ]);

  return {
    destinationSlug: destination.slug,
    activitySlug: activity?.slug ?? null,
    regionSlug: region?.slug ?? null,
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
    trip.region,
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
  /*
    * `null`, not `undefined`, when no region is selected — the same rule as
    * `activity` above. Assigning undefined to a path that already holds a value
    * leaves the old one in place, which is the "I cleared it and it came back"
    * bug.
    */
  trip.region = data.region
    ? new mongoose.Types.ObjectId(data.region)
    : null;
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
    trip.region,
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
   * Both locations are revalidated, and that is what makes a *move* correct.
   * If the slug or destination changed, the old path has a cached page for a
   * URL that no longer resolves, and leaving it means the trip is served from
   * two addresses at once. If the **region** changed, the old region's listing
   * still shows the trip — and when it was that region's only trip, the page
   * also still claims to be indexable, because `generateMetadata` decides
   * `noindex` from the trip count at the moment the page was generated.
   *
   * Nothing here branches on which field changed. The two locations are
   * compared by the Set, so an unchanged field contributes the same path twice
   * and is purged once.
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

/**
 * DELETE /api/admin/trips/[id] — delete a **draft** trip.
 *
 * ## Published trips are archived, never deleted
 *
 * A published trip has a URL that has been crawled, linked and possibly
 * booked from. Deleting it turns that URL into a 404 with no replacement to
 * redirect to, throws away whatever ranking it held, and leaves every inbound
 * link dead. `archived` already exists and does the right thing: the page
 * leaves the site and the sitemap, the record stays, and the decision is
 * reversible. So this refuses anything not in `draft` and says which action to
 * use instead — a 409, because the request is well-formed and permitted and it
 * is the state of the data that forbids it.
 *
 * A draft has never been public. There is no URL to preserve and nothing to
 * redirect, so deleting one is an ordinary undo of a record created by
 * mistake.
 *
 * ## References are cleared first, in one pass, before the delete
 *
 * Four things can point at a trip, and each fails differently if left dangling:
 *
 * - **`Trip.relatedTrips`** — a dead id renders nothing, but the trip editor's
 *   related-trips picker shows a blank row that cannot be removed because it
 *   does not resolve to anything to click.
 * - **`BlogPost.relatedTrips`** — the blog post's related section quietly
 *   renders one card fewer, with nothing to say why.
 * - **`Testimonial.trip`** — the testimonial stops being attributed to a trip
 *   and starts reading as generic praise.
 * - **`BookingRequest.trip`** — the worst of the four, and the reason
 *   `tripTitle` exists. It is **not** cleared here: the snapshot means the
 *   inquiry keeps saying what it was about, and the null reference is then
 *   accurate rather than lossy. Clearing it would be the same as the others;
 *   leaving it is what lets the admin flag the trip as deleted rather than
 *   pretending the inquiry was always general.
 *
 * Cleared **before** the delete, not after. If the delete succeeded and a
 * cleanup then failed, the references would point at nothing with no record
 * left to find them by; doing it first means a failure leaves the trip intact
 * and the operation retryable.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && new URL(origin).host !== host) {
    return new NextResponse(null, { status: 403 });
  }

  const { id } = await params;

  await connectDB();

  let trip;

  try {
    trip = await Trip.findById(id);
  } catch {
    // A malformed id is a 404, not a 500.
    return new NextResponse(null, { status: 404 });
  }

  if (!trip) return new NextResponse(null, { status: 404 });

  if (trip.status !== 'draft') {
    return NextResponse.json(
      {
        error:
          trip.status === 'published'
            ? 'A published trip cannot be deleted — its URL has been crawled and linked, and deleting it would leave those links dead with nothing to redirect to. Archive it instead: the page leaves the site and the sitemap, the record stays, and it can be brought back.'
            : 'Only drafts can be deleted. This trip is archived, which already keeps it off the site — deleting it would destroy the record along with any history attached to it.',
        status: trip.status,
      },
      { status: 409 }
    );
  }

  /* ---------------- clear what points at it ---------------- */

  const tripId = trip._id;

  const [relatedTrips, relatedPosts, testimonials] = await Promise.all([
    Trip.updateMany({ relatedTrips: tripId }, { $pull: { relatedTrips: tripId } }),
    BlogPost.updateMany(
      { relatedTrips: tripId },
      { $pull: { relatedTrips: tripId } }
    ),
    /*
     * `Testimonial.trip` is `Types.ObjectId | null` — nullable, not optional —
     * so it is set to null rather than unset. A missing key and a null would be
     * two shapes for one meaning, and the query `{ trip: null }` matches both
     * only by accident of how MongoDB treats absent keys.
     */
    Testimonial.updateMany({ trip: tripId }, { $set: { trip: null } }),
  ]);

  /*
   * Inquiries are counted but deliberately left pointing at the deleted id.
   * `tripTitle` carries the name, so the admin can show what was asked about
   * and mark it as deleted — clearing the ref would make it indistinguishable
   * from an inquiry that never named a trip.
   */
  const inquiries = await BookingRequest.countDocuments({ trip: tripId });

  await trip.deleteOne();

  /*
   * A draft has no public page, so there is nothing of its own to purge — but
   * the pages that *listed* it do not exist either, for the same reason. What
   * does change is the admin's own counts, and the blog and trip pages whose
   * related sections just lost a card.
   *
   * The generated files and the region listing are purged anyway, and it is
   * worth being straight about why, because **today this is a no-op**: only a
   * draft reaches this point, and neither the sitemap, /llms.txt nor a region
   * page lists drafts, so nothing they contain changes. It is here because the
   * alternative is a purge list that is correct only as long as the draft-only
   * rule holds, and the day that rule moves — a soft delete for archived trips,
   * say — this is not the file anyone would think to revisit. Two cache entries
   * on an operation that happens by hand is not a cost worth optimising.
   */
  const paths = new Set<string>(['/trips', '/sitemap.xml', '/llms.txt']);

  const deletedFrom = await resolveLocation(
    trip.destination,
    trip.activity,
    trip.region,
    trip.slug
  );

  const regionPath = deletedFrom && regionPagePath(deletedFrom);

  if (regionPath) paths.add(regionPath);

  if (relatedPosts.modifiedCount > 0) paths.add('/blog');

  for (const path of paths) revalidatePath(path);

  return NextResponse.json({
    ok: true,
    cleared: {
      relatedTrips: relatedTrips.modifiedCount,
      blogPosts: relatedPosts.modifiedCount,
      testimonials: testimonials.modifiedCount,
    },
    inquiriesKept: inquiries,
    revalidated: [...paths],
  });
}
