import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import FaqEntryEditor from '../../../../../components/admin/FaqEntryEditor';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import { getDestinationOptions } from '../../../../../lib/queries/adminTrips';
import { emptyFaq } from '../../../../../types/contentEditor';

export const metadata: Metadata = {
  title: 'New FAQ',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Create a FAQ.
 *
 * The same editor as the edit screen, unlike trips. A FAQ has no field that
 * cannot exist before the record does, so there is nothing for a reduced create
 * form to postpone.
 */
export default async function NewFaqPage() {
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/faqs/new');

  const destinations = await getDestinationOptions();

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="New FAQ"
        description="Leave the destination blank and this lands on the general FAQ page."
      />

      <FaqEntryEditor
        mode="create"
        initialValues={emptyFaq}
        destinations={destinations}
      />
    </div>
  );
}
