'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  RATE_SOURCES,
  ROUNDING_RULES,
  ROUNDING_RULE_LABELS,
  RATE_HINTS,
  type RoundingRule,
} from '../../models/shared/rateVocab';
import { formatDateTime } from '../../lib/adminTime';
import UnsavedChangesGuard from './UnsavedChangesGuard';

/**
 * The display-currency rate table.
 *
 * ## The direction of the rate is the whole risk on this screen
 *
 * `rate` is **units of this currency per one US dollar**. NPR is about 133, not
 * 0.0075. Inverting it is a single keystroke and the result looks entirely
 * plausible: a $1,300 trek priced at "NPR 9.74" reads as a formatting bug, and
 * a $1,300 trek priced at "NPR 172,900" reads as correct. Nothing downstream
 * would catch either.
 *
 * So the direction is stated in the column header, restated per row as a worked
 * example against a real price, and a rate far outside the expected band for a
 * known currency raises a warning. **A warning, not a validator** — an
 * unfamiliar currency can legitimately sit outside any band we would guess, and
 * refusing the save would be the wrong kind of certainty.
 *
 * ## Editing the whole table, saving once
 *
 * A grid the admin works across and then saves, rather than a save per row.
 * That matches how rates are actually updated — all of them, from one source,
 * on one day — and it means a partial failure cannot leave half the currencies
 * on new numbers and half on old, which is the state that produces a wrong
 * price rather than a stale one.
 */

export interface RateRow {
  id: string;
  currencyCode: string;
  rate: string;
  source: string;
  roundingRule: string;
  isActive: boolean;
  /** ISO string. Rate age, not document age — see the model. */
  lastUpdated: string;
}

/** A sample USD price, so the direction is visible rather than described. */
const SAMPLE_USD = 1300;

export default function RatesEditor({
  initialRows,
  staleAfterDays,
  staleCutoff,
}: {
  initialRows: RateRow[];
  staleAfterDays: number;
  /**
   * Epoch milliseconds before which a rate counts as stale.
   *
   * Passed in rather than computed here. `Date.now()` during render is an
   * impure call — the React Compiler rejects it, and it is right to: a value
   * that changes on every render cannot be memoised, and the server and the
   * client would disagree about "now" across a hydration boundary anyway. The
   * server already knows when the page was built, so it decides.
   */
  staleCutoff: number;
}) {
  const router = useRouter();

  const [rows, setRows] = useState(initialRows);
  const [baseline, setBaseline] = useState(initialRows);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState<{
    changed: string[];
    revalidated: string[];
  } | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(rows) !== JSON.stringify(baseline),
    [rows, baseline]
  );

  function update(id: string, patch: Partial<RateRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
    setResult(null);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    setErrors({});
    setResult(null);

    try {
      const response = await fetch('/api/admin/rates', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rates: rows.map((row) => ({
            id: row.id,
            rate: row.rate,
            source: row.source,
            roundingRule: row.roundingRule,
            isActive: row.isActive,
          })),
        }),
      });

      if (response.status === 404) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin/rates');
        return;
      }

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrors((body.fieldErrors ?? {}) as Record<string, string>);
        setFormError(body.error ?? 'Could not save the rates.');
        return;
      }

      setBaseline(rows);
      setResult({
        changed: (body.changed ?? []) as string[],
        revalidated: (body.revalidated ?? []) as string[],
      });
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Records that the active rates were checked, without changing a number.
   *
   * Deliberately **not** "fetch from the provider": there is no exchange rate
   * provider configured, so a button claiming to refresh from one would move
   * the timestamps, clear the warning, and leave the rates exactly as wrong as
   * they were. This is an assertion by a person — which is why it is labelled
   * as one.
   *
   * It goes to its own endpoint rather than riding on the save, because the
   * save only stamps `lastUpdated` when a number actually moved.
   */
  async function markChecked() {
    if (
      !window.confirm(
        'Record that you have checked these rates against a real source today? This changes no numbers — it only clears the staleness warning, so only do it if you have actually checked.'
      )
    ) {
      return;
    }

    setMarking(true);
    setFormError(null);
    setResult(null);

    try {
      const response = await fetch('/api/admin/rates/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });

      if (response.status === 404) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin/rates');
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setFormError(body.error ?? 'Could not update the timestamps.');
        return;
      }

      router.refresh();
    } catch {
      setFormError('Could not reach the server.');
    } finally {
      setMarking(false);
    }
  }

  const staleCount = rows.filter(
    (row) => row.isActive && new Date(row.lastUpdated).getTime() < staleCutoff
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesGuard
        when={dirty && !saving}
        message="The rate table has unsaved changes. Leave the page and they will be lost."
      />

      {/* ---- the staleness warning, where the rates are ---- */}
      {staleCount > 0 && (
        <p
          role="alert"
          className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
        >
          <strong className="font-semibold">
            {staleCount} active {staleCount === 1 ? 'rate has' : 'rates have'} not
            been updated in over {staleAfterDays} days.
          </strong>{' '}
          Converted prices are shown to visitors as indicative, but a rate this
          old can be far enough out to embarrass a quote. Check them against your
          bank and save.
        </p>
      )}

      {formError && (
        <p
          role="alert"
          className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
        >
          {formError}
        </p>
      )}

      {result && (
        <p
          role="status"
          className="rounded border border-confirmed/30 bg-confirmed/5 px-4 py-3 text-sm"
        >
          {result.changed.length > 0 ? (
            <>
              Saved <span className="font-mono">{result.changed.join(', ')}</span>
              . Rebuilt {result.revalidated.length}{' '}
              {result.revalidated.length === 1 ? 'page' : 'pages'} that show a
              price.
            </>
          ) : (
            <>Saved. Nothing changed.</>
          )}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
        <table className="w-full min-w-4xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-paper">
              <th scope="col" className="px-4 py-3 font-semibold">
                Currency
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Rate
                {/*
                  The direction, in the header rather than only in a hint.
                  This is the one number on the screen that is wrong in a way
                  nothing downstream can detect.
                */}
                <span className="block text-xs font-normal text-muted">
                  units per 1 USD
                </span>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                ${SAMPLE_USD.toLocaleString()} becomes
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Source
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Rounding
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Rate last updated
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Active
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-muted"
                >
                  No currencies are seeded. Run scripts/seed.ts — the currency
                  list is seeded rather than created here, because the codes are
                  ISO 4217 and not something to type by hand.
                </td>
              </tr>
            )}

            {rows.map((row, index) => {
              const numeric = Number(row.rate);
              const valid = Number.isFinite(numeric) && numeric > 0;
              const hint = RATE_HINTS[row.currencyCode];

              /*
               * The inverted-rate check. Only for currencies we have a band
               * for — an unknown code gets no warning rather than a guessed
               * one.
               */
              const suspicious =
                valid && hint && (numeric < hint.low || numeric > hint.high);

              const stale =
                row.isActive && new Date(row.lastUpdated).getTime() < staleCutoff;

              return (
                <tr
                  key={row.id}
                  className="border-b border-hairline align-top last:border-0"
                >
                  <td className="px-4 py-3 font-mono font-semibold">
                    {row.currencyCode}
                  </td>

                  <td className="px-4 py-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`${row.currencyCode} per 1 USD`}
                      value={row.rate}
                      onChange={(event) =>
                        update(row.id, { rate: event.target.value })
                      }
                      disabled={row.currencyCode === 'USD'}
                      aria-invalid={errors[`rates.${index}.rate`] ? true : undefined}
                      className={`w-28 rounded border bg-white px-3 py-2 font-mono tabular outline-none focus:border-ink disabled:bg-paper disabled:text-muted ${
                        errors[`rates.${index}.rate`] || suspicious
                          ? 'border-error'
                          : 'border-hairline'
                      }`}
                    />

                    {errors[`rates.${index}.rate`] && (
                      <p role="alert" className="mt-1 max-w-48 text-xs text-error">
                        {errors[`rates.${index}.rate`]}
                      </p>
                    )}

                    {/*
                      USD is the base and is stored as 1. Editable would mean an
                      admin could set the base currency to 1.1 and silently
                      rescale every price on the site.
                    */}
                    {row.currencyCode === 'USD' && (
                      <p className="mt-1 max-w-48 text-xs text-muted">
                        The base currency. Always 1.
                      </p>
                    )}

                    {suspicious && hint && (
                      <p role="alert" className="mt-1 max-w-48 text-xs text-error">
                        Expected roughly {hint.low}–{hint.high} per USD. Check
                        the direction — this field is {row.currencyCode} per
                        dollar, not dollars per {row.currencyCode}.
                      </p>
                    )}
                  </td>

                  {/*
                    The worked example. Describing the direction in words is
                    what everyone does and it still gets inverted; showing the
                    actual output against a realistic trip price is what makes
                    a wrong rate obvious at a glance.
                  */}
                  <td className="px-4 py-3 font-mono tabular text-muted">
                    {valid ? (
                      <>
                        {row.currencyCode}{' '}
                        {applyRounding(
                          SAMPLE_USD * numeric,
                          row.roundingRule as RoundingRule
                        ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <select
                      aria-label={`${row.currencyCode} rate source`}
                      value={row.source}
                      onChange={(event) =>
                        update(row.id, { source: event.target.value })
                      }
                      className="rounded border border-hairline bg-white px-2 py-2 text-sm outline-none focus:border-ink"
                    >
                      {RATE_SOURCES.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-4 py-3">
                    <select
                      aria-label={`${row.currencyCode} rounding rule`}
                      value={row.roundingRule}
                      onChange={(event) =>
                        update(row.id, { roundingRule: event.target.value })
                      }
                      className="rounded border border-hairline bg-white px-2 py-2 text-sm outline-none focus:border-ink"
                    >
                      {ROUNDING_RULES.map((rule) => (
                        <option key={rule} value={rule}>
                          {ROUNDING_RULE_LABELS[rule]}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular">
                    <span className={stale ? 'text-error' : 'text-muted'}>
                      {formatDateTime(new Date(row.lastUpdated))}
                    </span>
                    {stale && (
                      <span className="mt-0.5 block font-sans text-xs text-error">
                        Over {staleAfterDays} days old
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => update(row.id, { isActive: !row.isActive })}
                      aria-pressed={row.isActive}
                      disabled={row.currencyCode === 'USD'}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                        row.isActive
                          ? 'border-confirmed/30 bg-confirmed/10 text-confirmed'
                          : 'border-hairline bg-paper text-muted'
                      }`}
                    >
                      {row.isActive ? 'Active' : 'Off'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save rates'}
        </button>

        <button
          type="button"
          onClick={markChecked}
          disabled={marking || dirty}
          className="rounded-full border-2 border-ink px-5 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
          /*
            Disabled while the table is dirty: "I have checked these" has to
            mean the stored numbers, and pressing it with unsaved edits on
            screen would stamp rows that are about to change.
          */
          title={
            dirty
              ? 'Save or discard your edits first'
              : 'Record that you have checked the rates today'
          }
        >
          {marking ? 'Recording…' : 'I have checked these'}
        </button>

        {dirty && !saving && (
          <span className="text-sm font-semibold text-muted">
            Unsaved changes
          </span>
        )}
      </div>

      <p className="max-w-prose text-sm text-muted">
        Changing a rate stamps that row as refreshed today and rebuilds every
        page showing a price. Changing only the rounding or the active toggle
        does not — those are not a refresh, and treating them as one would
        silence the staleness warning for another week on a rate nobody checked.
      </p>
    </div>
  );
}

/**
 * The rounding rules, applied for the preview column only.
 *
 * A display-side concern, mirrored here so the example reflects what a visitor
 * would actually see. The authoritative implementation belongs with the
 * currency switcher when it is built; this exists so the admin can tell the
 * difference between `nearest-100` and `none` without publishing to find out.
 */
function applyRounding(value: number, rule: RoundingRule): number {
  switch (rule) {
    case 'nearest-1':
      return Math.round(value);
    case 'nearest-5':
      return Math.round(value / 5) * 5;
    case 'nearest-10':
      return Math.round(value / 10) * 10;
    case 'nearest-100':
      return Math.round(value / 100) * 100;
    default:
      return value;
  }
}
