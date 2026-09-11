'use client';

import type { TripEditorValues } from '../../../types/tripEditor';
import { MONTHS, TRIP_DIFFICULTIES } from '../../../models/shared/tripVocab';
import {
  TextField,
  NumberField,
  SelectField,
  CheckboxField,
  CheckboxGroupField,
  FieldRow,
} from '../fields';

/**
 * The facts strip: what a visitor scans before reading anything.
 *
 * These feed the trip card, the filters on `/trips` and the answer block's
 * supporting data, so a blank here is a trip that quietly drops out of a filter
 * rather than one that looks incomplete.
 */
export default function TripFactsTab({
  values,
  errors,
  set,
}: {
  values: TripEditorValues;
  errors: Record<string, string>;
  set: <K extends keyof TripEditorValues>(
    key: K,
    value: TripEditorValues[K]
  ) => void;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <FieldRow>
        <NumberField
          label="Duration"
          id="durationDays"
          required
          suffix="days"
          value={values.durationDays}
          onChange={(value) => set('durationDays', value)}
          error={errors.durationDays}
        />

        <SelectField
          label="Difficulty"
          id="difficulty"
          value={values.difficulty}
          onChange={(value) => set('difficulty', value)}
          options={TRIP_DIFFICULTIES.map((grade) => ({
            value: grade,
            label: grade,
          }))}
          placeholder="Not graded"
          error={errors.difficulty}
          /*
           * Genuinely optional, and the hint says why rather than leaving an
           * editor to wonder whether they have missed something. "Moderate" is
           * meaningless for a city tour, and cards and filters already handle
           * its absence.
           */
          hint="Leave unset for trips where a grade means nothing — a city tour or a safari."
        />
      </FieldRow>

      <FieldRow>
        <TextField
          label="Trip grade"
          id="tripGrade"
          value={values.tripGrade}
          onChange={(value) => set('tripGrade', value)}
          error={errors.tripGrade}
          hint="Free-text editorial grade, separate from the difficulty list above."
        />

        <TextField
          label="Region"
          id="region"
          value={values.region}
          onChange={(value) => set('region', value)}
          error={errors.region}
          placeholder="Annapurna"
        />
      </FieldRow>

      <FieldRow>
        <NumberField
          label="Maximum altitude"
          id="maxAltitudeM"
          suffix="m"
          value={values.maxAltitudeM}
          onChange={(value) => set('maxAltitudeM', value)}
          error={errors.maxAltitudeM}
          hint="The trip's highest point. Separate from the per-day altitudes on the itinerary."
        />

        <TextField
          label="Peak name"
          id="peakName"
          value={values.peakName}
          onChange={(value) => set('peakName', value)}
          error={errors.peakName}
          hint="Peak-climbing trips only."
        />
      </FieldRow>

      {/*
        Not in the brief for this tab, and here because the model marks both
        `required: true`. Leaving them off the editor would mean a required
        field that can never be corrected through the admin — the save would
        fail with a message about a field that is nowhere on screen.
      */}
      <FieldRow>
        <TextField
          label="Start point"
          id="startPoint"
          required
          value={values.startPoint}
          onChange={(value) => set('startPoint', value)}
          error={errors.startPoint}
          placeholder="Kathmandu"
        />

        <TextField
          label="End point"
          id="endPoint"
          required
          value={values.endPoint}
          onChange={(value) => set('endPoint', value)}
          error={errors.endPoint}
          placeholder="Pokhara"
        />
      </FieldRow>

      <FieldRow>
        <NumberField
          label="Minimum group size"
          id="minGroupSize"
          required
          suffix="people"
          value={values.minGroupSize}
          onChange={(value) => set('minGroupSize', value)}
          error={errors.minGroupSize}
        />

        <NumberField
          label="Maximum group size"
          id="maxGroupSize"
          required
          suffix="people"
          value={values.maxGroupSize}
          onChange={(value) => set('maxGroupSize', value)}
          error={errors.maxGroupSize}
          hint="The cap shown as honest scarcity on the trip page."
        />
      </FieldRow>

      <CheckboxGroupField
        label="Best months"
        id="bestMonths"
        values={values.bestMonths}
        options={MONTHS}
        onChange={(months) =>
          set('bestMonths', months as TripEditorValues['bestMonths'])
        }
        error={errors.bestMonths}
        hint="Drives the season filter and the seasonal copy. Stored in calendar order however they are ticked."
      />

      <CheckboxField
        label="Has an elevation profile"
        id="hasElevationProfile"
        checked={values.hasElevationProfile}
        onChange={(checked) => set('hasElevationProfile', checked)}
        error={errors.hasElevationProfile}
        description={
          <>
            Draws the elevation graph at the top of the trip page and{' '}
            <strong>makes a per-day altitude required on every itinerary day</strong>.
            Turn it off for city tours and safaris. Turning it off never deletes
            altitudes already entered — they stay put and come back if you tick
            it again.
          </>
        }
      />
    </div>
  );
}
