import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import {
  PageHeading,
  ButtonLink,
  EmptyRow,
  StatCard,
} from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import { getTestimonialsForAdmin } from '../../../../lib/queries/adminContent';
import { formatDateTime } from '../../../../lib/adminTime';

export const metadata: Metadata = {
  title: 'Testimonials',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The testimonial list.
 *
 * Ordered the way the homepage orders them, so the top three rows are the three
 * that show. That is the question this screen is opened to answer, and a list
 * sorted by "recently edited" would answer a different one.
 */
export default async function AdminTestimonialsPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) {
    redirect('/admin/login?next=/admin/testimonials');
  }

  const testimonials = await getTestimonialsForAdmin();

  const published = testimonials.filter(
    (testimonial) => testimonial.status === 'published'
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Testimonials"
        description="Admin-curated quotes with visible attribution. Nothing here feeds aggregateRating in structured data — see the review-snippet note in the brief."
        actions={
          <ButtonLink href="/admin/testimonials/new">New testimonial</ButtonLink>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Testimonials"
          value={testimonials.length}
          note={`${published.length} published`}
        />
        <StatCard
          label="On the homepage"
          value={Math.min(published.length, 3)}
          note="The first three by display order"
        />
        <StatCard
          label="With a photo"
          value={testimonials.filter((testimonial) => testimonial.photo).length}
          note="Optional, but stronger with one"
        />
      </dl>

      <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="w-full min-w-3xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-paper">
              <th scope="col" className="px-4 py-3 font-semibold">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Quote
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Trip
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Order
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Last edited
              </th>
            </tr>
          </thead>

          <tbody>
            {testimonials.length === 0 && (
              <EmptyRow colSpan={6}>
                No testimonials yet.{' '}
                <Link
                  href="/admin/testimonials/new"
                  className="underline underline-offset-4"
                >
                  Add the first one
                </Link>
                .
              </EmptyRow>
            )}

            {testimonials.map((testimonial, index) => {
              const id = String(testimonial._id);

              // Which rows the homepage actually renders, marked on the rows
              // themselves — the count in the stat card says how many, not which.
              const onHomepage =
                testimonial.status === 'published' &&
                published.findIndex((row) => String(row._id) === id) < 3;

              return (
                <tr
                  key={id}
                  className="border-b border-hairline last:border-0 align-top hover:bg-paper/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/testimonials/${id}`}
                      className="font-semibold underline underline-offset-4"
                    >
                      {testimonial.name}
                    </Link>

                    {testimonial.country && (
                      <span className="block text-xs text-muted">
                        {testimonial.country}
                      </span>
                    )}

                    {onHomepage && (
                      <span className="mt-1 block text-xs font-semibold text-confirmed">
                        On the homepage
                      </span>
                    )}
                  </td>

                  <td className="max-w-md px-4 py-3 text-muted">
                    {testimonial.quote.length > 120
                      ? `${testimonial.quote.slice(0, 120)}…`
                      : testimonial.quote}

                    {testimonial.photo && !testimonial.photoAlt && (
                      // Should be unreachable — the model refuses to save it.
                      // Shown anyway, because a row that got in another way is
                      // exactly the row nobody would otherwise find.
                      <span className="mt-1 block text-xs text-error">
                        Photo has no alt text.
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-muted">
                    {testimonial.trip?.title ?? '—'}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${
                        testimonial.status === 'published'
                          ? 'border-confirmed/30 bg-confirmed/10 text-confirmed'
                          : testimonial.status === 'archived'
                            ? 'border-hairline bg-paper text-muted'
                            : 'border-marigold/40 bg-marigold/10 text-ink'
                      }`}
                    >
                      {testimonial.status}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {testimonial.displayOrder}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular text-muted">
                    {formatDateTime(testimonial.updatedAt)}
                    {index === 0 && ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
