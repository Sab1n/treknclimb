import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { hasAdminSession } from '../../../lib/adminAuth';
import {
  getSubscribers,
  getSubscriberCounts,
} from '../../../lib/queries/newsletter';
import { providerStatus } from '../../../lib/newsletterProvider';
import {
  SUBSCRIBER_STATUSES,
  type SubscriberStatus,
} from '../../../models/NewsletterSubscriber';

/**
 * Read-only newsletter admin.
 *
 * **There is no compose or send UI, and there will not be one.** Sending
 * happens in the marketing platform, which owns the list, the templates, the
 * unsubscribe links and the deliverability. Building a send button here would
 * mean rebuilding all of that badly and putting a "email everyone" control
 * behind an admin login.
 *
 * This screen answers three questions: is the site producing signups, are they
 * confirming, and is anything stuck unsynced.
 *
 * ## The count is not "subscribers"
 *
 * The provider owns unsubscribes and does not tell us about them — there is no
 * webhook, deliberately. So every figure here is **added via this site**, a
 * high-water mark, not a live audience size. The labels say so, and they should
 * keep saying so.
 */
export const metadata: Metadata = {
  title: 'Newsletter subscribers',
  robots: { index: false, follow: false },
};

// Never cached. Admin views must show the current state, not a snapshot.
export const dynamic = 'force-dynamic';

export default async function AdminNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  /*
   * A second, independent check. `middleware.ts` already blocks this path, but
   * a middleware matcher is one config edit from missing a route, and the data
   * below is real people's email addresses. Two gates, neither relying on the
   * other.
   */
  if (!(await hasAdminSession())) notFound();

  const { status } = await searchParams;

  const activeStatus = (SUBSCRIBER_STATUSES as readonly string[]).includes(
    status ?? ''
  )
    ? (status as SubscriberStatus)
    : undefined;

  const [counts, subscribers] = await Promise.all([
    getSubscriberCounts(),
    getSubscribers({ status: activeStatus }),
  ]);

  const provider = providerStatus();

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-extrabold tracking-display">
        Newsletter subscribers
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Everyone who signed up through this website. Sending, templates and
        unsubscribes all live in {provider.name}; this is a record of what the
        site produced.
      </p>

      {!provider.configured && (
        <p
          role="status"
          className="mt-4 rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
        >
          No marketing provider is configured, so confirmed subscribers are
          being stored here and <strong>not</strong> synced anywhere.
        </p>
      )}

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Added via this site"
          value={counts.total}
          note="Not current subscribers"
        />
        <Stat label="Confirmed" value={counts.confirmed} />
        <Stat label="Awaiting confirmation" value={counts.pending} />
        <Stat
          label="Confirmed, not synced"
          value={counts.awaitingSync}
          note={counts.awaitingSync > 0 ? 'Needs a retry' : undefined}
        />
      </dl>

      <p className="mt-3 text-xs text-muted">
        Unsubscribes happen in {provider.name} and are not reported back here,
        so the confirmed figure only ever goes up. Treat the provider&rsquo;s
        own count as the real one.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <FilterLink active={!activeStatus} href="/admin/newsletter">
          All
        </FilterLink>
        {SUBSCRIBER_STATUSES.map((value) => (
          <FilterLink
            key={value}
            active={activeStatus === value}
            href={`/admin/newsletter?status=${value}`}
          >
            {value}
          </FilterLink>
        ))}

        <a
          href={`/api/admin/newsletter/export${activeStatus ? `?status=${activeStatus}` : ''}`}
          className="ml-auto rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
        >
          Export CSV
        </a>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-paper">
              <th scope="col" className="px-4 py-3 font-semibold">Email</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Signed up</th>
              <th scope="col" className="px-4 py-3 font-semibold">Confirmed</th>
              <th scope="col" className="px-4 py-3 font-semibold">Synced</th>
              <th scope="col" className="px-4 py-3 font-semibold">Source</th>
            </tr>
          </thead>

          <tbody>
            {subscribers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No subscribers{activeStatus ? ` with status "${activeStatus}"` : ''} yet.
                </td>
              </tr>
            )}

            {subscribers.map((subscriber) => (
              <tr
                key={String(subscriber._id)}
                className="border-b border-hairline last:border-0"
              >
                <td className="px-4 py-3">{subscriber.email}</td>
                <td className="px-4 py-3">{subscriber.status}</td>
                <td className="px-4 py-3 font-mono text-xs tabular">
                  {formatDate(subscriber.createdAt)}
                </td>
                <td className="px-4 py-3 font-mono text-xs tabular">
                  {formatDate(subscriber.confirmedAt)}
                </td>
                <td className="px-4 py-3 font-mono text-xs tabular">
                  {formatDate(subscriber.syncedAt)}
                </td>
                <td className="px-4 py-3 text-muted">
                  {subscriber.source || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-sm">
        <Link href="/admin" className="underline underline-offset-4">
          Back to admin
        </Link>
      </p>
    </main>
  );
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';

  return new Date(value).toISOString().slice(0, 16).replace('T', ' ');
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-white p-5">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-semibold tabular">{value}</dd>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize transition-colors ${
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-hairline bg-white hover:border-ink'
      }`}
    >
      {children}
    </Link>
  );
}
