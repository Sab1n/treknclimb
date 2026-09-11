'use client';

import type { ItineraryRow } from '../../../types/tripEditor';
import { newRowKey } from '../../../types/tripEditor';
import { RepeatableList, AddRowButton, updateRow } from './RepeatableList';
import {
  TextField,
  NumberField,
  TextAreaField,
  FieldRow,
} from '../fields';

/**
 * The day-by-day itinerary.
 *
 * ## Day numbers are the array order, and are not editable
 *
 * There is no "Day" input. The number is the row's position, renumbered by the
 * server on save. An editable day number alongside drag-to-reorder would be two
 * sources of truth for one fact, and they would disagree the first time anyone
 * dragged anything — leaving "Day 3, Day 2, Day 4" stored, and the elevation
 * graph plotted in that order.
 *
 * ## The altitude requirement is live
 *
 * `hasElevationProfile` lives on the Facts tab and decides whether
 * `itinerary[].maxAltitudeM` is required. Ticking it there has to show up
 * *here*, immediately — otherwise an admin ticks a box on one tab and the
 * consequence appears as a save failure about a different tab some minutes
 * later.
 *
 * So the flag is passed in as a prop and the field's `required` marker, its
 * hint and the summary banner all derive from it on every render. Nothing is
 * cached and there is no effect syncing anything: it is derived state, which is
 * the whole reason it cannot fall out of step.
 *
 * Three layers enforce the rule — the model's subdocument validator (the
 * guarantee, reading `this.parent().hasElevationProfile`), the Zod schema
 * (reports every missing day at once, keyed to a row), and this (says so before
 * the admin has typed anything).
 */
export default function ItineraryEditor({
  days,
  onChange,
  errors,
  hasElevationProfile,
  durationDays,
}: {
  days: ItineraryRow[];
  onChange: (days: ItineraryRow[]) => void;
  errors: Record<string, string>;
  hasElevationProfile: boolean;
  durationDays: string;
}) {
  const missingAltitude = hasElevationProfile
    ? days.filter((day) => day.maxAltitudeM.trim() === '').length
    : 0;

  const missingImageAlt = days.filter(
    (day) => day.image.trim() !== '' && day.imageAlt.trim() === ''
  ).length;

  /*
   * A mismatch between the stated duration and the number of days written is
   * worth pointing out and is not an error: the itinerary is often written
   * before the duration is settled, and a trip can legitimately state 14 days
   * while the itinerary describes the 12 that involve walking.
   */
  const stated = durationDays.trim() === '' ? null : Number(durationDays);
  const durationMismatch =
    stated !== null &&
    Number.isFinite(stated) &&
    days.length > 0 &&
    days.length !== stated;

  function addDay() {
    onChange([
      ...days,
      {
        key: newRowKey('day'),
        title: '',
        description: '',
        location: '',
        maxAltitudeM: '',
        distanceKm: '',
        durationHours: '',
        accommodation: '',
        meals: '',
        image: '',
        imageAlt: '',
      },
    ]);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="font-display text-base font-extrabold tracking-display">
          Itinerary
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Day numbers come from this order and are renumbered on save — drag a
          row or use the arrows to change them.
        </p>
      </div>

      {/*
        The live consequence of the Facts tab's checkbox. Rendered whether or
        not anything is missing, so ticking the box produces visible feedback
        on this tab rather than silence until save.
      */}
      {hasElevationProfile && (
        <p
          role="status"
          className={`rounded border px-4 py-3 text-sm ${
            missingAltitude > 0
              ? 'border-error/30 bg-error/5 text-error'
              : 'border-hairline bg-white text-muted'
          }`}
        >
          {missingAltitude > 0 ? (
            <>
              This trip has an elevation profile, so every day needs an altitude.{' '}
              <strong>
                {missingAltitude} {missingAltitude === 1 ? 'day is' : 'days are'}{' '}
                missing one
              </strong>{' '}
              — the save will be blocked until they are filled in.
            </>
          ) : (
            <>
              This trip has an elevation profile. Every day has an altitude, so
              the graph will render.
            </>
          )}
        </p>
      )}

      {missingImageAlt > 0 && (
        <p role="status" className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {missingImageAlt} day {missingImageAlt === 1 ? 'image needs' : 'images need'} alt
          text. This will block the save.
        </p>
      )}

      {durationMismatch && (
        <p role="status" className="rounded border border-marigold/40 bg-marigold/10 px-4 py-3 text-sm">
          The trip says {stated} days but the itinerary has {days.length}. Not an
          error — but the two numbers are both shown on the page.
        </p>
      )}

      <RepeatableList
        rows={days}
        onChange={onChange}
        label="Itinerary days"
        rowLabel={(day, index) =>
          day.title.trim() !== ''
            ? `Day ${index + 1} — ${day.title}`
            : `Day ${index + 1}`
        }
        empty={<>No itinerary yet. Add the first day.</>}
      >
        {(day, index) => (
          <div className="flex flex-col gap-4">
            <FieldRow>
              <TextField
                label="Title"
                id={`day-${day.key}-title`}
                required
                value={day.title}
                onChange={(value) =>
                  onChange(updateRow(days, day.key, { title: value }))
                }
                error={errors[`itinerary.${index}.title`]}
                placeholder="Fly to Lukla, trek to Phakding"
              />

              <TextField
                label="Location"
                id={`day-${day.key}-location`}
                value={day.location}
                onChange={(value) =>
                  onChange(updateRow(days, day.key, { location: value }))
                }
                error={errors[`itinerary.${index}.location`]}
              />
            </FieldRow>

            <TextAreaField
              label="Description"
              id={`day-${day.key}-description`}
              required
              rows={4}
              value={day.description}
              onChange={(value) =>
                onChange(updateRow(days, day.key, { description: value }))
              }
              error={errors[`itinerary.${index}.description`]}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Altitude"
                id={`day-${day.key}-altitude`}
                /*
                 * The one field whose required state is conditional, derived
                 * live from the Facts tab's checkbox. `Field` renders the word
                 * "Required" from this, so ticking the box over there changes
                 * the label here immediately.
                 */
                required={hasElevationProfile}
                suffix="m"
                value={day.maxAltitudeM}
                onChange={(value) =>
                  onChange(updateRow(days, day.key, { maxAltitudeM: value }))
                }
                error={errors[`itinerary.${index}.maxAltitudeM`]}
                hint={
                  hasElevationProfile
                    ? 'Plotted on the elevation graph.'
                    : 'Optional — this trip has no elevation profile.'
                }
              />

              <NumberField
                label="Distance"
                id={`day-${day.key}-distance`}
                suffix="km"
                value={day.distanceKm}
                onChange={(value) =>
                  onChange(updateRow(days, day.key, { distanceKm: value }))
                }
                error={errors[`itinerary.${index}.distanceKm`]}
              />

              <NumberField
                label="Walking"
                id={`day-${day.key}-hours`}
                suffix="hours"
                value={day.durationHours}
                onChange={(value) =>
                  onChange(updateRow(days, day.key, { durationHours: value }))
                }
                error={errors[`itinerary.${index}.durationHours`]}
              />
            </div>

            <FieldRow>
              <TextField
                label="Accommodation"
                id={`day-${day.key}-accommodation`}
                value={day.accommodation}
                onChange={(value) =>
                  onChange(updateRow(days, day.key, { accommodation: value }))
                }
                error={errors[`itinerary.${index}.accommodation`]}
                placeholder="Teahouse"
              />

              <TextField
                label="Meals"
                id={`day-${day.key}-meals`}
                value={day.meals}
                onChange={(value) =>
                  onChange(updateRow(days, day.key, { meals: value }))
                }
                error={errors[`itinerary.${index}.meals`]}
                placeholder="Breakfast, lunch, dinner"
              />
            </FieldRow>

            <FieldRow>
              <TextField
                label="Image"
                id={`day-${day.key}-image`}
                mono
                value={day.image}
                onChange={(value) =>
                  onChange(updateRow(days, day.key, { image: value }))
                }
                error={errors[`itinerary.${index}.image`]}
                hint="Cloudinary public ID. Upload on the Gallery tab and paste the reference."
              />

              <TextField
                label="Image alt text"
                id={`day-${day.key}-imageAlt`}
                /* Required exactly when there is an image to describe. */
                required={day.image.trim() !== ''}
                value={day.imageAlt}
                onChange={(value) =>
                  onChange(updateRow(days, day.key, { imageAlt: value }))
                }
                error={errors[`itinerary.${index}.imageAlt`]}
              />
            </FieldRow>
          </div>
        )}
      </RepeatableList>

      <AddRowButton onClick={addDay}>Add a day</AddRowButton>
    </div>
  );
}
