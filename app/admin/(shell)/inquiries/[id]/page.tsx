import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';

import StatusSelect from '../../../../../components/admin/StatusSelect';
import InternalNotes from '../../../../../components/admin/InternalNotes';
import QuickReply from '../../../../../components/admin/QuickReply';
import { DetailRow } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import { getBookingRequestById } from '../../../../../lib/queries/bookings';
import { formatDateTime, formatDate } from '../../../../../lib/adminTime';
import {
  CONSENT_STATEMENT,
  CONSENT_STATEMENT_SINCE,
} from '../../../../../lib/consent';
import {
  bookingTripTitle,
  bookingTripIsDeleted,
} from '../../../../../lib/bookingTrip';
import {
  bookingDepartureView,
  departureLengthDays,
  formatDepartureRange,
  type BookingDepartureView,
} from '../../../../../lib/bookingDeparture';
import { nepalToday } from '../../../../../lib/departures';
import {
  DEPARTURE_CHECK_LABELS,
  TRIP_TYPE_LABELS,
} from '../../../../../models/shared/departures';
import DepartureNowBadge from '../../../../../components/admin/DepartureNowBadge';
import DeleteInquiry from '../../../../../components/admin/DeleteInquiry';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * Why the office should offer another date, or null if it need not.
 *
 * Two separate facts, both worth saying: the departure was already unavailable
 * when the visitor submitted (the form checks, but a page can be an hour old),
 * or it has become unavailable since. A departure that has simply *departed*
 * is not a reason — by then the inquiry is history either way.
 */
function offerAnotherDate(departure: BookingDepartureView): string | null {
  const then = departure.snapshot.statusAtSubmission;

  if (then !== 'available') {
    return then === 'gone'
      ? 'The departure they chose no longer existed when they submitted — the page they used was out of date. Offer them another date.'
      : `The departure they chose was already ${then} when they submitted. Offer them another date.`;
  }

  switch (departure.now.state) {
    case 'unavailable':
      return `The departure they chose has been marked ${departure.now.check} since they submitted. Offer them another date.`;
    case 'gone':
      return 'The departure they chose has since been removed from the trip — its season was changed or deleted. Offer them another date.';
    case 'trip-deleted':
      return 'The trip has since been deleted, so the departure they chose no longer exists.';
    default:
      return null;
  }
}

/**
 * One inquiry, in full.
 *
 * ## Everything the visitor sent is read-only
 *
 * There is no edit control on a single submitted field. Staff change the status
 * and write internal notes; the name, email, nationality, message and
 * `consentedAt` are what arrived, and a screen that can rewrite them turns the
 * record from evidence into a recollection. The server enforces this too — the
 * PATCH schema accepts exactly two keys.
 */
export const metadata: Metadata = {
  title: 'Inquiry',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminInquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Independent of the layout and of the middleware, on every admin page.
  if (!(await hasAdminSession())) {
    redirect(`/admin/login?next=/admin/inquiries/${id}`);
  }

  const booking = await getBookingRequestById(id);

  /*
   * `notFound()` rather than a redirect. Unlike a missing session, this is not
   * something the admin can fix by signing in — the id is wrong or the record
   * is gone, and bouncing them to the list would look like the click did
   * nothing.
   */
  if (!booking) notFound();

  const bookingId = String(booking._id);
  const departure = bookingDepartureView(booking, nepalToday());
  const offerAnother = departure ? offerAnotherDate(departure) : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            <Link href="/admin/inquiries" className="underline underline-offset-4">
              Booking inquiries
            </Link>
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-display">
            <span className="font-mono">{booking.reference}</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            Received {formatDateTime(booking.createdAt)} Nepal time
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <StatusSelect
            id={bookingId}
            status={booking.status}
            label={booking.reference}
          />
          <p className="text-xs text-muted">
            {booking.statusUpdatedAt
              ? `Status last changed ${formatDateTime(booking.statusUpdatedAt)}`
              : 'Status has never been changed'}
          </p>
        </div>
      </div>

      {/*
        Above the reply, because it changes what the reply says. Red: it is the
        one thing on this screen that calls for a different answer than usual.
      */}
      {offerAnother && (
        <p
          role="status"
          className="rounded-lg border border-error/30 bg-error/5 px-5 py-4 text-sm font-semibold text-error"
        >
          {offerAnother}
        </p>
      )}

      {/* ---------------- reply ---------------- */}

      <section className="rounded-lg border border-hairline bg-white p-6">
        <h2 className="font-display text-lg font-extrabold tracking-display">
          Reply
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Both open a draft with the reference and their message already in it.
          Nothing is sent from this screen.
        </p>

        <QuickReply booking={booking} />
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          {/* ---------------- the submission ---------------- */}

          <section className="rounded-lg border border-hairline bg-white p-6">
            <h2 className="font-display text-lg font-extrabold tracking-display">
              The submission
            </h2>
            <p className="mt-1 text-sm text-muted">
              Exactly as it arrived. Not editable.
            </p>

            <dl className="mt-4">
              <DetailRow label="Name">{booking.name}</DetailRow>

              <DetailRow label="Email">
                <a
                  href={`mailto:${booking.email}`}
                  className="underline underline-offset-4"
                >
                  {booking.email}
                </a>
              </DetailRow>

              <DetailRow label="Phone">
                {booking.phone ? (
                  <a
                    href={`tel:${booking.phone}`}
                    className="underline underline-offset-4"
                  >
                    {booking.phone}
                  </a>
                ) : (
                  <span className="text-muted">Not given — it is optional</span>
                )}
              </DetailRow>

              <DetailRow label="Nationality">
                {booking.nationality}
                {/*
                  The reason this field is required, restated where it is read.
                  Permit fees and visa rules differ by passport, so a quote
                  cannot be produced without it — which is why it is on the form
                  at all.
                */}
                <span className="ml-2 text-xs text-muted">
                  Permit fees and visa rules depend on this
                </span>
              </DetailRow>

              <DetailRow label="Trip">
                {bookingTripTitle(booking) ? (
                  <>
                    {bookingTripTitle(booking)}
                    {bookingTripIsDeleted(booking) && (
                      /*
                        The name is kept but flagged. Rendering a deleted trip's
                        name as though it were live sends staff looking for a
                        page that 404s; dropping it loses what the customer
                        actually asked about.
                      */
                      <span className="block text-sm text-muted">
                        Recorded at the time of the inquiry. This trip has since
                        been deleted.
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted">
                    General inquiry — no specific trip named
                  </span>
                )}
              </DetailRow>

              {/*
                Group or private — the visitor's choice on the form. Shown only
                when a trip was named: a general inquiry has neither. An
                inquiry from before the choice existed says so rather than
                showing a blank that reads like a missing answer.
              */}
              {bookingTripTitle(booking) && (
                <DetailRow label="Trip type">
                  {booking.tripType ? (
                    TRIP_TYPE_LABELS[booking.tripType]
                  ) : (
                    <span className="text-muted">
                      Not recorded — sent before the form asked
                    </span>
                  )}
                </DetailRow>
              )}

              {departure && (
                <DetailRow label="Departure">
                  <p className="font-semibold">
                    {formatDepartureRange(departure.snapshot.startDate, departure.snapshot.endDate)}
                  </p>

                  <p className="mt-1 text-sm">
                    <span className="font-mono tabular">
                      {departureLengthDays(departure.snapshot.startDate, departure.snapshot.endDate)}
                    </span>{' '}
                    days ·{' '}
                    {departure.snapshot.pricePerPerson === null ? (
                      <span className="text-muted">no price — it no longer existed</span>
                    ) : (
                      <>
                        <span className="font-mono font-semibold tabular">
                          {usd.format(departure.snapshot.pricePerPerson)}
                        </span>{' '}
                        per person
                      </>
                    )}
                  </p>

                  {/*
                    The snapshot is what the customer was shown. It is never
                    recomputed, so a later price edit cannot change what this
                    inquiry says they asked about.
                  */}
                  <p className="mt-1 text-xs text-muted">
                    Dates and price as they were when the inquiry was submitted.
                  </p>

                  <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted">When submitted</dt>
                    <dd
                      className={
                        departure.snapshot.statusAtSubmission === 'available'
                          ? ''
                          : 'font-semibold text-error'
                      }
                    >
                      {DEPARTURE_CHECK_LABELS[departure.snapshot.statusAtSubmission]}
                    </dd>

                    <dt className="text-muted">Now</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <DepartureNowBadge now={departure.now} />
                      {/*
                        The current price, only when it differs: the quote is
                        the office's decision, and it should know the season's
                        price moved since the customer looked.
                      */}
                      {(departure.now.state === 'bookable' ||
                        departure.now.state === 'unavailable') &&
                        departure.now.pricePerPerson !== departure.snapshot.pricePerPerson && (
                          <span className="text-xs text-muted">
                            Price now{' '}
                            <span className="font-mono tabular">
                              {usd.format(departure.now.pricePerPerson)}
                            </span>
                          </span>
                        )}
                    </dd>
                  </dl>

                  <p className="mt-2 font-mono text-xs break-all text-muted">
                    {booking.departureId}
                  </p>
                </DetailRow>
              )}

              <DetailRow label="Travellers">
                <span className="font-mono tabular">{booking.travellers}</span>
              </DetailRow>

              {/*
                A group inquiry's date is its departure, shown above; the route
                also stores it here so the list can sort by it. Repeating it
                would be two rows saying one thing.
              */}
              {!departure && (
                <DetailRow label="Preferred date">
                  {booking.preferredDate ? (
                    formatDate(booking.preferredDate)
                  ) : (
                    <span className="text-muted">Left blank — dates are open</span>
                  )}
                </DetailRow>
              )}

              <DetailRow label="Contact by">
                {booking.preferredChannel === 'either'
                  ? 'No preference'
                  : booking.preferredChannel}
              </DetailRow>

              <DetailRow label="Message">
                {booking.message ? (
                  /*
                   * `whitespace-pre-wrap` so the paragraphs they typed survive,
                   * and plain text so nothing they typed is ever interpreted.
                   * React escapes this by construction — there is no
                   * `dangerouslySetInnerHTML` anywhere near a field a stranger
                   * filled in.
                   */
                  <p className="whitespace-pre-wrap">{booking.message}</p>
                ) : (
                  <span className="text-muted">No message</span>
                )}
              </DetailRow>
            </dl>
          </section>

          {/* ---------------- notes ---------------- */}

          <section className="rounded-lg border border-hairline bg-white p-6">
            <InternalNotes
              id={bookingId}
              initialNotes={booking.internalNotes ?? ''}
            />
          </section>

          {/*
            Last on the page, in its own red-bordered block, well away from the
            status control and the notes — the two things staff touch daily.
            An erasure request is rare and deliberate, and the control should
            not be one mis-aimed click from the ones that are not.
          */}
          <DeleteInquiry id={bookingId} reference={booking.reference} name={booking.name} />
        </div>

        {/* ---------------- provenance ---------------- */}

        <aside className="flex flex-col gap-6">
          <section className="rounded-lg border border-hairline bg-white p-6">
            <h2 className="font-display text-base font-extrabold tracking-display">
              Consent
            </h2>

            <p className="mt-3 text-sm">
              <span className="font-semibold">Agreed</span>{' '}
              {formatDateTime(booking.consentedAt)}
            </p>

            {/*
              The wording, not just the timestamp. `consentedAt` on its own
              records *when* someone agreed and not *what to*, and the wording
              is versioned by the date it took effect precisely so the two can
              be read together a year later. Quoted from `lib/consent.ts`, the
              same constant the form renders — a hard-coded copy here would be a
              record of what this page says rather than of what they saw.
            */}
            <blockquote className="mt-3 border-l-2 border-hairline pl-3 text-sm text-muted">
              &ldquo;{CONSENT_STATEMENT}&rdquo;
            </blockquote>

            <p className="mt-3 text-xs text-muted">
              Wording in force since {CONSENT_STATEMENT_SINCE}. There has only
              been one version, so this is what they saw. If the statement is
              ever reworded, `lib/consent.ts` becomes a dated list and this reads
              the entry in force at the timestamp above.
            </p>

            <p className="mt-3 text-xs text-muted">
              Recorded from server time, not from the submitted payload.
            </p>
          </section>

          <section className="rounded-lg border border-hairline bg-white p-6">
            <h2 className="font-display text-base font-extrabold tracking-display">
              Where it came from
            </h2>

            <dl className="mt-3">
              <DetailRow label="Source page">
                {booking.sourcePage ? (
                  /*
                   * A real link, because "which page converts" is the question
                   * this field exists for and clicking through to see what they
                   * were reading is how it gets answered. It is a stored path
                   * from a form submission, so it opens in a new tab and
                   * carries `noopener` — the same care as any other value a
                   * visitor influenced.
                   */
                  <a
                    href={booking.sourcePage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all underline underline-offset-4"
                  >
                    {booking.sourcePage}
                  </a>
                ) : (
                  <span className="text-muted">Not recorded</span>
                )}
              </DetailRow>

              <DetailRow label="Reference">
                <span className="font-mono text-xs">{booking.reference}</span>
              </DetailRow>

              <DetailRow label="Record id">
                <span className="font-mono text-xs break-all text-muted">
                  {bookingId}
                </span>
              </DetailRow>
            </dl>

            <p className="mt-3 text-xs text-muted">
              Traffic sources and conversion rates come from GA4, not from here.
              This field only says which page the form was on.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
