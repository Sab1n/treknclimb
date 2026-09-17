import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import TeamMemberEditor from '../../../../../components/admin/TeamMemberEditor';
import { PageHeading } from '../../../../../components/admin/ui';
import { hasAdminSession } from '../../../../../lib/adminAuth';
import { emptyTeamMember } from '../../../../../types/contentEditor';

export const metadata: Metadata = {
  title: 'New team member',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewTeamMemberPage() {
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/team/new');

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="New team member"
        description="Starts as a draft and appears nowhere until published."
      />

      <TeamMemberEditor mode="create" initialValues={emptyTeamMember} />
    </div>
  );
}
