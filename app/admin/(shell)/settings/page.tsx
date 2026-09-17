import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import SettingsEditor from '../../../../components/admin/SettingsEditor';
import { PageHeading } from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import { getSiteSettings } from '../../../../lib/queries/settings';
import { getAffiliations } from '../../../../lib/queries/affiliations';
import { toSettingsValues } from '../../../../types/settingsEditor';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Site settings.
 *
 * No list in front of it and no `[id]` beneath it: `SiteSettings` is a
 * singleton, so this route opens straight into the form. A Server Component
 * that reads and hands plain objects across the client boundary — no ObjectId
 * and no Date reaches the editor, and Mongoose stays on the server.
 *
 * The affiliations are read here too. They are a separate collection, but four
 * of their registration numbers belong on this screen: the client fills them in
 * once, and a screen of their own for four fields would be a screen nobody
 * finds.
 */
export default async function AdminSettingsPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/settings');

  // Independent reads, so they run together rather than in sequence.
  const [settings, affiliations] = await Promise.all([
    getSiteSettings(),
    getAffiliations(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Settings"
        description="Everything the site says about the company. Each section names the pages it appears on, and saving rebuilds only those."
      />

      {!settings && (
        <p
          role="alert"
          className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
        >
          No settings record exists yet, so nothing can be saved. Run
          scripts/seed.ts to create it — the record is seeded deliberately rather
          than created from this screen, because there must only ever be one.
        </p>
      )}

      <SettingsEditor
        initialValues={toSettingsValues(settings, affiliations)}
        updatedAt={
          settings ? new Date(settings.updatedAt).toISOString() : new Date().toISOString()
        }
      />
    </div>
  );
}
