'use client';

import { useId, useMemo, type ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

import type { BookingRailDTO } from '../../types/dto';
import {
  addDays,
  departureOnDate,
  parseDepartureId,
  generateDepartures,
  groupFromPrice,
  type Departure,
} from '../../lib/departures';
import { DeparturePicker, DepartureSummary, usd } from '../content/DeparturePicker';
import { formatDepartureRange } from '../../lib/bookingDeparture';

/**
 * The top of the inquiry form once a trip is chosen: group departure or
 * private trip, and for a group, which departure.
 *
 * ## The choice is the visitor's, and it is recorded as one
 *
 * Two real radio buttons registered with React Hook Form as `tripType`, with
 * one **pre-selected from how the visitor arrived**: group when they came with
 * a departure, private otherwise. Not required, and not read back off the
 * date field — the stored type is whichever radio is selected when they press
 * send, which is either what they arrived asking for or what they changed it
 * to. A trip with no group departures shows that option disabled, saying why.
 *
 * ## A departure is shown, not re-asked
 *
 * A visitor arriving from the trip page's "Continue with 13 October" sees that
 * departure at the top — dates, length, price per person — with "Change date"
 * and "Switch to a private trip". The calendar opens only to change it, or
 * when no departure has been chosen yet. Same picker as the rail
 * (`DeparturePicker`), so the two show a month identically.
 */

export interface TripChoiceTrip {
  slug: string;
  title: string;
  rail: BookingRailDTO;
}

export default function TripChoice({
  trip,
  today,
  tripType,
  departureId,
  radio,
  tripTypeError,
  departureError,
  pickerOpen,
  arrivedWith,
  onPickDeparture,
  onChangeDate,
  onSwitchToPrivate,
  privateDateField,
}: {
  trip: TripChoiceTrip;
  today: string;
  tripType: string;
  departureId: string;
  /** `register('tripType')`, spread onto both radios. */
  radio: UseFormRegisterReturn<'tripType'>;
  tripTypeError?: string;
  departureError?: string;
  pickerOpen: boolean;
  /** The `?departure=` the visitor arrived with, if any. */
  arrivedWith: string | null;
  onPickDeparture: (departure: Departure) => void;
  onChangeDate: () => void;
  onSwitchToPrivate: () => void;
  /** The preferred-date field (and its blackout warning), for a private trip. */
  privateDateField: ReactNode;
}) {
  const departures = useMemo(
    () => generateDepartures(trip.rail.seasons, trip.rail.durationDays, today),
    [trip.rail.seasons, trip.rail.durationDays, today]
  );

  const hasGroupOption = departures.length > 0;
  const groupFrom = groupFromPrice(departures);

  /*
   * The chosen departure, looked up by identity in what is generated *now*.
   * Only an available one counts: a departure that went full while the page
   * was open stops being a choice rather than being submitted as one.
   */
  const chosen = departures.find(
    (departure) => departure.id === departureId && departure.status === 'available'
  ) ?? null;

  /*
   * The departure the visitor arrived with, if it is no longer one they can
   * choose. Derived during render rather than set by an effect: nothing is
   * chosen, and the arrival id is not among the available departures.
   */
  const arrival = arrivedWith ? parseDepartureId(arrivedWith) : null;
  const arrivalGone =
    !!arrival &&
    !departureId &&
    !departures.some((departure) => departure.id === arrivedWith && departure.status === 'available');

  const notice = arrivalGone
    ? `The departure you chose — ${formatDepartureRange(arrival.date, addDays(arrival.date, Math.max(trip.rail.durationDays, 1) - 1))} — can no longer be joined. Choose another date, or switch to a private trip.`
    : null;

  const legendId = useId();
  const tripTypeErrorId = useId();
  const departureErrorId = useId();

  return (
    <div className="flex flex-col gap-4">
      <fieldset aria-describedby={tripTypeError ? tripTypeErrorId : undefined}>
        <legend id={legendId} className="text-sm font-semibold">
          How would you like to travel?
        </legend>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            radio={radio}
            value="group"
            checked={tripType === 'group'}
            disabled={!hasGroupOption}
            title="Join a group departure"
            detail={
              !hasGroupOption
                ? 'No group dates scheduled'
                : groupFrom === null
                  ? 'Every date is full or closed'
                  : `Fixed dates · from ${usd.format(groupFrom)}`
            }
          />
          <ChoiceCard
            radio={radio}
            value="private"
            checked={tripType === 'private'}
            title="Private trip"
            detail={`Your own dates · from ${usd.format(trip.rail.privateFrom)}`}
          />
        </div>

        {tripTypeError && (
          <p id={tripTypeErrorId} role="alert" className="mt-1.5 text-sm text-error">
            {tripTypeError}
          </p>
        )}
      </fieldset>

      {tripType === 'group' && (
        <div className="flex flex-col gap-3">
          {chosen && !pickerOpen && (
            <DepartureSummary
              departure={chosen}
              durationDays={trip.rail.durationDays}
              tone="light"
              heading="Your departure"
              empty={null}
            >
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
                <button
                  type="button"
                  onClick={onChangeDate}
                  className="underline underline-offset-4 hover:no-underline"
                >
                  Change date
                </button>
                <button
                  type="button"
                  onClick={onSwitchToPrivate}
                  className="underline underline-offset-4 hover:no-underline"
                >
                  Switch to a private trip
                </button>
              </div>
            </DepartureSummary>
          )}

          {(!chosen || pickerOpen) && (
            <div>
              {notice && (
                <p role="status" className="mb-3 rounded border border-marigold/50 bg-marigold/15 px-3 py-2 text-sm">
                  {notice}
                </p>
              )}

              <p className="mb-2 text-sm font-semibold">
                Choose a departure date
                <span className="ml-2 font-normal text-muted">Required</span>
              </p>

              <DeparturePicker
                departures={departures}
                today={today}
                selected={chosen?.date ?? null}
                onSelect={(date) => {
                  const departure = departureOnDate(departures, date);
                  if (departure?.status === 'available') onPickDeparture(departure);
                }}
                tone="light"
              />

              {departureError && (
                <p id={departureErrorId} role="alert" className="mt-2 text-sm text-error">
                  {departureError}
                </p>
              )}

              {chosen && (
                <button
                  type="button"
                  onClick={() => onPickDeparture(chosen)}
                  className="mt-3 text-sm font-semibold underline underline-offset-4 hover:no-underline"
                >
                  Keep the date I had
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tripType === 'private' && privateDateField}
    </div>
  );
}

/**
 * One option as a card: a real radio, visually hidden, with the label as the
 * visible control — arrow keys move between the two, the checked state and
 * the legend are announced, and the card is the click target.
 *
 * A disabled option stays visible with its reason. A trip with no group dates
 * should say so rather than show one lonely radio button.
 */
function ChoiceCard({
  radio,
  value,
  checked,
  disabled = false,
  title,
  detail,
}: {
  radio: UseFormRegisterReturn<'tripType'>;
  value: 'group' | 'private';
  checked: boolean;
  disabled?: boolean;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex flex-col rounded border px-4 py-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-marigold ${
        disabled
          ? 'cursor-not-allowed border-hairline bg-paper text-muted'
          : checked
            ? 'cursor-pointer border-ink bg-ink text-paper'
            : 'cursor-pointer border-hairline bg-white hover:border-ink'
      }`}
    >
      <input type="radio" value={value} disabled={disabled} {...radio} className="sr-only" />
      <span className="text-sm font-semibold">{title}</span>
      <span className={`mt-0.5 font-mono text-xs tabular ${checked ? 'text-paper/70' : 'text-muted'}`}>
        {detail}
      </span>
    </label>
  );
}
