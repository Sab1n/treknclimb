import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import RatesEditor, { type RateRow } from '../../../../components/admin/RatesEditor';
import { PageHeading, StatCard } from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import { connectDB } from '../../../../lib/db';
import ExchangeRate, { IExchangeRate } from '../../../../models/ExchangeRate';
import {
  RATE_STALE_AFTER_DAYS,
  rateStaleCutoff,
} from '../../../../lib/queries/adminDashboard';

export const metadata: Metadata = {
  title: 'Exchange rates',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The display-currency rate table.
 *
 * A Server Component that reads and hands plain objects to the Client
 * Component doing the editing — no ObjectId and no Date crosses the boundary,
 * and Mongoose stays on the server.
 *
 * All currencies, not just active ones: deactivating a currency is done here,
 * so the deactivated ones have to be visible to turn back on.
 */
export default async function AdminRatesPage() {
  // Independent of the layout's check — a layout cannot guard its pages.
  if (!(await hasAdminSession())) redirect('/admin/login?next=/admin/rates');

  await connectDB();

  const rates = await ExchangeRate.find()
    .sort({ currencyCode: 1 })
    .lean<IExchangeRate[]>()
    .exec();

  const rows: RateRow[] = rates.map((rate) => ({
    id: String(rate._id),
    currencyCode: rate.currencyCode,
    // A string, because that is what the input holds. Parsed once, on the
    // server, by the route's schema.
    rate: String(rate.rate),
    source: rate.source,
    roundingRule: rate.roundingRule,
    isActive: rate.isActive,
    lastUpdated: new Date(rate.lastUpdated).toISOString(),
  }));

  const cutoff = rateStaleCutoff();
  const active = rows.filter((row) => row.isActive);
  const stale = active.filter(
    (row) => new Date(row.lastUpdated).getTime() < cutoff
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Exchange rates"
        description="Prices are stored and rendered in USD. These rates drive the display-currency switcher only — structured data and the sitemap always emit USD, so a search engine sees one consistent price."
      />

      <dl className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Currencies"
          value={rows.length}
          note={`${active.length} shown to visitors`}
        />
        <StatCard
          label="Stale rates"
          value={stale.length}
          note={
            stale.length > 0
              ? `Older than ${RATE_STALE_AFTER_DAYS} days`
              : 'All checked recently'
          }
        />
        <StatCard
          label="Manually set"
          value={rows.filter((row) => row.source === 'manual').length}
          note="Not from a provider"
        />
      </dl>

      <RatesEditor
        initialRows={rows}
        staleAfterDays={RATE_STALE_AFTER_DAYS}
        staleCutoff={cutoff}
      />

      <div className="max-w-prose text-sm text-muted">
        <p>
          <strong className="font-semibold text-ink">
            Nothing on the public site reads these yet.
          </strong>{' '}
          The currency switcher is not built, so no visitor sees a converted
          price today. The rates, the rounding rules and this screen are all in
          place for when it lands.
        </p>
      </div>
    </div>
  );
}
