'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';

import TripFilters, { type TripFacets } from './TripFilters';
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  FILTER_LABELS,
  activeFilterCount,
  matches,
  sortTrips,
  narrowestFilter,
  filtersToQuery,
  queryToFilters,
  type TripFilterState,
  type TripFilterMeta,
  type SortKey,
} from '../../lib/tripFilters';

/*
 * Deliberately larger than the catalogue. Every matching trip then renders
 * into the static HTML, so crawlers see the whole list and every trip page
 * gets an internal link from here. At a few dozen cards the weight is
 * negligible; the Load more button stays as a safety valve if the catalogue
 * ever outgrows this.
 */
const PAGE_SIZE = 60;

export interface TripListItem {
  meta: TripFilterMeta;
  /**
   * The card, already rendered on the server. Passing a React node across the
   * boundary means `TripCard` stays a Server Component — its Cloudinary URL
   * building never reaches the browser — while this component still controls
   * which cards appear and in what order.
   */
  card: ReactNode;
}

/**
 * Filtering, sorting and URL state for /trips.
 *
 * The page itself is statically generated, and this component's *initial* state
 * is deliberately unfiltered. That means the static HTML contains every trip
 * card, which is what the SEO and GEO requirements need — crawlers that do not
 * run JavaScript still see the whole catalogue.
 *
 * Filters from the URL are applied in an effect after mount rather than during
 * render. That is the whole trick: reading the query string during render (via
 * `useSearchParams`) makes Next bail the subtree out of static generation and
 * put a fallback in the HTML instead of the trips. The cost is a brief flash of
 * the unfiltered list for someone arriving on a shared filtered link — the same
 * trade already accepted for currency conversion.
 */
export default function TripsExplorer({
  items,
  facets,
}: {
  items: TripListItem[];
  facets: TripFacets;
}) {
  const [filters, setFilters] = useState<TripFilterState>(EMPTY_FILTERS);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Read the URL after mount, and again on back/forward.
  useEffect(() => {
    const sync = () => setFilters(queryToFilters(window.location.search));

    sync();
    window.addEventListener('popstate', sync);

    return () => window.removeEventListener('popstate', sync);
  }, []);

  function applyFilters(next: TripFilterState) {
    setFilters(next);
    setVisible(PAGE_SIZE);

    // pushState rather than a router navigation: the page is static and every
    // trip is already here, so there is nothing to fetch. It keeps the URL
    // shareable and leaves a history entry so Back undoes one filter change.
    window.history.pushState({}, '', `${window.location.pathname}${filtersToQuery(next)}`);
  }

  const results = useMemo(() => {
    const matching = items.filter((item) => matches(item.meta, filters));
    const order = sortTrips(
      matching.map((item) => item.meta),
      filters.sort
    );

    const byId = new Map(matching.map((item) => [item.meta.id, item]));

    return order
      .map((meta) => byId.get(meta.id))
      .filter((item): item is TripListItem => item !== undefined);
  }, [items, filters]);

  const narrowest = useMemo(
    () =>
      narrowestFilter(
        items.map((item) => item.meta),
        filters
      ),
    [items, filters]
  );

  const activeCount = activeFilterCount(filters);

  const filterPanel = (
    <TripFilters
      facets={facets}
      filters={filters}
      onChange={applyFilters}
      resultCount={results.length}
    />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block lg:sticky lg:top-6 lg:self-start">
        {filterPanel}
      </aside>

      <div className="min-w-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold lg:hidden"
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>

          <p className="hidden font-mono text-sm text-muted tabular lg:block">
            {results.length} of {items.length} trips
          </p>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Sort</span>
            <select
              value={filters.sort}
              onChange={(event) =>
                applyFilters({
                  ...filters,
                  sort: event.target.value as SortKey,
                })
              }
              className="rounded border border-hairline bg-white px-3 py-2 text-sm"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {results.length > 0 ? (
          <>
            <ul className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {results.slice(0, visible).map((item) => (
                <li key={item.meta.id}>{item.card}</li>
              ))}
            </ul>

            {results.length > visible && (
              <div className="mt-10 text-center">
                <button
                  type="button"
                  onClick={() => setVisible((count) => count + PAGE_SIZE)}
                  className="rounded-full border-2 border-ink px-6 py-3 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
                >
                  Load {Math.min(PAGE_SIZE, results.length - visible)} more
                </button>
                <p className="mt-3 font-mono text-xs text-muted tabular">
                  Showing {visible} of {results.length}
                </p>
              </div>
            )}
          </>
        ) : (
          /*
            Empty state. Names the situation, offers to drop the single filter
            costing the most results rather than all of them, and still shows
            somewhere to go.
          */
          <div className="mt-6 rounded-lg border border-dashed border-hairline bg-white p-8 text-center sm:p-12">
            <h2 className="font-display text-xl font-extrabold tracking-display">
              No trips match all {activeCount} of those filters
            </h2>

            <p className="mx-auto mt-3 max-w-prose text-muted">
              {narrowest
                ? `The ${FILTER_LABELS[narrowest.key]} filter is the one narrowing this the most — dropping it brings back ${narrowest.wouldMatch} ${narrowest.wouldMatch === 1 ? 'trip' : 'trips'}.`
                : 'Nothing in the catalogue fits that combination yet. Tell us what you are looking for and we will say whether we run it.'}
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {narrowest && (
                <button
                  type="button"
                  onClick={() =>
                    applyFilters({ ...filters, [narrowest.key]: null })
                  }
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper"
                >
                  Clear the {FILTER_LABELS[narrowest.key]} filter
                </button>
              )}

              <button
                type="button"
                onClick={() => applyFilters({ ...EMPTY_FILTERS, sort: filters.sort })}
                className="rounded-full border-2 border-ink px-5 py-2.5 text-sm font-semibold"
              >
                Show all {items.length} trips
              </button>

              <Link
                href="/contact"
                className="rounded-full px-5 py-2.5 text-sm font-semibold underline underline-offset-4 hover:text-muted"
              >
                Ask us what we run
              </Link>
            </div>

            {items.length > 0 && (
              <div className="mt-10 border-t border-hairline pt-8 text-left">
                <h3 className="text-center text-xs uppercase tracking-wide text-muted">
                  Popular instead
                </h3>
                <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {sortTrips(
                    items.map((item) => item.meta),
                    'recommended'
                  )
                    .slice(0, 3)
                    .map((meta) => {
                      const item = items.find((i) => i.meta.id === meta.id);
                      return item ? <li key={meta.id}>{item.card}</li> : null;
                    })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setDrawerOpen(false)}
            className="flex-1 bg-ink/60"
          />

          <div className="flex w-[86%] max-w-sm flex-col overflow-y-auto bg-paper p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold tracking-display">
                Filters
              </h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded px-3 py-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <div className="mt-6 flex-1">{filterPanel}</div>

            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="mt-6 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper"
            >
              Show {results.length} {results.length === 1 ? 'trip' : 'trips'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
