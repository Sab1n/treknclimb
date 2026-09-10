import { DURATION_BUCKETS, PRICE_BUCKETS } from '../../lib/tripFilters';
import { IDestination } from '../../models/Destination';

/**
 * The hero trip search.
 *
 * **A plain HTML form with `method="get"` and `action="/trips"` — no
 * JavaScript, no `"use client"`.** The browser serialises the selects into a
 * query string on its own, and because the field names are exactly the filter
 * keys `/trips` already reads (`destination`, `duration`, `price`), submitting
 * lands on a correctly filtered listing with no code in between. It works with
 * JavaScript disabled and it works for a crawler, which matters on a site whose
 * traffic is organic.
 *
 * Three selects, not a text box. `/trips` filters on structured facets and has
 * no free-text index, so a search box would either quietly ignore what was
 * typed or need a whole search implementation behind it. Asking the three
 * questions that actually narrow a trekking catalogue — where, how long, what
 * budget — is honest about what the site can answer.
 *
 * One cosmetic cost: an unset select still submits, so skipping a field leaves
 * an empty parameter in the URL (`?destination=&duration=`). `queryToFilters`
 * reads those as absent and `/trips` canonicals to itself, so nothing
 * downstream cares.
 */
export default function TripSearch({
  destinations,
  ctaLabel = 'Find trips',
}: {
  destinations: Pick<IDestination, 'slug' | 'name'>[];
  ctaLabel?: string;
}) {
  return (
    <form
      action="/trips"
      method="get"
      className="rounded-lg bg-white p-4 text-ink shadow-lg sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SearchField label="Where" htmlFor="search-destination">
          <select
            id="search-destination"
            name="destination"
            className={selectClass}
            defaultValue=""
          >
            <option value="">Anywhere</option>
            {destinations.map((destination) => (
              <option key={destination.slug} value={destination.slug}>
                {destination.name}
              </option>
            ))}
          </select>
        </SearchField>

        <SearchField label="How long" htmlFor="search-duration">
          <select
            id="search-duration"
            name="duration"
            className={selectClass}
            defaultValue=""
          >
            <option value="">Any length</option>
            {DURATION_BUCKETS.map((bucket) => (
              <option key={bucket.key} value={bucket.key}>
                {bucket.label}
              </option>
            ))}
          </select>
        </SearchField>

        <SearchField label="Budget" htmlFor="search-price">
          <select
            id="search-price"
            name="price"
            className={selectClass}
            defaultValue=""
          >
            <option value="">Any budget</option>
            {PRICE_BUCKETS.map((bucket) => (
              <option key={bucket.key} value={bucket.key}>
                {bucket.label}
              </option>
            ))}
          </select>
        </SearchField>
      </div>

      <button
        type="submit"
        className="mt-4 w-full rounded-full bg-marigold px-6 py-3 font-semibold text-ink transition-opacity hover:opacity-90"
      >
        {ctaLabel}
      </button>
    </form>
  );
}

const selectClass =
  'w-full rounded border border-hairline bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-ink';

function SearchField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
