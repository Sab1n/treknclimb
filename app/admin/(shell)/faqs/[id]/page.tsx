import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';

import FaqEntryEditor from '../../../../../components/admin/FaqEntryEditor';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import { getFaqForEdit } from '../../../../../lib/queries/adminContent';
import { getDestinationOptions } from '../../../../../lib/queries/adminTrips';
import { toFaqValues } from '../../../../../types/contentEditor';

export const metadata: Metadata = {
  title: 'Edit FAQ',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminFaqPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await hasAdminSession())) {
    redirect(`/admin/login?next=/admin/faqs/${id}`);
  }

  // Independent reads, so they run together rather than in sequence.
  const [faq, destinations] = await Promise.all([
    getFaqForEdit(id),
    getDestinationOptions(),
  ]);

  /*
   * `notFound()`, not a redirect. Unlike a missing session this is not
   * something signing in would fix — the id is wrong or the record is gone.
   */
  if (!faq) notFound();

  return (
    <div className="flex flex-col gap-8">
      <PageHeading title={faq.question} />

      <FaqEntryEditor
        mode="edit"
        id={id}
        initialValues={toFaqValues(faq)}
        destinations={destinations}
        updatedAt={new Date(faq.updatedAt).toISOString()}
      />
    </div>
  );
}
