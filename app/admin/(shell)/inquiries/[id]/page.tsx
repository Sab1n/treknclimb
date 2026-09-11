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
                {booking.trip ? (
                  booking.trip.title
                ) : (
                  <span className="text-muted">
                    General inquiry — no specific trip named
                  </span>
                )}
              </DetailRow>

              <DetailRow label="Travellers">
                <span className="font-mono tabular">{booking.travellers}</span>
              </DetailRow>

              <DetailRow label="Preferred date">
                {booking.preferredDate ? (
                  formatDate(booking.preferredDate)
                ) : (
                  <span className="text-muted">Left blank — dates are open</span>
                )}
              </DetailRow>

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
