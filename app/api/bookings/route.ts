import { NextResponse } from 'next/server';
import type { Types } from 'mongoose';

import { connectDB } from '../../../lib/db';
import BookingRequest from '../../../models/BookingRequest';
import Trip from '../../../models/Trip';
import {
  bookingSubmissionSchema,
  MIN_COMPLETION_MS,
} from '../../../lib/validators/booking';
import { checkBookingRateLimit, clientIp } from '../../../lib/rateLimit';
import { verifyTurnstile } from '../../../lib/turnstile';
import { allocateReference } from '../../../lib/reference';
import { sendBookingEmails } from '../../../lib/email';
import { logRejection } from '../../../lib/rejections';
import {
  fromIsoDate,
  nepalToday,
  parseDepartureId,
  toSeasonView,
  type StoredSeason,
} from '../../../lib/departures';
import { snapshotDeparture } from '../../../lib/bookingDeparture';
import type { TripType } from '../../../models/shared/departures';
import type { IDepartureSnapshot } from '../../../models/BookingRequest';

/**
 * POST /api/bookings — the site's only conversion event.
 *
 * ## How this differs from the Express equivalent
 *
 * There is no app, no router, no `app.post('/api/bookings', handler)` and no
 * `next()`. The file path *is* the route: `app/api/bookings/route.ts` serves
 * `/api/bookings`, and the exported function name is the HTTP method. A `GET`
 * to this URL returns 405 automatically because no `GET` is exported.
 *
 * The handler takes a standard Web `Request` and returns a `Response`, not
 * Express's `(req, res)`. So there is no `res.json()` — you return
 * `NextResponse.json(...)`. Body parsing is explicit (`await request.json()`),
 * there is no `body-parser`, and middleware is not a chain: cross-cutting
 * concerns are just function calls, in the order written below.
 *
 * ## Order of operations, and why
 *
 * Cheap local checks first, then network calls, then the write:
 *
 *   1. Parse and validate the body        — free, and rejects malformed input
 *   2. Honeypot and time trap             — free, catches most crude bots
 *   3. Turnstile                          — network, but before any DB write
 *   4. Rate limit                         — network, keyed by IP and email
 *   5. Resolve the trip and departure     — DB read; flags, never rejects
 *   6. Allocate a reference and SAVE      — the point of no return
 *   7. Send email                         — after the write, never before
 *
 * Step 7 comes last on purpose. **A failed email must never lose an inquiry**,
 * so the record is durable before any mail is attempted, and mail failures are
 * logged rather than returned as errors.
 *
 * ## Rejections are recorded
 *
 * Every path that discards a submission writes a `RejectedSubmission` first —
 * reason, timestamp, IP and the full payload, self-purging after 30 days. The
 * responses stay opaque to the sender, but a discarded inquiry is never
 * untraceable on our side: "I submitted and heard nothing" has to be a query,
 * not a guess. Schema-validation failures are the exception — those go straight
 * back to the visitor to correct, so nothing is lost.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);

  /* ---------------- 1. parse and validate ---------------- */

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Malformed request body.' },
      { status: 400 }
    );
  }

  const parsed = bookingSubmissionSchema.safeParse(payload);

  if (!parsed.success) {
    // Field-keyed errors so the form can attach them to the right inputs.
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }

    return NextResponse.json(
      { error: 'Some details need checking.', fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  /* ---------------- 2. honeypot and time trap ---------------- */

  // Both spam rejections return 200 with a success shape. Telling a bot which
  // check caught it is free tuning information, and a real person can never
  // see this path anyway.
  if (data.company && data.company.trim() !== '') {
    console.warn(`[bookings] Honeypot filled from ${ip} — discarded.`);

    await logRejection({
      reason: 'honeypot',
      detail: `company="${data.company.trim().slice(0, 80)}"`,
      request,
      ip,
      payload: data,
    });

    return NextResponse.json({ ok: true, reference: null }, { status: 200 });
  }

  const elapsed = Date.now() - data.renderedAt;

  if (elapsed < MIN_COMPLETION_MS) {
    console.warn(`[bookings] Submitted in ${elapsed}ms from ${ip} — discarded.`);

    await logRejection({
      reason: 'time-trap',
      detail: `completed in ${elapsed}ms, threshold ${MIN_COMPLETION_MS}ms`,
      request,
      ip,
      payload: data,
    });

    return NextResponse.json({ ok: true, reference: null }, { status: 200 });
  }

  /* ---------------- 3. Turnstile ---------------- */

  const turnstile = await verifyTurnstile(data.turnstileToken, ip);

  if (!turnstile.ok) {
    await logRejection({
      reason: 'turnstile',
      detail: turnstile.errorCodes?.join(', ') ?? 'verification failed',
      request,
      ip,
      payload: data,
    });

    return NextResponse.json(
      {
        error:
          /*
           * Never "reload the page": that throws away everything they have
           * typed. The form resets the widget in place and they press send
           * again.
           */
          'We could not confirm that you are a person. The check has been reset — please try sending again.',
      },
      { status: 400 }
    );
  }

  /* ---------------- 4. rate limit (fails open) ---------------- */

  const rateLimit = await checkBookingRateLimit(ip, data.email);

  if (!rateLimit.allowed) {
    await logRejection({
      reason: 'rate-limit',
      detail: rateLimit.limit,
      request,
      ip,
      payload: data,
    });

    return NextResponse.json(
      {
        error:
          'You have sent several inquiries recently. Please email us directly and we will pick it up from there.',
      },
      { status: 429 }
    );
  }

  if (rateLimit.degraded) {
    console.warn('[bookings] Rate limit not enforced for this submission.');
  }

  /* ---------------- 5. resolve the trip ---------------- */

  await connectDB();

  let tripId: Types.ObjectId | null = null;
  let tripTitle: string | null = null;
  let tripType: TripType | null = null;
  let departureId: string | null = null;
  let departureSnapshot: IDepartureSnapshot | null = null;
  let preferredDate = data.preferredDate ? new Date(data.preferredDate) : undefined;

  if (data.tripSlug) {
    const trip = await Trip.findOne({ slug: data.tripSlug, status: 'published' })
      .select('_id title durationDays departureSeasons')
      .lean<{
        _id: Types.ObjectId;
        title: string;
        durationDays: number;
        departureSeasons?: StoredSeason[];
      }>();

    // An unknown slug is not worth rejecting a real inquiry over — it becomes
    // a general inquiry and the message usually says what they meant.
    if (trip) {
      tripId = trip._id;
      tripTitle = trip.title;
      // The visitor's choice, as made. The schema has already required one.
      tripType = data.tripType ?? null;

      /*
       * A group inquiry: check the departure against the seasons as they are
       * *now*, in Pokhara's date — the page the visitor chose from may be an
       * hour old. The snapshot is built here from the trip's own data; the
       * payload supplied only the id.
       *
       * Full, closed, or gone since they looked: saved all the same and
       * flagged by `statusAtSubmission`. Losing the lead would be the worst
       * outcome; the office can offer the next date.
       */
      if (tripType === 'group' && data.departureId) {
        const snapshot = snapshotDeparture(
          (trip.departureSeasons ?? []).map(toSeasonView),
          trip.durationDays,
          data.departureId,
          nepalToday()
        );

        if (snapshot) {
          departureId = data.departureId;
          departureSnapshot = {
            startDate: fromIsoDate(snapshot.startDate),
            endDate: fromIsoDate(snapshot.endDate),
            pricePerPerson: snapshot.pricePerPerson,
            statusAtSubmission: snapshot.statusAtSubmission,
          };
          // The departure *is* the start date they asked for; see the model.
          preferredDate = departureSnapshot.startDate;

          if (snapshot.statusAtSubmission !== 'available') {
            console.warn(
              `[bookings] Departure ${departureId} was ${snapshot.statusAtSubmission} at submission — saved and flagged.`
            );
          }
        }
      }

      // A private inquiry never carries a departure, whatever the payload says.
    } else {
      console.warn(`[bookings] Unknown trip slug "${data.tripSlug}" — saved as general.`);

      /*
       * With no trip there is no season to check and no length to derive an
       * end date from, so no departure is recorded. The date is not thrown
       * away with it: it becomes the preferred date, which is what it was.
       */
      const parsed = data.departureId ? parseDepartureId(data.departureId) : null;

      if (parsed) preferredDate = fromIsoDate(parsed.date);
    }
  }

  /* ---------------- 6. allocate and persist ---------------- */

  let booking;

  try {
    const reference = await allocateReference();

    booking = await BookingRequest.create({
      reference,
      name: data.name,
      email: data.email,
      phone: data.phone,
      nationality: data.nationality,
      trip: tripId,
      /*
       * Stored, not just emailed. The reference can stop resolving — a deleted
       * trip would otherwise turn this inquiry into "General inquiry" and lose
       * what the visitor actually asked about.
       */
      tripTitle: tripTitle ?? undefined,
      tripType,
      departureId,
      departureSnapshot,
      preferredDate,
      travellers: data.travellers,
      message: data.message,
      preferredChannel: data.preferredChannel,
      /*
       * Server time, not a value from the payload. The client could send
       * anything, and the point of this field is to be evidence — evidence the
       * subject of it can edit is not evidence. `data.consent` has already been
       * checked as `true` by the schema above, so reaching this line is what
       * the timestamp records.
       */
      consentedAt: new Date(),
      status: 'Pending',
      sourcePage: request.headers.get('referer') ?? undefined,
    });
  } catch (error) {
    console.error('[bookings] Failed to save inquiry:', error);

    return NextResponse.json(
      {
        error:
          'Something went wrong saving your inquiry. Please try again, or message us on WhatsApp.',
      },
      { status: 500 }
    );
  }

  /* ---------------- 7. email, after the write ---------------- */

  const email = await sendBookingEmails(booking, tripTitle);

  if (!email.notificationSent && !email.skipped) {
    // Saved but nobody was told. Loud, because it needs manual follow-up.
    console.error(
      `[bookings] ${booking.reference} SAVED but the company was not notified.`
    );
  }

  return NextResponse.json(
    { ok: true, reference: booking.reference },
    { status: 201 }
  );
}
