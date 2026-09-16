import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';

import TestimonialEditor from '../../../../../components/admin/TestimonialEditor';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import {
  getTestimonialForEdit,
  getTripOptions,
} from '../../../../../lib/queries/adminContent';
import { toTestimonialValues } from '../../../../../types/contentEditor';

export const metadata: Metadata = {
  title: 'Edit testimonial',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminTestimonialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await hasAdminSession())) {
    redirect(`/admin/login?next=/admin/testimonials/${id}`);
  }

  const [testimonial, trips] = await Promise.all([
    getTestimonialForEdit(id),
    getTripOptions(),
  ]);

  if (!testimonial) notFound();

  return (
    <div className="flex flex-col gap-8">
      <PageHeading title={testimonial.name} />

      <TestimonialEditor
        mode="edit"
        id={id}
        initialValues={toTestimonialValues(testimonial)}
        trips={trips}
        updatedAt={new Date(testimonial.updatedAt).toISOString()}
      />
    </div>
  );
}
