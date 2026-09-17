import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';

import TeamMemberEditor from '../../../../../components/admin/TeamMemberEditor';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import { getTeamMemberForEdit } from '../../../../../lib/queries/adminContent';
import { toTeamMemberValues } from '../../../../../types/contentEditor';

export const metadata: Metadata = {
  title: 'Edit team member',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminTeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await hasAdminSession())) redirect(`/admin/login?next=/admin/team/${id}`);

  const member = await getTeamMemberForEdit(id);

  /*
   * `notFound()`, not a redirect. Unlike a missing session this is not
   * something signing in would fix — the id is wrong or the record is gone.
   */
  if (!member) notFound();

  return (
    <div className="flex flex-col gap-8">
      <PageHeading title={member.name} description={member.role} />

      <TeamMemberEditor
        mode="edit"
        id={id}
        initialValues={toTeamMemberValues(member)}
        updatedAt={new Date(member.updatedAt).toISOString()}
      />
    </div>
  );
}
