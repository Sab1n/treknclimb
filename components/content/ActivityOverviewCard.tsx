import Link from 'next/link';
import CloudinaryImage from '../ui/CloudinaryImage';
import { activityPath } from '../../lib/urls';
import { IActivity } from '../../models/Activity';
import { IDestination } from '../../models/Destination';
import type { ActivityStats } from '../../lib/queries/activities';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * Formats a numeric range, collapsing it when both ends are the same.
 *
 * "7–7 days" is what a naive template produces the moment an activity has one
 * trip, or several of the same length — which is the common case for a new
 * activity, not an edge case.
 */
export function formatRange(
  min: number | null,
  max: number | null,
  format: (value: number) => string
): string | null {
  if (min == null || max == null) return null;

  return min === max ? format(min) : `${format(min)}–${format(max)}`;
}

export const formatDays = (value: number) => `${value}`;
export const formatUsd = (value: number) => usd.format(value);
export const formatMetres = (value: number) =>
  `${value.toLocaleString('en-US')} m`;

/**
 * One activity on `/<destination>/activities`.
 *
 * Richer than `ActivityCard`, the compact tile used on the homepage and the
 * destination page. This one carries the suitability copy and the derived
 * facts, because this page is where someone chooses between activity types
 * rather than being reminded they exist.
 *
 * ## Hierarchy
 *
 * Three tiers, and the spacing enforces them rather than the colours alone:
 *
 * 1. **The name.** Largest thing in the card, display face, sitting directly
 *    under the image with nothing above it competing.
 * 2. **What it involves.** Body size, full ink — this is prose to read, not a
 *    caption. Muting it here would flatten it into the metadata.
 * 3. **Who it suits, then the numbers.** Both deliberately quieter: small,
 *    muted, and the numbers in mono with uppercase micro-labels so they read as
 *    a data strip rather than another sentence.
 *
 * The vertical rhythm is a single scale — `mt-2` inside a tier, `mt-5` between
 * tiers, `pt-6` across the rule to the metadata. Ad-hoc spacing is what made
 * the previous version feel cramped: every gap was 3 or 4 and nothing
 * signalled where one idea ended.
 *
 * **Links to the activity page, never to the filtered listing.** The activity
 * page is the landing page for "trekking in Nepal" and carries its own
 * metadata, intro copy and grades table; the filtered listing canonicals back
 * to `/trips` and would orphan it. The "compare all N" link lives at the foot
 * of the activity page itself.
 */
export default function ActivityOverviewCard({
  activity,
  destination,
  stats,
}: {
  activity: IActivity;
  destination: Pick<IDestination, 'slug'>;
  /** Absent when the activity has no published trips yet. */
  stats?: ActivityStats;
}) {
  const duration = formatRange(
    stats?.minDuration ?? null,
    stats?.maxDuration ?? null,
    formatDays
  );

  const price = formatRange(
    stats?.minPrice ?? null,
    stats?.maxPrice ?? null,
    formatUsd
  );

  const tripCount = stats?.tripCount ?? 0;

  return (
    <article className="group h-full overflow-hidden rounded-lg border border-hairline bg-white transition-shadow hover:shadow-md">
      <Link
        href={activityPath(activity, destination)}
        className="flex h-full flex-col"
      >
        <div className="relative aspect-[3/2] overflow-hidden bg-hairline">
          <CloudinaryImage
            src={activity.coverImage}
            alt={activity.coverImageAlt}
            width={720}
            height={480}
            sizes="(min-width: 1024px) 24rem, (min-width: 640px) 45vw, 100vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>

        {/* Generous, and equal on every side. p-7 at the small breakpoint up. */}
        <div className="flex flex-1 flex-col p-6 sm:p-7">
          {/* Tier 1 — the name, first thing the eye lands on. */}
          <h3 className="font-display text-2xl font-extrabold leading-tight tracking-display">
            {activity.name}
          </h3>

          {/* Tier 2 — what it involves. Full ink, body size, prose to read. */}
          <p className="mt-3 text-base leading-relaxed">
            {activity.description}
          </p>

          {/* Tier 3a — who it suits. Quieter, and only when written. */}
          {activity.suitability && (
            <p className="mt-5 text-sm leading-relaxed text-muted">
              <span className="font-semibold text-ink">Suits </span>
              {lowerFirst(activity.suitability)}
            </p>
          )}

          {/*
            Tier 3b — the numbers.

            `mt-auto` pins this to the bottom of the card, so cards of different
            text lengths line their data strips up across the row. That is what
            makes a grid of these read as a table rather than as rubble, and it
            holds at any card count because it is per-card, not per-row.
          */}
          <dl className="mt-auto grid grid-cols-3 gap-4 border-t border-hairline pt-6">
            <Fact label="Trips" value={tripCount > 0 ? String(tripCount) : '—'} />
            <Fact label="Days" value={duration ?? '—'} />
            <Fact label="Price" value={price ?? '—'} />
          </dl>
        </div>
      </Link>
    </article>
  );
}

/**
 * "Suits anyone comfortable walking…" reads badly after the word "Suits", so
 * the sentence is lowercased at the join. Only the first character, and only
 * when it is not already part of a proper noun — "Nepal" must stay capitalised.
 */
function lowerFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  // A word in ALL CAPS or a two-word proper noun start is left alone.
  const firstWord = trimmed.split(/\s+/)[0];
  if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) {
    return trimmed;
  }

  // Drop a leading "Suits " so the label does not stutter.
  const withoutLabel = trimmed.replace(/^suits\s+/i, '');

  return withoutLabel.charAt(0).toLowerCase() + withoutLabel.slice(1);
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-sm font-semibold tabular">
        {value}
      </dd>
    </div>
  );
}
