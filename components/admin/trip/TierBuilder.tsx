'use client';

import { useMemo } from 'react';

import type { TierRow } from '../../../types/tripEditor';
import { newRowKey } from '../../../types/tripEditor';
import { RepeatableList, AddRowButton, updateRow } from './RepeatableList';
import { TextField, NumberField } from '../fields';

/**
 * The group-pricing tier builder.
 *
 * Tiers are per-person prices by group size — one person pays more than six,
 * because the guide and the permits are the same either way. They show on the
 * trip page only; cards and structured data use the flat price.
 *
 * ## Overlap is checked here and on the server and on the model
 *
 * Three layers, which sounds excessive until you see what each one is for.
 *
 * The **model** has a path validator on `groupPricing` — that is the guarantee,
 * and it holds no matter what writes to the collection, including a migration
 * script.
 *
 * The **Zod schema** repeats the rule so the failure arrives keyed to a row
 * (`groupPricing.2.minPeople`) rather than as one message about the whole
 * array, which an admin with twelve tiers would have to resolve by eye.
 *
 * This component repeats it **a third time, live**, because the first two only
 * speak when the admin presses Save. A tier table is built by typing numbers
 * into adjacent rows, and every intermediate state is briefly invalid — the
 * useful moment to say "these two overlap" is while the second row is being
 * typed, not after a round trip.
 *
 * ## Sorting is display-only
 *
 * The rows are shown in entry order and never reordered automatically. Sorting
 * them as the admin types would move the row under the cursor mid-keystroke.
 * The coverage summary below does the sorting instead, so the gaps are visible
 * without the inputs jumping.
 */

interface Coverage {
  /** Group sizes covered by more than one tier. */
  overlaps: { index: number; withRange: string }[];
  /** Group sizes covered by no tier at all, within the trip's own range. */
  gaps: string[];
  /** Rows where min > max. */
  inverted: number[];
  lowestPrice: number | null;
}

/**
 * Works out what the current tiers cover.
 *
 * Runs on every keystroke, over at most twenty rows, so it is written for
 * clarity rather than speed.
 *
 * Rows with a blank or non-numeric bound are skipped rather than treated as
 * zero: a half-typed row is not an error yet, and flagging it as one would mean
 * the table screams at the admin for as long as they are typing in it.
 */
function analyse(
  tiers: TierRow[],
  minGroupSize: number | null,
  maxGroupSize: number | null
): Coverage {
  const parsed = tiers
    .map((tier, index) => ({
      index,
      min: Number(tier.minPeople),
      max: Number(tier.maxPeople),
      price: Number(tier.pricePerPerson),
      complete:
        tier.minPeople.trim() !== '' &&
        tier.maxPeople.trim() !== '' &&
        Number.isFinite(Number(tier.minPeople)) &&
        Number.isFinite(Number(tier.maxPeople)),
    }))
    .filter((tier) => tier.complete);

  const inverted = parsed.filter((t) => t.min > t.max).map((t) => t.index);

  const ordered = [...parsed]
    .filter((t) => t.min <= t.max)
    .sort((a, b) => a.min - b.min);

  const overlaps: Coverage['overlaps'] = [];

  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1];
    const current = ordered[i];

    if (current.min <= previous.max) {
      overlaps.push({
        index: current.index,
        withRange: `${previous.min}–${previous.max}`,
      });
    }
  }

  /*
   * Gaps are only meaningful against the trip's own group-size range. A tier
   * table covering 1–8 on a trip that caps at 8 is complete; the same table on
   * a trip that caps at 12 leaves four group sizes with no price.
   */
  const gaps: string[] = [];

  if (
    ordered.length > 0 &&
    minGroupSize !== null &&
    maxGroupSize !== null &&
    Number.isFinite(minGroupSize) &&
    Number.isFinite(maxGroupSize)
  ) {
    let cursor = minGroupSize;

    for (const tier of ordered) {
      if (tier.min > cursor) {
        gaps.push(
          tier.min - cursor === 1
            ? `${cursor}`
            : `${cursor}–${tier.min - 1}`
        );
      }
      cursor = Math.max(cursor, tier.max + 1);
    }

    if (cursor <= maxGroupSize) {
      gaps.push(
        maxGroupSize - cursor === 0 ? `${cursor}` : `${cursor}–${maxGroupSize}`
      );
    }
  }

  const prices = parsed
    .map((t) => t.price)
    .filter((price) => Number.isFinite(price));

  return {
    overlaps,
    gaps,
    inverted,
    lowestPrice: prices.length > 0 ? Math.min(...prices) : null,
  };
}

export default function TierBuilder({
  tiers,
  onChange,
  errors,
  minGroupSize,
  maxGroupSize,
  price,
}: {
  tiers: TierRow[];
  onChange: (tiers: TierRow[]) => void;
  /** Server errors keyed `groupPricing.<index>.<field>`. */
  errors: Record<string, string>;
  minGroupSize: string;
  maxGroupSize: string;
  price: string;
}) {
  const coverage = useMemo(
    () =>
      analyse(
        tiers,
        minGroupSize.trim() === '' ? null : Number(minGroupSize),
        maxGroupSize.trim() === '' ? null : Number(maxGroupSize)
      ),
    [tiers, minGroupSize, maxGroupSize]
  );

  /*
   * `Number('')` is 0, so a blank price would compare as a real zero and fire
   * the reconciliation warning against a field nobody has filled in.
   */
  const flatPrice = price.trim() === '' ? null : Number(price);

  const mismatched =
    flatPrice !== null &&
    Number.isFinite(flatPrice) &&
    coverage.lowestPrice !== null &&
    flatPrice !== coverage.lowestPrice;

  function addTier() {
    /*
     * The new row starts where the last one ended. Tiers are almost always
     * contiguous, so pre-filling the boundary removes the arithmetic an admin
     * would otherwise do in their head — and it makes the common case one
     * field to type instead of three.
     */
    const last = tiers[tiers.length - 1];
    const nextMin =
      last && last.maxPeople.trim() !== '' && Number.isFinite(Number(last.maxPeople))
        ? String(Number(last.maxPeople) + 1)
        : '';

    onChange([
      ...tiers,
      {
        key: newRowKey('tier'),
        minPeople: nextMin,
        maxPeople: '',
        pricePerPerson: '',
        label: '',
      },
    ]);
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-base font-extrabold tracking-display">
          Group pricing tiers
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Per-person price by group size, shown on the trip page only. Cards,
          listings and structured data always use the flat price above.
        </p>
      </div>

      <RepeatableList
        rows={tiers}
        onChange={onChange}
        label="Group pricing tiers"
        rowLabel={(tier) =>
          tier.minPeople && tier.maxPeople
            ? `${tier.minPeople}–${tier.maxPeople} people`
            : 'New tier'
        }
        empty={
          <>
            No tiers. The flat price applies to every group size, which is a
            perfectly normal way to price a trip.
          </>
        }
      >
        {(tier, index) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField
              label="From"
              id={`tier-${tier.key}-min`}
              required
              suffix="people"
              value={tier.minPeople}
              onChange={(value) =>
                onChange(updateRow(tiers, tier.key, { minPeople: value }))
              }
              error={errors[`groupPricing.${index}.minPeople`]}
            />

            <NumberField
              label="To"
              id={`tier-${tier.key}-max`}
              required
              suffix="people"
              value={tier.maxPeople}
              onChange={(value) =>
                onChange(updateRow(tiers, tier.key, { maxPeople: value }))
              }
              error={errors[`groupPricing.${index}.maxPeople`]}
            />

            <NumberField
              label="Price each"
              id={`tier-${tier.key}-price`}
              required
              suffix="USD"
              value={tier.pricePerPerson}
              onChange={(value) =>
                onChange(updateRow(tiers, tier.key, { pricePerPerson: value }))
              }
              error={errors[`groupPricing.${index}.pricePerPerson`]}
            />

            <TextField
              label="What changes"
              id={`tier-${tier.key}-label`}
              value={tier.label}
              onChange={(value) =>
                onChange(updateRow(tiers, tier.key, { label: value }))
              }
              error={errors[`groupPricing.${index}.label`]}
              placeholder="Second guide added"
            />
          </div>
        )}
      </RepeatableList>

      <AddRowButton onClick={addTier}>Add a tier</AddRowButton>

      {/* ---------------- live checks ---------------- */}

      {coverage.inverted.length > 0 && (
        <Notice tone="error">
          {coverage.inverted.length === 1
            ? 'One tier has a smallest group size larger than its largest.'
            : `${coverage.inverted.length} tiers have a smallest group size larger than their largest.`}{' '}
          This will block the save.
        </Notice>
      )}

      {coverage.overlaps.length > 0 && (
        <Notice tone="error">
          {coverage.overlaps.map((overlap) => (
            <span key={overlap.index} className="block">
              Tier {overlap.index + 1} overlaps the tier covering{' '}
              {overlap.withRange} people.
            </span>
          ))}
          <span className="mt-1 block">
            A group size covered by two tiers has two prices, so the page cannot
            say which applies. This will block the save.
          </span>
        </Notice>
      )}

      {/*
        A gap is a warning, not an error. It is often deliberate — a trip may
        genuinely only quote tiers for the group sizes it runs — and the model
        has no rule against it.
      */}
      {coverage.gaps.length > 0 && coverage.overlaps.length === 0 && (
        <Notice tone="warning">
          No tier covers {coverage.gaps.join(', ')}{' '}
          {coverage.gaps.length === 1 ? 'person' : 'people'}. Groups of that size
          fall back to the flat price. Fine if that is intended.
        </Notice>
      )}

      {/*
        The flat-price reconciliation. A warning, never a save blocker — the
        table is legitimately mid-edit while it is being rebuilt, and a
        validator here would make that intermediate state unsavable. The model
        deliberately has no rule for it either.
      */}
      {mismatched && (
        <Notice tone="warning">
          <span className="font-semibold">
            The flat price does not match the lowest tier.
          </span>
          <span className="mt-1 block">
            Flat price is{' '}
            <span className="font-mono tabular">USD {flatPrice}</span>, the
            cheapest tier is{' '}
            <span className="font-mono tabular">USD {coverage.lowestPrice}</span>.
            The flat price is the &ldquo;from&rdquo; figure on cards and in
            structured data, so it should be the lowest per-person price anyone
            can actually pay — otherwise the site advertises a price that is not
            available.
          </span>
          <span className="mt-1 block">This will not stop you saving.</span>
        </Notice>
      )}

      {!mismatched &&
        coverage.lowestPrice !== null &&
        coverage.overlaps.length === 0 &&
        coverage.inverted.length === 0 && (
          <p className="text-sm text-confirmed">
            Tiers do not overlap, and the flat price matches the lowest tier.
          </p>
        )}

      {tiers.length >= 20 && (
        <p className="text-sm text-muted">
          Twenty tiers is the cap. Past a handful, the trip page table stops
          being readable — consider whether these are really separate prices.
        </p>
      )}
    </section>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: 'error' | 'warning';
  children: React.ReactNode;
}) {
  return (
    <p
      /*
       * `role="status"` rather than `alert` on both: these appear while the
       * admin is typing, and an assertive live region would interrupt a screen
       * reader mid-word on every keystroke.
       */
      role="status"
      className={`rounded border px-4 py-3 text-sm ${
        tone === 'error'
          ? 'border-error/30 bg-error/5 text-error'
          : 'border-marigold/40 bg-marigold/10'
      }`}
    >
      {children}
    </p>
  );
}
