import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import RedirectsManager from '../../../../components/admin/RedirectsManager';
import { PageHeading, StatCard } from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import {
  getRedirectsForAdmin,
  getUnmappedNotFounds,
} from '../../../../lib/queries/adminRedirects';
import { connectDB } from '../../../../lib/db';
import NotFoundLog from '../../../../models/NotFoundLog';

/**
 * The migration console.
 *
 * CLAUDE.md calls the WordPress cutover the highest-risk item in the project,
 * and this screen is how the fortnight after it is spent: watch the unmapped
 * 404s, write the redirect, watch the hit count move.
 */
export const metadata: Metadata = {
  title: 'Redirects',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminRedirectsPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/redirects');

  await connectDB();

  const [redirects, notFounds, ignoredCount] = await Promise.all([
    getRedirectsForAdmin(),
    getUnmappedNotFounds(),
    NotFoundLog.countDocuments({ ignored: true }),
  ]);

  const active = redirects.filter((row) => row.isActive).length;
  const hits = redirects.reduce((sum, row) => sum + row.hitCount, 0);
  const unmappedHits = notFounds.reduce((sum, row) => sum + row.hits, 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Redirects"
        description="The 301 map and the 404s nobody has mapped yet. Renaming a trip, activity or destination writes a row here automatically; the rest comes from the WordPress crawl."
      />

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Redirects" value={redirects.length} note={`${active} active`} />
        <StatCard
          label="Redirects followed"
          value={hits}
          note="Since each row was written"
        />
        <StatCard
          label="Unmapped 404s"
          value={notFounds.length}
          note={notFounds.length > 0 ? 'Worth a look' : 'Nothing outstanding'}
        />
        <StatCard
          label="Unmapped requests"
          value={unmappedHits}
          note="Visitors who hit a dead end"
        />
      </dl>

      <RedirectsManager
        redirects={redirects}
        notFounds={notFounds}
        ignoredCount={ignoredCount}
      />
    </div>
  );
}
