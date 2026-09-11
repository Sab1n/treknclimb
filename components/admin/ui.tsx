import Link from 'next/link';
import type { ReactNode } from 'react';

import type { BookingStatus } from '../../models/shared/bookingStatus';

/**
 * Small shared pieces for the admin screens.
 *
 * All Server Components — none of these hold state, so none of them ship
 * JavaScript. Kept in one file because each is a handful of lines and a folder
 * of six three-line components is harder to read than this.
 */

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-display">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-prose text-sm text-muted">{description}</p>
        )}
      </div>

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: number | string;
  note?: string;
  href?: string;
}) {
  const body = (
    <>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-3xl font-semibold tabular">{value}</dd>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </>
  );

  const className =
    'block rounded-lg border border-hairline bg-white p-5 transition-colors';

  // A stat that links somewhere has to look like it does. A card that is
  // clickable only if you happen to try it is a card nobody clicks.
  return href ? (
    <Link href={href} className={`${className} hover:border-ink`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * Status colour, used on the badge and the inline select.
 *
 * Deliberately outside the 60-30-10 palette's accent rule. Marigold means
 * "call to action" everywhere on the public site, and reusing it here to mean
 * "pending" would be the one thing that rule forbids. These are the system
 * colours — meaning, not brand — which is exactly what a status is.
 */
export const STATUS_STYLES: Record<BookingStatus, string> = {
  Pending: 'border-marigold/40 bg-marigold/10 text-ink',
  Contacted: 'border-ink/20 bg-ink/5 text-ink',
  Confirmed: 'border-confirmed/30 bg-confirmed/10 text-confirmed',
  Closed: 'border-hairline bg-paper text-muted',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-hairline bg-white hover:border-ink'
      }`}
    >
      {children}
    </Link>
  );
}

/** A secondary button-shaped link. There is no marigold on the admin. */
export function ButtonLink({
  href,
  children,
  download,
}: {
  href: string;
  children: ReactNode;
  download?: boolean;
}) {
  // A plain <a>, not <Link>, when it is a download: the router would try to
  // client-navigate to a CSV response and leave the page blank.
  if (download) {
    return (
      <a
        href={href}
        className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
    >
      {children}
    </Link>
  );
}

/** A labelled value in a detail view. `dt`/`dd`, so it is a real description list. */
export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-hairline py-3 last:border-0 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-sm sm:mt-0">{children}</dd>
    </div>
  );
}

export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted">
        {children}
      </td>
    </tr>
  );
}
