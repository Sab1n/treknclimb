import { NextResponse } from 'next/server';

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
 *   5. Resolve the trip                   — DB read
 *   6. Allocate a reference and SAVE      — the point of no return
 *   7. Send email                         — after the write, never before
 *
 * Step 7 comes last on purpose. **A failed email must never lose an inquiry**,
 * so the record is durable before any mail is attempted, and mail failures are
 * logged rather than returned as errors.
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
    return NextResponse.json({ ok: true, reference: null }, { status: 200 });
  }

  const elapsed = Date.now() - data.renderedAt;

  if (elapsed < MIN_COMPLETION_MS) {
    console.warn(`[bookings] Submitted in ${elapsed}ms from ${ip} — discarded.`);
    return NextResponse.json({ ok: true, reference: null }, { status: 200 });
  }

  /* ---------------- 3. Turnstile ---------------- */

  const turnstile = await verifyTurnstile(data.turnstileToken, ip);

  if (!turnstile.ok) {
    return NextResponse.json(
      {
        error:
          'We could not verify that you are human. Please reload the page and try again.',
      },
      { status: 400 }
    );
  }

  /* ---------------- 4. rate limit (fails open) ---------------- */

  const rateLimit = await checkBookingRateLimit(ip, data.email);

  if (!rateLimit.allowed) {
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

  let tripId = null;
  let tripTitle: string | null = null;

  if (data.tripSlug) {
    const trip = await Trip.findOne({ slug: data.tripSlug, status: 'published' })
      .select('_id title')
      .lean();

    // An unknown slug is not worth rejecting a real inquiry over — it becomes
    // a general inquiry and the message usually says what they meant.
    if (trip) {
      tripId = trip._id;
      tripTitle = trip.title;
    } else {
      console.warn(`[bookings] Unknown trip slug "${data.tripSlug}" — saved as general.`);
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
      trip: tripId,
      preferredDate: data.preferredDate ? new Date(data.preferredDate) : undefined,
      travellers: data.travellers,
      message: data.message,
      preferredChannel: data.preferredChannel,
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
