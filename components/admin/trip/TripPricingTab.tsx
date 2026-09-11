'use client';

import type { TripEditorValues, TierRow } from '../../../types/tripEditor';
import TierBuilder from './TierBuilder';
import { TextField, NumberField, FieldRow } from '../fields';

/**
 * Pricing: the flat figures, then the group-tier builder.
 *
 * The flat price is the anchor — cards, listings and structured data all use
 * it, and nothing else. The tiers show on the trip page only, which is why they
 * can be richer without costing anything in a listing.
 */
export default function TripPricingTab({
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
      <p className="max-w-prose text-sm text-muted">
        Every price is stored in <strong>USD</strong> and never pre-converted.
        Visitors see other currencies converted in the browser from the exchange
        rates, marked indicative; structured data and the sitemap always emit
        this USD figure.
      </p>

      <FieldRow>
        <NumberField
          label="Price"
          id="price"
          required
          suffix="USD per person"
          value={values.price}
          onChange={(value) => set('price', value)}
          error={errors.price}
          hint="The anchor used on cards, listings and structured data."
        />

        <NumberField
          label="Discounted price"
          id="discountedPrice"
          suffix="USD per person"
          value={values.discountedPrice}
          onChange={(value) => set('discountedPrice', value)}
          error={errors.discountedPrice}
          hint="Leave blank when there is no discount."
        />
      </FieldRow>

      <TextField
        label="Price label"
        id="priceLabel"
        value={values.priceLabel}
        onChange={(value) => set('priceLabel', value)}
        error={errors.priceLabel}
        hint='Display override, e.g. "From USD 1,299 per person". Leave blank to use the price above.'
      />

      {/*
        The tier builder owns the overlap checks and the flat-price
        reconciliation, because both are functions of the tiers themselves —
        keeping them here would mean this tab re-deriving what that component
        already computes on every keystroke.
      */}
      <TierBuilder
        tiers={values.groupPricing}
        onChange={(tiers: TierRow[]) => set('groupPricing', tiers)}
        errors={errors}
        minGroupSize={values.minGroupSize}
        maxGroupSize={values.maxGroupSize}
        price={values.price}
      />
    </div>
  );
}
