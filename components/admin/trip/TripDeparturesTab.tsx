'use client';

import type { SeasonRow, ExceptionRow, BlackoutRow } from '../../../types/tripEditor';
import { newRowKey } from '../../../types/tripEditor';
import { RepeatableList, AddRowButton, updateRow } from './RepeatableList';
import {
  CheckboxGroupField,
  DateField,
  NumberField,
  SelectField,
  TextField,
} from '../fields';
import {
  EXCEPTION_STATUSES,
  DEPARTURE_STATUS_LABELS,
  ISO_WEEKDAYS,
} from '../../../models/shared/departures';
import {
  exceptionProblems,
  isIsoDate,
  nepalToday,
  seasonDates,
  seasonOverlaps,
} from '../../../lib/departures';

/**
 * Departure seasons and private-trip blackout periods.
 *
 * ## Seasons, not rows of dates
 *
 * A season is a date range, a pattern — every day, or chosen days of the week
 * — and a price per person. The trip page generates the individual departures
 * from it. A season that starts and ends on the same day is a single
 * departure. Under each season is a list of **exceptions**: dates marked full
 * or closed, or given their own price.
 *
 * Availability is the office's call and nothing else: there is no capacity and
 * no places-booked count, and no "guaranteed" flag, because every published
 * departure runs.
 *
 * A season whose dates have all passed is **not** something to delete. The
 * trip page stops showing its dates on its own; it stays here, marked past,
 * because part two points inquiries at the departures it generated.
 *
 * ## Checked live, and again on save
 *
 * End-before-start, a days-of-week season with no days, exceptions that fall
 * outside the season or do nothing, and two seasons departing on the same date
 * are flagged while the row is being typed — by the same `exceptionProblems()`
 * and `seasonOverlaps()` the Zod schema and the model call on save, so the
 * three can never disagree. A live message steps aside when the server has
 * already said something about that field, so no input ever shows two
 * different messages.
 *
 * ## Errors that belong to no single input
 *
 * Most server errors are keyed to a field — `departureSeasons.0.exceptions.0.status`
 * renders under that status select. Two are not, because the model validates
 * a list as a whole: `departureSeasons` (the overlap rule, which is about
 * pairs) and `departureSeasons.<i>.exceptions` (the exception rule, which the
 * model runs over the season's list). Both are rendered here, as `ListError`,
 * or they would count on the tab's badge and appear nowhere on it.
 */

const PATTERN_OPTIONS = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Chosen days of the week' },
];

const EXCEPTION_STATUS_OPTIONS = EXCEPTION_STATUSES.map((status) => ({
  value: status,
  label: DEPARTURE_STATUS_LABELS[status],
}));

const WEEKDAY_SHORT: string[] = ISO_WEEKDAYS.map((day) => day.short);

const rowDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function label(date: string): string {
  return rowDate.format(new Date(`${date}T00:00:00.000Z`));
}

/** Whether the row's own fields are complete enough to generate from. */
function isComplete(row: SeasonRow): boolean {
  return (
    isIsoDate(row.startDate) &&
    isIsoDate(row.endDate) &&
    row.endDate >= row.startDate &&
    (row.pattern === 'daily' || row.weekdays.length > 0)
  );
}

function seasonTitle(row: SeasonRow, today: string): string {
  if (!isIsoDate(row.startDate)) return 'New season';

  const range =
    row.startDate === row.endDate || !isIsoDate(row.endDate)
      ? `${label(row.startDate)} — single departure`
      : `${label(row.startDate)} – ${label(row.endDate)}`;

  const past = isIsoDate(row.endDate) && row.endDate < today ? ' — past, hidden on the site' : '';

  return `${range}${past}`;
}

function toSeasonShape(row: SeasonRow) {
  return {
    startDate: row.startDate,
    endDate: row.endDate,
    pattern: row.pattern === 'weekdays' ? ('weekdays' as const) : ('daily' as const),
    weekdays: row.weekdays,
  };
}

export default function TripDeparturesTab({
  seasons,
  blackoutPeriods,
  onSeasonsChange,
  onBlackoutPeriodsChange,
  errors,
}: {
  seasons: SeasonRow[];
  blackoutPeriods: BlackoutRow[];
  onSeasonsChange: (rows: SeasonRow[]) => void;
  onBlackoutPeriodsChange: (rows: BlackoutRow[]) => void;
  /** Server errors keyed `departureSeasons.<i>.<field>` and `blackoutPeriods.…`. */
  errors: Record<string, string>;
}) {
  /*
   * Pokhara's date, the same "today" the trip page uses, so "past" here means
   * exactly what it means to a visitor.
   */
  const today = nepalToday();

  function addSeason() {
    /*
     * The price starts from the previous season: one trip's seasons are
     * usually priced alike, so the common case is two dates to type.
     */
    const last = seasons[seasons.length - 1];

    onSeasonsChange([
      ...seasons,
      {
        key: newRowKey('season'),
        id: '',
        startDate: '',
        endDate: '',
        pattern: 'daily',
        weekdays: [],
        pricePerPerson: last?.pricePerPerson ?? '',
        exceptions: [],
      },
    ]);
  }

  /*
   * Live overlap check, on the complete seasons only. Keyed by season index;
   * shown on that season's first-departure field.
   */
  const overlaps = seasonOverlaps(seasons.map(toSeasonShape));

  function addBlackout() {
    onBlackoutPeriodsChange([
      ...blackoutPeriods,
      { key: newRowKey('blackout'), id: '', start: '', end: '', reason: '' },
    ]);
  }

  return (
    <div className="flex max-w-4xl flex-col gap-12">
      {/* ---------------- departure seasons ---------------- */}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-base font-extrabold tracking-display">
            Group departure seasons
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            A date range, the days a group leaves on, and one price per person in{' '}
            <strong>USD</strong>. The trip page turns each season into a calendar
            of departure dates. For a single fixed date, make the season start and
            end on the same day. Mark individual dates full or closed — or give
            them their own price — in the exceptions under each season. There is
            no places-remaining figure and no &ldquo;guaranteed&rdquo; badge;
            every departure listed runs.
          </p>
        </div>

        <ListError message={errors.departureSeasons} />

        <RepeatableList
          rows={seasons}
          onChange={onSeasonsChange}
          label="Departure seasons"
          rowLabel={(row) => seasonTitle(row, today)}
          empty={
            <>
              No seasons. The trip page offers private trips only, which is a
              perfectly normal way to sell a trip.
            </>
          }
        >
          {(row, index) => (
            <SeasonEditor
              row={row}
              index={index}
              today={today}
              errors={errors}
              overlap={overlaps.get(index)}
              onChange={(patch) => onSeasonsChange(updateRow(seasons, row.key, patch))}
            />
          )}
        </RepeatableList>

        <AddRowButton onClick={addSeason}>Add a season</AddRowButton>
      </section>

      {/* ---------------- blackout periods ---------------- */}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-base font-extrabold tracking-display">
            Private trip blackout periods
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Dates a <strong>private</strong> trip cannot start. Both ends are
            included, so a closure on the 25th alone is the 25th to the 26th. A
            visitor who picks a date inside one is warned on the trip page, but
            can still send the inquiry. Group departures are not affected. The
            reason is shown to the visitor, so write it for them.
          </p>
        </div>

        <ListError message={errors.blackoutPeriods} />

        <RepeatableList
          rows={blackoutPeriods}
          onChange={onBlackoutPeriodsChange}
          label="Blackout periods"
          rowLabel={(row) =>
            row.start && row.end ? `${label(row.start)} – ${label(row.end)}` : 'New blackout period'
          }
          empty={<>No blackout periods. A private trip can start on any date.</>}
        >
          {(row, index) => (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DateField
                label="From"
                id={`blackout-${row.key}-start`}
                required
                value={row.start}
                onChange={(value) =>
                  onBlackoutPeriodsChange(updateRow(blackoutPeriods, row.key, { start: value }))
                }
                error={errors[`blackoutPeriods.${index}.start`]}
              />

              <DateField
                label="To"
                id={`blackout-${row.key}-end`}
                required
                value={row.end}
                onChange={(value) =>
                  onBlackoutPeriodsChange(updateRow(blackoutPeriods, row.key, { end: value }))
                }
                error={
                  errors[`blackoutPeriods.${index}.end`] ??
                  (row.start && row.end && row.end <= row.start
                    ? 'Must be after the start date'
                    : undefined)
                }
              />

              <div className="sm:col-span-2">
                <TextField
                  label="Reason shown to visitors"
                  id={`blackout-${row.key}-reason`}
                  value={row.reason}
                  onChange={(value) =>
                    onBlackoutPeriodsChange(updateRow(blackoutPeriods, row.key, { reason: value }))
                  }
                  error={errors[`blackoutPeriods.${index}.reason`]}
                  placeholder="Tihar — lodges on the route are closed"
                />
              </div>
            </div>
          )}
        </RepeatableList>

        <AddRowButton onClick={addBlackout}>Add a blackout period</AddRowButton>
      </section>
    </div>
  );
}

function SeasonEditor({
  row,
  index,
  today,
  errors,
  overlap,
  onChange,
}: {
  row: SeasonRow;
  index: number;
  today: string;
  errors: Record<string, string>;
  /** The live overlap message for this season, if it clashes with an earlier one. */
  overlap: string | undefined;
  onChange: (patch: Partial<SeasonRow>) => void;
}) {
  const path = `departureSeasons.${index}`;
  const complete = isComplete(row);

  /*
   * The live checks. Each is only computed once the fields it depends on are
   * filled in — a half-typed season is not an error yet.
   */
  const endError =
    isIsoDate(row.startDate) && isIsoDate(row.endDate) && row.endDate < row.startDate
      ? 'Cannot end before it starts'
      : undefined;

  const weekdaysError =
    row.pattern === 'weekdays' && row.weekdays.length === 0
      ? 'Choose at least one day'
      : undefined;

  const liveExceptionProblems = complete
    ? exceptionProblems(
        toSeasonShape(row),
        row.exceptions
          .filter((exception) => isIsoDate(exception.date))
          .map((exception) => ({
            date: exception.date,
            status: exception.status || null,
            pricePerPerson:
              exception.pricePerPerson.trim() === '' ? null : Number(exception.pricePerPerson),
          }))
      )
    : new Map<number, string>();

  // The indices above are into the filtered list; map them back to the rows.
  const datedExceptions = row.exceptions.filter((exception) => isIsoDate(exception.date));
  const exceptionError = (exception: ExceptionRow) => {
    const filteredIndex = datedExceptions.indexOf(exception);

    return filteredIndex < 0 ? undefined : liveExceptionProblems.get(filteredIndex);
  };

  const dates = complete ? seasonDates(toSeasonShape(row)) : [];
  const upcoming = dates.filter((date) => date >= today).length;
  const marked = row.exceptions.filter((exception) => exception.status).length;

  function updateException(key: string, patch: Partial<ExceptionRow>) {
    onChange({ exceptions: updateRow(row.exceptions, key, patch) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DateField
          label="First departure"
          id={`season-${row.key}-start`}
          required
          value={row.startDate}
          onChange={(value) => onChange({ startDate: value })}
          error={errors[`${path}.startDate`] ?? overlap}
        />

        <DateField
          label="Last departure"
          id={`season-${row.key}-end`}
          required
          value={row.endDate}
          onChange={(value) => onChange({ endDate: value })}
          error={errors[`${path}.endDate`] ?? endError}
          hint="Same as the first for a single departure."
        />

        <SelectField
          label="Departs"
          id={`season-${row.key}-pattern`}
          required
          value={row.pattern}
          options={PATTERN_OPTIONS}
          onChange={(value) => onChange({ pattern: value })}
          error={errors[`${path}.pattern`]}
        />

        <NumberField
          label="Price each"
          id={`season-${row.key}-price`}
          required
          suffix="USD"
          value={row.pricePerPerson}
          onChange={(value) => onChange({ pricePerPerson: value })}
          error={errors[`${path}.pricePerPerson`]}
        />
      </div>

      {row.pattern === 'weekdays' && (
        <CheckboxGroupField
          label="On these days"
          id={`season-${row.key}-weekdays`}
          values={row.weekdays.map((day) => WEEKDAY_SHORT[day - 1])}
          options={WEEKDAY_SHORT}
          onChange={(values) =>
            onChange({
              weekdays: values.map((value) => WEEKDAY_SHORT.indexOf(value) + 1),
            })
          }
          error={errors[`${path}.weekdays`] ?? weekdaysError}
        />
      )}

      {complete && (
        <p className="font-mono text-sm tabular">
          {dates.length} {dates.length === 1 ? 'departure' : 'departures'}
          {upcoming < dates.length && (
            <span className="text-muted"> · {dates.length - upcoming} past, hidden on the site</span>
          )}
          {marked > 0 && <span className="text-muted"> · {marked} marked full or closed</span>}
        </p>
      )}

      {/* ---------------- exceptions ---------------- */}

      <div className="rounded border border-hairline bg-paper/60 p-4">
        <h3 className="text-sm font-semibold">Exceptions</h3>
        <p className="mt-0.5 text-xs text-muted">
          Dates in this season that are full, closed, or priced differently. Leave
          the status as &ldquo;Runs as normal&rdquo; to change only the price.
        </p>

        <ListError message={errors[`${path}.exceptions`]} />

        {row.exceptions.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3">
            {row.exceptions.map((exception, exceptionIndex) => {
              const exceptionPath = `${path}.exceptions.${exceptionIndex}`;

              return (
                <li
                  key={exception.key}
                  className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <DateField
                    label="Date"
                    id={`exception-${exception.key}-date`}
                    required
                    value={exception.date}
                    onChange={(value) => updateException(exception.key, { date: value })}
                    error={errors[`${exceptionPath}.date`] ?? exceptionError(exception)}
                  />

                  <SelectField
                    label="Status"
                    id={`exception-${exception.key}-status`}
                    value={exception.status}
                    options={EXCEPTION_STATUS_OPTIONS}
                    placeholder="Runs as normal"
                    onChange={(value) => updateException(exception.key, { status: value })}
                    error={errors[`${exceptionPath}.status`]}
                  />

                  <NumberField
                    label="Own price"
                    id={`exception-${exception.key}-price`}
                    suffix="USD"
                    value={exception.pricePerPerson}
                    onChange={(value) => updateException(exception.key, { pricePerPerson: value })}
                    error={errors[`${exceptionPath}.pricePerPerson`]}
                    hint="Blank uses the season price."
                  />

                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        exceptions: row.exceptions.filter((item) => item.key !== exception.key),
                      })
                    }
                    className="mt-6 self-start rounded px-2 py-2 text-sm text-muted underline-offset-2 hover:text-error hover:underline"
                    aria-label={`Remove the exception on ${exception.date ? label(exception.date) : 'this row'}`}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={() =>
            onChange({
              exceptions: [
                ...row.exceptions,
                { key: newRowKey('exception'), date: '', status: 'full', pricePerPerson: '' },
              ],
            })
          }
          className="mt-3 text-sm font-semibold underline underline-offset-2 hover:no-underline"
        >
          Add an exception
        </button>
      </div>
    </div>
  );
}

/**
 * An error about a whole list rather than one input. `role="alert"` like a
 * field error, so it is announced when a failed save puts it on screen.
 */
function ListError({ message }: { message: string | undefined }) {
  if (!message) return null;

  return (
    <p role="alert" className="mt-2 rounded border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
      {message}
    </p>
  );
}
