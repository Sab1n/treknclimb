import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import StatusSelect from '../../../components/admin/StatusSelect';
import {
  PageHeading,
  StatCard,
  EmptyRow,
  ButtonLink,
} from '../../../components/admin/ui';
import { getAdminSession } from '../../../lib/adminAuth';
import {
  getDashboardStats,
  getStaleExchangeRates,
  RATE_STALE_AFTER_DAYS,
} from '../../../lib/queries/adminDashboard';
import { getBookingRequests } from '../../../lib/queries/bookings';
import { countRecentRejections } from '../../../lib/queries/rejections';
import { formatDateTime, daysSince } from '../../../lib/adminTime';
import { bookingTripTitle, GENERAL_INQUIRY } from '../../../lib/bookingTrip';

/**
 * The admin dashboard.
 *
 * Operational counts and the things that need attention — not analytics.
 * CLAUDE.md puts funnel data in GA4 and rules out a MongoDB pageview
 * collection, so there are no conversion rates here and no charts: "inquiries
 * this week" is a count of documents, which is a different and more honest
 * claim than a trend line drawn through four points.
 *
 * The recent-inquiry table carries the same inline status control as the full
 * list, because the common case on opening this screen is "answer the two that
 * came in overnight" and that should not need a second navigation.
 */
export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const RECENT_LIMIT = 8;

export default async function AdminDashboardPage() {
  // Independent of the layout's check — see the note in the shell layout.
  const session = await getAdminSession();

  if (!session) redirect('/admin/login?next=/admin');

  const [stats, recent, rates, recentRejections] = await Promise.all([
    getDashboardStats(),
    getBookingRequests({ limit: RECENT_LIMIT }),
    getStaleExchangeRates(),
    countRecentRejections(7),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title={`Good to see you, ${session.name.split(' ')[0]}`}
        description="What has come in, what needs attention, and what is still edited straight in the database."
      />

      {/* ---------------- warnings ---------------- */}

      {rates.stale.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-error/30 bg-error/5 p-5"
        >
          <h2 className="font-semibold text-error">
            {rates.stale.length} exchange{' '}
            {rates.stale.length === 1 ? 'rate is' : 'rates are'} more than{' '}
            {RATE_STALE_AFTER_DAYS} days old
          </h2>

          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {rates.stale.map((rate) => (
              <li key={String(rate._id)}>
                <span className="font-mono font-semibold">
                  {rate.currencyCode}
                </span>{' '}
                <span className="text-muted">
                  {daysSince(rate.lastUpdated)} days old
                </span>
              </li>
            ))}
          </ul>

          {/*
            Says what the consequence is, not just that a number is old.
            Visitors see converted prices with an "indicative" note, so a stale
            rate is a quote that drifts from the USD price the company will
            actually charge — worth fixing, not a catastrophe, and the warning
            should read that way.
          */}
          <p className="mt-3 text-sm text-muted">
            Converted prices on the site are calculated from these. USD is
            unaffected — it is what structured data and the sitemap emit — but a
            visitor browsing in another currency is seeing a figure this far out
            of date. Rates are still updated directly in the database; the admin
            screen for them is not built.
          </p>
        </div>
      )}

      {!rates.checked && (
        <div
          role="status"
          className="rounded-lg border border-hairline bg-white p-5 text-sm text-muted"
        >
          No active exchange rates are configured, so the currency switcher has
          nothing to convert with and every visitor sees USD.
        </div>
      )}

      {/* ---------------- stats ---------------- */}

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="New this week"
          value={stats.inquiriesThisWeek}
          note="Inquiries in the last 7 days"
          href="/admin/inquiries"
        />
        <StatCard
          label="Awaiting a reply"
          value={stats.pendingInquiries}
          note={stats.pendingInquiries > 0 ? 'Still Pending' : 'All caught up'}
          href="/admin/inquiries?status=Pending"
        />
        <StatCard
          label="Published trips"
          value={stats.trips.published}
          note={`${stats.trips.total} in total`}
        />
        <StatCard
          label="Draft trips"
          value={stats.trips.draft}
          note={
            stats.trips.archived > 0
              ? `${stats.trips.archived} archived`
              : 'Not visible on the site'
          }
        />
      </dl>

      {/* ---------------- recent inquiries ---------------- */}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-lg font-extrabold tracking-display">
            Latest inquiries
          </h2>

          <ButtonLink href="/admin/inquiries">See all</ButtonLink>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-white">
          <table className="w-full min-w-2xl border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hairline bg-paper">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Received
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Reference
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Trip
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
              </tr>
            </thead>

            <tbody>
              {recent.length === 0 && (
                <EmptyRow colSpan={5}>
                  No inquiries yet. The first one appears here the moment
                  someone submits the form.
                </EmptyRow>
              )}

              {recent.map((booking) => {
                const id = String(booking._id);

                return (
                  <tr
                    key={id}
                    className="border-b border-hairline last:border-0 hover:bg-paper/60"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular text-muted">
                      {formatDateTime(booking.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/inquiries/${id}`}
                        className="font-mono text-xs font-semibold underline underline-offset-4"
                      >
                        {booking.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{booking.name}</span>
                      <span className="block text-xs text-muted">
                        {booking.nationality}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {bookingTripTitle(booking) ?? GENERAL_INQUIRY}
                    </td>
                    <td className="px-4 py-3">
                      <StatusSelect
                        id={id}
                        status={booking.status}
                        label={booking.reference}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- quick actions ---------------- */}

      <section>
        <h2 className="font-display text-lg font-extrabold tracking-display">
          Quick actions
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickAction
            href="/admin/inquiries?status=Pending"
            title="Answer pending inquiries"
            description={
              stats.pendingInquiries > 0
                ? `${stats.pendingInquiries} waiting for a first reply.`
                : 'Nothing is waiting.'
            }
          />

          <QuickAction
            href="/admin/rejections"
            title="Review rejected submissions"
            description={
              recentRejections > 0
                ? `${recentRejections} discarded in the last 7 days. Worth a look if anyone says they heard nothing.`
                : 'Nothing discarded in the last 7 days.'
            }
          />

          <QuickAction
            href="/admin/newsletter"
            title="Newsletter subscribers"
            description="Who signed up through the site. Read-only — sending happens in the marketing platform."
          />

          <QuickAction
            href="/api/admin/bookings/export"
            title="Export all inquiries"
            description="Every inquiry as CSV. Personal data — it is not cached, and it should not be emailed around."
            download
          />
        </div>
      </section>

      {/*
        The honest footer. Most of the sidebar is greyed out, and a line saying
        why is better than leaving whoever is using this to work it out from the
        disabled items.
      */}
      <p className="text-sm text-muted">
        Trips, activities, destinations, blog posts, testimonials, FAQs, media,
        exchange rates, redirects and settings are still edited directly in the
        database. Their screens are listed in the sidebar and disabled.
      </p>
    </div>
  );
}

function QuickAction({
  href,
  title,
  description,
  download,
}: {
  href: string;
  title: string;
  description: string;
  download?: boolean;
}) {
  const className =
    'block rounded-lg border border-hairline bg-white p-5 transition-colors hover:border-ink';

  const body = (
    <>
      <span className="font-semibold">{title}</span>
      <span className="mt-1 block text-sm text-muted">{description}</span>
    </>
  );

  // A plain anchor for the download: the router would try to client-navigate to
  // a CSV response and leave the page blank.
  return download ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
