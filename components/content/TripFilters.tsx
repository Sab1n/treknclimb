'use client';

import {
  DURATION_BUCKETS,
  PRICE_BUCKETS,
  FILTER_KEYS,
  type TripFilterState,
  type FilterKey,
} from '../../lib/tripFilters';

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface TripFacets {
  destinations: FacetOption[];
  /** Keyed by destination slug — only destinations with an activity layer appear. */
  activitiesByDestination: Record<string, FacetOption[]>;
  difficulties: FacetOption[];
}

/**
 * The filter controls. Presentational: it holds no state of its own and calls
 * back with the next filter object.
 *
 * The activity group appears **only when a destination that has activities is
 * selected.** That is the Nepal asymmetry reaching the filter UI: showing an
 * activity filter alongside India or Bhutan would offer a choice that can only
 * ever return nothing, and showing it with no destination chosen would imply
 * every destination has one.
 */
export default function TripFilters({
  facets,
  filters,
  onChange,
  resultCount,
}: {
  facets: TripFacets;
  filters: TripFilterState;
  onChange: (next: TripFilterState) => void;
  resultCount: number;
}) {
  const activityOptions = filters.destination
    ? facets.activitiesByDestination[filters.destination]
    : undefined;

  const activeCount = FILTER_KEYS.filter((key) => filters[key] !== null).length;

  function set(key: FilterKey, value: string | null) {
    const next = { ...filters, [key]: value };

    // Changing destination invalidates any activity choice underneath it —
    // /trips?destination=india&activity=trekking would return nothing forever.
    if (key === 'destination') next.activity = null;

    onChange(next);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-sm tabular">
          {resultCount} {resultCount === 1 ? 'trip' : 'trips'}
        </p>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() =>
              onChange({
                destination: null,
                activity: null,
                duration: null,
                difficulty: null,
                price: null,
                sort: filters.sort,
              })
            }
            className="text-sm font-semibold underline underline-offset-4 hover:text-muted"
          >
            Clear {activeCount === 1 ? 'filter' : `all ${activeCount} filters`}
          </button>
        )}
      </div>

      <FilterGroup
        legend="Destination"
        options={facets.destinations}
        selected={filters.destination}
        onSelect={(value) => set('destination', value)}
      />

      {/* Only rendered for a destination that actually has an activity layer. */}
      {activityOptions && activityOptions.length > 0 && (
        <FilterGroup
          legend="Activity"
          options={activityOptions}
          selected={filters.activity}
          onSelect={(value) => set('activity', value)}
        />
      )}

      <FilterGroup
        legend="Duration"
        options={DURATION_BUCKETS.map((bucket) => ({
          value: bucket.key,
          label: bucket.label,
        }))}
        selected={filters.duration}
        onSelect={(value) => set('duration', value)}
      />

      <FilterGroup
        legend="Grade"
        options={facets.difficulties}
        selected={filters.difficulty}
        onSelect={(value) => set('difficulty', value)}
      />

      <FilterGroup
        legend="Price"
        options={PRICE_BUCKETS.map((bucket) => ({
          value: bucket.key,
          label: bucket.label,
        }))}
        selected={filters.price}
        onSelect={(value) => set('price', value)}
      />
    </div>
  );
}

/**
 * One group of mutually exclusive options, rendered as radios so that keyboard
 * and screen-reader users get grouped-choice semantics for free. Clicking the
 * selected option again clears it.
 */
function FilterGroup({
  legend,
  options,
  selected,
  onSelect,
}: {
  legend: string;
  options: { value: string; label: string; count?: number }[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted">
        {legend}
      </legend>

      <div className="mt-3 flex flex-col gap-1">
        {options.map((option) => {
          const isSelected = selected === option.value;

          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm transition-colors ${
                isSelected ? 'bg-ink text-paper' : 'hover:bg-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={legend}
                  checked={isSelected}
                  onChange={() => onSelect(option.value)}
                  // Click-to-clear: a second click on the chosen option removes
                  // the filter, which is quicker than hunting for "clear all".
                  onClick={() => {
                    if (isSelected) onSelect(null);
                  }}
                  className="sr-only"
                />
                {option.label}
              </span>

              {option.count != null && (
                <span
                  className={`font-mono text-xs tabular ${
                    isSelected ? 'text-paper/60' : 'text-muted'
                  }`}
                >
                  {option.count}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
