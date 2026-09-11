import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import StatusSelect from '../../../../components/admin/StatusSelect';
import {
  PageHeading,
  StatCard,
  ButtonLink,
  EmptyRow,
} from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import {
  getBookingRequests,
  countBookingRequests,
  getBookingStatusCounts,
  type BookingSortField,
} from '../../../../lib/queries/bookings';
import {
  parseInquiryFilters,
  toListOptions,
  inquiryHref,
  sortHref,
  ariaSort,
  type InquiryFilters,
  type InquirySearchParams,
} from '../../../../lib/adminFilters';
import { formatDateTime, formatDate } from '../../../../lib/adminTime';
import { BOOKING_STATUSES } from '../../../../models/BookingRequest';

/**
 * The booking inquiry list — the screen staff live in.
 *
 * ## Sorting is server-side, unlike the activity comparison table
 *
 * `ActivityComparison` sorts in the browser because it holds a handful of rows
 * that all arrived with the page. This does not: the list is filtered, it grows
 * without limit, and the filters already live in the URL. Sorting in the
 * browser would sort *the rows currently rendered* — which is the sort bug that
 * looks like it works right up until the data outgrows one screen.
 *
 * Server-side also makes every view a URL. An admin can bookmark "pending
 * inquiries from last month", send it to a colleague, and the export button can
 * point at the same query string and be guaranteed to produce what is on
 * screen.
 *
 * ## The filter form needs no JavaScript
 *
 * A plain `form method="get"` puts its fields in the query string on submit,
 * which is exactly the state this page reads back. No client component, no
 * change handler, no hydration.
 */
export const metadata: Metadata = {
  title: 'Booking inquiries',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<InquirySearchParams>;
}) {
  /*
   * Checked here, not inherited from the layout. Layouts and pages render in
   * parallel, and a layout does not re-render on client-side navigation, so the
   * shell's check cannot stand in for this one. This is also where
   * `tokenVersion` revocation is enforced — the middleware runs on the edge and
   * cannot reach the database to ask.
   */
  if (!(await hasAdminSession())) {
    redirect('/admin/login?next=/admin/inquiries');
  }

  const params = await searchParams;
  const filters = parseInquiryFilters(params);
  const options = toListOptions(filters);

  const [bookings, matching, counts] = await Promise.all([
    getBookingRequests(options),
    countBookingRequests(options),
    getBookingStatusCounts(),
  ]);

  const filtered = !!filters.status || !!filters.fromInput || !!filters.toInput;

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Booking inquiries"
        description="Every inquiry submitted through the site. Nothing here is deleted — a closed inquiry stays on the list, because this is the record of the only conversion event the site has."
        actions={
          <ButtonLink
            download
            href={inquiryHref(filters, {}, '/api/admin/bookings/export')}
          >
            Export CSV
          </ButtonLink>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Awaiting a reply"
          value={counts.Pending}
          note={counts.Pending > 0 ? 'Nobody has responded yet' : 'All caught up'}
          href={inquiryHref(filters, { status: 'Pending', from: '', to: '' })}
        />
        <StatCard label="Contacted" value={counts.Contacted} />
        <StatCard label="Confirmed" value={counts.Confirmed} />
        <StatCard label="Total received" value={counts.total} />
      </dl>

      {/* ---------------- filters ---------------- */}

      <form
        method="get"
        className="flex flex-wrap items-end gap-4 rounded-lg border border-hairline bg-white p-5"
      >
        {/*
          The current sort rides along as hidden inputs. A GET form submits only
          its own fields and drops everything else in the query string, so
          without these, applying a filter would silently reset the column the
          admin had sorted by.
        */}
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.direction} />

        <div>
          <label htmlFor="status" className="text-sm font-semibold">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={filters.status ?? ''}
            className="mt-1.5 block rounded border border-hairline bg-white px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {BOOKING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="from" className="text-sm font-semibold">
            Received from
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={filters.fromInput}
            className="mt-1.5 block rounded border border-hairline bg-white px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="to" className="text-sm font-semibold">
            Received up to
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={filters.toInput}
            className="mt-1.5 block rounded border border-hairline bg-white px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper transition-opacity hover:opacity-90"
        >
          Apply
        </button>

        {filtered && (
          <Link
            href="/admin/inquiries"
            className="text-sm underline underline-offset-4"
          >
            Clear filters
          </Link>
        )}

        {/*
          Both date bounds are inclusive and are read in Nepal time, so an
          inquiry that arrived at 23:00 in Pokhara falls on the day the admin
          sees on screen rather than on the next one in UTC.
        */}
        <p className="ml-auto text-sm text-muted">
          Showing{' '}
          <span className="font-mono font-semibold tabular">{matching}</span>
          {filtered ? ' matching' : ''} of{' '}
          <span className="font-mono tabular">{counts.total}</span>
        </p>
      </form>

      {/* ---------------- table ---------------- */}

      <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="w-full min-w-4xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-paper">
              <SortableHeader filters={filters} field="createdAt" label="Received" />
              <th scope="col" className="px-4 py-3 font-semibold">
                Reference
              </th>
              <SortableHeader filters={filters} field="name" label="Name" />
              <SortableHeader
                filters={filters}
                field="nationality"
                label="Nationality"
              />
              <th scope="col" className="px-4 py-3 font-semibold">
                Trip
              </th>
              <SortableHeader
                filters={filters}
                field="travellers"
                label="People"
                align="right"
              />
              <SortableHeader
                filters={filters}
                field="preferredDate"
                label="Preferred date"
              />
              <SortableHeader filters={filters} field="status" label="Status" />
            </tr>
          </thead>

          <tbody>
            {bookings.length === 0 && (
              <EmptyRow colSpan={8}>
                {filtered
                  ? 'No inquiries match these filters.'
                  : 'No inquiries yet. The first one appears here the moment someone submits the form.'}
              </EmptyRow>
            )}

            {bookings.map((booking) => {
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
                    {/*
                      The reference is the link, not the name. It is what the
                      customer's confirmation email carries and what they quote
                      on the phone, so it is the string staff scan this column
                      looking for.
                    */}
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
                      {booking.email}
                    </span>
                  </td>

                  <td className="px-4 py-3">{booking.nationality}</td>

                  <td className="px-4 py-3 text-muted">
                    {/* Null is a real value here: an inquiry naming no trip. */}
                    {booking.trip?.title ?? 'General inquiry'}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {booking.travellers}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {booking.preferredDate
                      ? formatDate(booking.preferredDate)
                      : 'Flexible'}
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

      {/*
        Not paginated, and this is the note saying what to do instead of
        reaching for infinite scroll later. Past a few hundred rows the fix is a
        limit plus a cursor on createdAt — not a page offset, which re-reads
        every skipped document and shifts results as new inquiries arrive
        underneath the reader.
      */}
      {bookings.length >= 500 && (
        <p className="text-sm text-muted">
          This list is not paginated and has passed 500 rows. The next move is a
          cursor on the received date, not a page offset.
        </p>
      )}
    </div>
  );
}

/**
 * A column header that sorts.
 *
 * `aria-sort` on the `th` is the part that gets left out: without it a screen
 * reader announces an ordinary column header and the sort state is carried only
 * by the arrow. The arrow is `aria-hidden` for the mirror of that reason —
 * otherwise it is read aloud as "down pointing triangle" on every column.
 */
function SortableHeader({
  filters,
  field,
  label,
  align = 'left',
}: {
  filters: InquiryFilters;
  field: BookingSortField;
  label: string;
  align?: 'left' | 'right';
}) {
  const active = filters.sort === field;

  return (
    <th
      scope="col"
      aria-sort={ariaSort(filters, field)}
      className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : ''}`}
    >
      <Link
        href={sortHref(filters, field)}
        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
      >
        {label}
        <span
          aria-hidden="true"
          className={active ? 'text-ink' : 'text-hairline'}
        >
          {active && filters.direction === 'asc' ? '▲' : '▼'}
        </span>
      </Link>
    </th>
  );
}
