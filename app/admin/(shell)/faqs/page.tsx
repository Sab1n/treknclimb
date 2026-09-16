import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import FaqOrderList, {
  type FaqListRow,
} from '../../../../components/admin/FaqOrderList';
import { PageHeading, ButtonLink, StatCard } from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import { getFaqsForAdmin } from '../../../../lib/queries/adminContent';

export const metadata: Metadata = {
  title: 'FAQs',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The FAQ list, grouped by where each entry renders.
 *
 * A Server Component that reads and hands plain objects to the Client Component
 * doing the reordering — so no ObjectId and no Date crosses the boundary, and
 * Mongoose stays on the server.
 */
export default async function AdminFaqsPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/faqs');

  const faqs = await getFaqsForAdmin();

  /*
   * Serialized here rather than in the component. `_id` is an ObjectId and the
   * populated refs are documents; React refuses to pass either across the
   * client boundary, and the failure is a runtime error rather than a type one.
   */
  const rows: FaqListRow[] = faqs.map((faq) => ({
    id: String(faq._id),
    question: faq.question,
    category: faq.category ?? null,
    status: faq.status,
    displayOrder: faq.displayOrder,
    destinationId: faq.destination ? String(faq.destination._id) : null,
    destinationName: faq.destination?.name ?? null,
  }));

  const published = rows.filter((row) => row.status === 'published').length;
  const sitewide = rows.filter((row) => !row.destinationId).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="FAQs"
        description="Answers for the general FAQ page and for individual destinations. A trip’s own questions are written in the trip editor, not here."
        actions={<ButtonLink href="/admin/faqs/new">New FAQ</ButtonLink>}
      />

      <dl className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Entries" value={rows.length} note={`${published} published`} />
        <StatCard label="On /faq" value={sitewide} note="Attached to nothing" />
        <StatCard
          label="On a destination page"
          value={rows.length - sitewide}
          note="Attached to one country"
        />
      </dl>

      <FaqOrderList rows={rows} />

      <p className="max-w-prose text-sm text-muted">
        Drag within a section to reorder, or use the arrows. The order is not
        written until you press Save order, and it only affects the section you
        changed.
      </p>
    </div>
  );
}
