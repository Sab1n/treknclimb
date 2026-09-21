'use client';

import {
  DURATION_BUCKETS,
  PRICE_BUCKETS,
  FILTER_KEYS,
  EMPTY_FILTERS,
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
  /**
   * Keyed by **activity** slug, not destination.
   *
   * A region belongs to a destination, but a region only narrows a listing
   * within an activity — the Everest region holds both treks and peak climbs,
   * and offering "Everest" before an activity is chosen would mix them. Activity
   * slugs are unique across the collection, so one flat key is unambiguous.
   */
  regionsByActivity: Record<string, FacetOption[]>;
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

  /*
   * Regions appear only once an activity is chosen, for the same reason the
   * activity group waits for a destination: the options below it are
   * meaningless without it, and an activity with no regions simply has no entry
   * here rather than an empty group. Nothing tests the activity's *name* — an
   * activity has regions when its trips do.
   */
  const regionOptions = filters.activity
    ? facets.regionsByActivity[filters.activity]
    : undefined;

  const activeCount = FILTER_KEYS.filter((key) => filters[key] !== null).length;

  function set(key: FilterKey, value: string | null) {
    const next = { ...filters, [key]: value };

    /*
     * Changing a level invalidates everything below it.
     * /trips?destination=india&activity=trekking returns nothing forever, and
     * so does keeping ?region=everest after switching to peak climbing in a
     * destination where that pairing has no trips. Clearing downward is the
     * only way a filter UI stays honest about what it is offering.
     */
    if (key === 'destination') {
      next.activity = null;
      next.region = null;
    }

    if (key === 'activity') next.region = null;

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
              onChange({ ...EMPTY_FILTERS, sort: filters.sort })
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

      {regionOptions && regionOptions.length > 0 && (
        <FilterGroup
          legend="Region"
          options={regionOptions}
          selected={filters.region}
          onSelect={(value) => set('region', value)}
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
