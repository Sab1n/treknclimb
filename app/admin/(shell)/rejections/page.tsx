import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import {
  PageHeading,
  StatCard,
  FilterPill,
} from '../../../../components/admin/ui';
import { hasAdminSession } from '../../../../lib/adminAuth';
import {
  getRejectedSubmissions,
  getRejectionCounts,
} from '../../../../lib/queries/rejections';
import { formatDateTime, daysSince } from '../../../../lib/adminTime';
import {
  REJECTION_REASONS,
  type RejectionReason,
} from '../../../../models/RejectedSubmission';

/**
 * The discarded-submission log.
 *
 * **Read-only, and it stays that way.** Nothing here can be edited, replayed or
 * promoted into a booking. The point is a truthful record of what the spam
 * checks threw away; a screen that could turn a row into an inquiry would make
 * the log a draft of the booking table rather than a record of it, and would
 * put a "create a booking from this payload" path behind an admin login.
 *
 * ## Why it exists
 *
 * The checks on the booking endpoint are deliberately opaque to the sender — a
 * bot that learns which one caught it can tune around it. The cost is that a
 * false positive silently discards a real inquiry, and until this screen
 * existed nothing surfaced that. "I submitted and heard nothing" is now a
 * search rather than a guess.
 *
 * ## The 30-day window changes what an empty list means
 *
 * The TTL index sweeps these after 30 days, so "no rows" means either nothing
 * was rejected or it was rejected too long ago — opposite conclusions from the
 * same empty table. The oldest entry is shown for exactly that reason.
 */
export const metadata: Metadata = {
  title: 'Rejected submissions',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** What each reason means, in the words staff would use. */
const REASON_DESCRIPTIONS: Record<RejectionReason, string> = {
  honeypot: 'Filled in a field that is hidden from people. Almost always a bot.',
  'time-trap':
    'Submitted faster than the form can be read. Usually a bot — but a returning visitor using autofill can trip this.',
  turnstile:
    'Cloudflare rejected the challenge. Can also be a real person on a locked-down browser or a VPN.',
  'rate-limit':
    'Too many submissions from this address or IP. A real person submitting repeatedly because they thought it failed looks exactly like this.',
};

export default async function AdminRejectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  if (!(await hasAdminSession())) {
    redirect('/admin/login?next=/admin/rejections');
  }

  const { reason } = await searchParams;

  const activeReason = (REJECTION_REASONS as readonly string[]).includes(
    reason ?? ''
  )
    ? (reason as RejectionReason)
    : undefined;

  const [counts, rejections] = await Promise.all([
    getRejectionCounts(),
    getRejectedSubmissions({ reason: activeReason }),
  ]);

  const oldestAge = daysSince(counts.oldest);

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Rejected submissions"
        description="Booking and newsletter submissions the server discarded. Read-only, and kept for 30 days before deleting itself. Check here first when someone says they submitted the form and heard nothing."
      />

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="In the log"
          value={counts.total}
          note="Last 30 days only"
        />
        <StatCard
          label="Honeypot"
          value={counts.byReason.honeypot ?? 0}
          note="Near-certainly bots"
        />
        <StatCard
          label="Turnstile"
          value={counts.byReason.turnstile ?? 0}
          note="Can catch real people"
        />
        <StatCard
          label="Rate limit"
          value={counts.byReason['rate-limit'] ?? 0}
          note="Can catch real people"
        />
      </dl>

      {/*
        Says what an empty or short log actually means. Without this line, "0
        rejections" reads as "the spam filters are catching nothing", when it
        may mean the window simply rolled over.
      */}
      <p className="text-sm text-muted">
        {counts.total === 0 ? (
          <>
            Nothing in the log. That means nothing has been discarded in the last
            30 days — not that nothing ever was. Older entries have already been
            deleted by the 30-day expiry.
          </>
        ) : (
          <>
            The oldest entry still here is from {formatDateTime(counts.oldest)}
            {oldestAge !== null && <> — {oldestAge} days ago</>}. Anything older
            has already been deleted.
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill active={!activeReason} href="/admin/rejections">
          All reasons
        </FilterPill>

        {REJECTION_REASONS.map((value) => (
          <FilterPill
            key={value}
            active={activeReason === value}
            href={`/admin/rejections?reason=${value}`}
          >
            {value} ({counts.byReason[value] ?? 0})
          </FilterPill>
        ))}
      </div>

      {activeReason && (
        <p className="max-w-prose text-sm text-muted">
          <span className="font-semibold text-ink">{activeReason}</span> —{' '}
          {REASON_DESCRIPTIONS[activeReason]}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {rejections.length === 0 && (
          <div className="rounded-lg border border-hairline bg-white px-4 py-10 text-center text-sm text-muted">
            {activeReason
              ? `Nothing has been rejected for "${activeReason}" in the last 30 days.`
              : 'Nothing has been rejected in the last 30 days.'}
          </div>
        )}

        {rejections.map((rejection) => (
          <article
            key={String(rejection._id)}
            className="rounded-lg border border-hairline bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-semibold">
                  {rejection.reason}
                </span>
                <span className="ml-2 text-xs text-muted">
                  {/* Undefined on rows written before the schema carried this. */}
                  {rejection.form ?? 'unknown'} form
                </span>
              </div>

              <p className="font-mono text-xs tabular text-muted">
                {formatDateTime(rejection.createdAt)}
              </p>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="Email">
                {rejection.email ?? (
                  <span className="text-muted">Not in the payload</span>
                )}
              </Row>

              <Row label="IP">
                <span className="font-mono text-xs">{rejection.ip}</span>
              </Row>

              <Row label="Detail">
                {rejection.detail ?? <span className="text-muted">—</span>}
              </Row>

              <Row label="Source page">
                {/*
                  Plain text, not a link. This is the `referer` header — a
                  string an attacker fully controls — and rendering it as a
                  clickable anchor on an admin screen is how a log viewer
                  becomes a phishing delivery mechanism. The inquiry detail page
                  does link its source page, but that value was validated on the
                  way in; this one was not.
                */}
                <span className="break-all text-muted">
                  {rejection.sourcePage ?? '—'}
                </span>
              </Row>

              <Row label="User agent">
                <span className="break-all text-xs text-muted">
                  {rejection.userAgent ?? '—'}
                </span>
              </Row>
            </dl>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Payload as submitted
              </summary>

              {/*
                `JSON.stringify` into a `pre`, and React escapes it. The payload
                is arbitrary text from a form a bot just filled in, so it is
                displayed and never interpreted — no markdown, no HTML, nothing
                that could execute. The Turnstile token was stripped before the
                write; it is a single-use credential and noise to a reader.
              */}
              <pre className="mt-2 max-h-96 overflow-auto rounded border border-hairline bg-paper p-4 font-mono text-xs whitespace-pre-wrap">
                {JSON.stringify(rejection.payload, null, 2)}
              </pre>
            </details>
          </article>
        ))}
      </div>

      {rejections.length > 0 && (
        <p className="max-w-prose text-sm text-muted">
          If one of these is a real person, there is no button here to recover
          it — deliberately. Contact them from the details above; the record
          stays as it is, a log of what the filters did.
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
