import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import TestimonialEditor from '../../../../../components/admin/TestimonialEditor';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import { getTripOptions } from '../../../../../lib/queries/adminContent';
import { emptyTestimonial } from '../../../../../types/contentEditor';

export const metadata: Metadata = {
  title: 'New testimonial',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewTestimonialPage() {
  if (!(await hasAdminSession())) {
    redirect('/admin/login?next=/admin/testimonials/new');
  }

  const trips = await getTripOptions();

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="New testimonial"
        description="Admin-curated, never customer-submitted. It starts as a draft and appears nowhere until it is published."
      />

      <TestimonialEditor
        mode="create"
        initialValues={emptyTestimonial}
        trips={trips}
      />
    </div>
  );
}
