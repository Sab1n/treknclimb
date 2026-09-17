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
import { getTeamForAdmin } from '../../../../lib/queries/adminContent';
import { formatDateTime } from '../../../../lib/adminTime';

export const metadata: Metadata = {
  title: 'Team',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The team list.
 *
 * Ordered the way the About page orders them, so the rows read in the order a
 * visitor meets these people. A list sorted by "recently edited" would answer a
 * question nobody asks of this screen.
 */
export default async function AdminTeamPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/team');

  const team = await getTeamForAdmin();

  const published = team.filter((member) => member.status === 'published');
  const withCredentials = published.filter(
    (member) => member.credentials.length > 0
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Team"
        description="The people on the About page. Names and credentials here are a claim someone will check before sending money — every entry should be a real person with real certifications."
        actions={<ButtonLink href="/admin/team/new">New team member</ButtonLink>}
      />

      <dl className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Team members"
          value={team.length}
          note={`${published.length} published`}
        />
        <StatCard
          label="With credentials"
          value={withCredentials.length}
          note={
            published.length > 0 && withCredentials.length < published.length
              ? `${published.length - withCredentials.length} published without any`
              : 'Each one is checkable'
          }
        />
        <StatCard
          label="With a photo"
          value={team.filter((member) => member.photo).length}
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
                Credentials
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
            {team.length === 0 && (
              <EmptyRow colSpan={5}>
                Nobody added yet.{' '}
                <Link
                  href="/admin/team/new"
                  className="underline underline-offset-4"
                >
                  Add the first person
                </Link>
                . The About page hides the section until there is someone in it.
              </EmptyRow>
            )}

            {team.map((member) => {
              const id = String(member._id);
              const placeholder = member.name.startsWith('PLACEHOLDER');

              return (
                <tr
                  key={id}
                  className="border-b border-hairline align-top last:border-0 hover:bg-paper/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/team/${id}`}
                      className="font-semibold underline underline-offset-4"
                    >
                      {member.name}
                    </Link>
                    <span className="block text-xs text-muted">{member.role}</span>

                    {/*
                      The seeded placeholders are named so they are impossible
                      to miss on the public page. Flagging them here too means
                      the list itself is a to-do rather than something that
                      looks finished.
                    */}
                    {placeholder && (
                      <span className="mt-1 block text-xs font-semibold text-error">
                        Placeholder — replace before launch
                      </span>
                    )}
                  </td>

                  <td className="max-w-sm px-4 py-3 text-muted">
                    {member.credentials.length > 0 ? (
                      member.credentials.join(' · ')
                    ) : (
                      <span className="text-xs">
                        None listed
                        {member.status === 'published' && (
                          <span className="text-error">
                            {' '}
                            — published without a verifiable claim
                          </span>
                        )}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${
                        member.status === 'published'
                          ? 'border-confirmed/30 bg-confirmed/10 text-confirmed'
                          : member.status === 'archived'
                            ? 'border-hairline bg-paper text-muted'
                            : 'border-marigold/40 bg-marigold/10 text-ink'
                      }`}
                    >
                      {member.status}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {member.displayOrder}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular text-muted">
                    {formatDateTime(member.updatedAt)}
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
