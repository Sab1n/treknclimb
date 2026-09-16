'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { RedirectRow, NotFoundRow } from '../../lib/queries/adminRedirects';
/*
 * A type-only import from a module that pulls in Mongoose. Safe, and worth
 * being explicit about: `import type` is erased at compile time, so nothing of
 * `lib/redirects` reaches the bundle. A value import of the same module would
 * drag the MongoDB driver in behind it and fail the build naming `tls`.
 *
 * It is imported rather than restated so the panel below cannot describe an
 * outcome the resolver no longer produces.
 */
import type { RedirectDiagnosis } from '../../lib/redirects';
import { REDIRECT_TYPES } from '../../models/shared/redirectTypes';
import { formatDateTime } from '../../lib/adminTime';
import { TextField, SelectField, CheckboxField, FieldRow } from './fields';

/** What `POST /api/admin/redirects/test` returns. */
interface TestResult {
  path: string;
  resolver: RedirectDiagnosis;
  sourceIsLive: boolean;
  targetIsLive: boolean | null;
  live: {
    hops: { path: string; status: number; location: string | null }[];
    finalPath: string;
    finalStatus: number;
    offSite: string | null;
    truncated: boolean;
  };
}

/**
 * The migration console: the redirect map, and the 404s nobody has mapped yet.
 *
 * One screen rather than two, because the workflow moves rows from the second
 * list to the first. Splitting them would mean copying a path between tabs,
 * which is where typos come from — so "Map this" on a 404 row opens the add
 * form with the path already filled in.
 *
 * ## Everything is edited in place
 *
 * A redirect is two paths and a status. A detail page per row would be four
 * fields behind a navigation, and the common operation — reading which ones are
 * being hit and toggling one off — happens in the list.
 */
export default function RedirectsManager({
  redirects,
  notFounds,
  ignoredCount,
}: {
  redirects: RedirectRow[];
  notFounds: NotFoundRow[];
  ignoredCount: number;
}) {
  const router = useRouter();

  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [prefill, setPrefill] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  /*
   * One result at a time, keyed by the path tested. A panel per row would mean
   * a screen of stale answers after five tests, and the question being asked is
   * always about the row just clicked.
   */
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testPath, setTestPath] = useState('');

  async function runTest(path: string) {
    setTesting(path);
    setTestError(null);
    setTestResult(null);

    try {
      const response = await fetch('/api/admin/redirects/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      if (response.status === 404) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin/redirects');
        return;
      }

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setTestError(result.error ?? 'Could not test that path.');
        return;
      }

      setTestResult(result as TestResult);
    } catch {
      setTestError('Could not reach the server.');
    } finally {
      setTesting(null);
    }
  }

  async function toggleActive(row: RedirectRow) {
    setBusy(row.id);

    try {
      await fetch(`/api/admin/redirects/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !row.isActive }),
      });

      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: RedirectRow) {
    if (
      !window.confirm(
        `Delete the redirect from ${row.oldUrl}? That path will start returning 404 again.`
      )
    ) {
      return;
    }

    setBusy(row.id);

    try {
      await fetch(`/api/admin/redirects/${row.id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function setIgnored(row: NotFoundRow, ignored: boolean) {
    setBusy(row.id);

    try {
      await fetch(`/api/admin/not-found-log/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ignored }),
      });

      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const active = redirects.filter((row) => row.isActive).length;
  const withWarnings = redirects.filter((row) => row.warnings.length > 0).length;
  const totalHits = redirects.reduce((sum, row) => sum + row.hitCount, 0);

  return (
    <div className="flex flex-col gap-10">
      {formError && (
        <p
          role="alert"
          className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
        >
          {formError}
        </p>
      )}

      {/* ---------------- redirects ---------------- */}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-display">
              Redirects
            </h2>
            <p className="mt-1 text-sm text-muted">
              {redirects.length} rows, {active} active,{' '}
              <span className="font-mono tabular">{totalHits}</span> hits in
              total.
              {withWarnings > 0 && (
                <>
                  {' '}
                  <span className="font-semibold text-error">
                    {withWarnings} need attention.
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/*
              Testing an arbitrary path, not only a row that exists. This is the
              cutover check: paste an old URL from the crawl and find out what
              the live site does with it, before anyone else does.
            */}
            <input
              type="text"
              value={testPath}
              onChange={(event) => setTestPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && testPath.trim() !== '') {
                  runTest(testPath.trim());
                }
              }}
              aria-label="Test any path"
              placeholder="/any-old-path"
              className="w-52 rounded border border-hairline bg-white px-3 py-2 font-mono text-xs outline-none focus:border-ink"
            />

            <button
              type="button"
              onClick={() => runTest(testPath.trim())}
              disabled={testing !== null || testPath.trim() === ''}
              className="rounded-full border-2 border-hairline px-4 py-2 text-sm font-semibold transition-colors hover:border-ink disabled:opacity-40"
            >
              {testing === testPath.trim() ? 'Testing…' : 'Test'}
            </button>

            <button
              type="button"
              onClick={() => {
                setPrefill('');
                setAdding(true);
                setEditing(null);
              }}
              className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
            >
              Add a redirect
            </button>
          </div>
        </div>

        {testError && (
          <p
            role="alert"
            className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
          >
            {testError}
          </p>
        )}

        {/*
          A result for a path with no row of its own — the free-form box, or a
          row that has since been deleted — has nowhere in the table to live.
        */}
        {testResult &&
          !redirects.some((row) => row.oldUrl === testResult.path) && (
            <TestReport result={testResult} />
          )}

        {adding && (
          <RedirectForm
            initialOldUrl={prefill}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              router.refresh();
            }}
            onError={setFormError}
          />
        )}

        <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
          <table className="w-full min-w-3xl border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hairline bg-paper">
                <th scope="col" className="px-4 py-3 font-semibold">From</th>
                <th scope="col" className="px-4 py-3 font-semibold">To</th>
                <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Hits</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last hit</th>
                <th scope="col" className="px-4 py-3 font-semibold">Active</th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>

            <tbody>
              {redirects.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                    No redirects yet. The WordPress migration map goes here — and
                    renaming a trip, activity or destination writes one
                    automatically.
                  </td>
                </tr>
              )}

              {redirects.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-hairline last:border-0 align-top"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs break-all">{row.oldUrl}</span>

                    {row.warnings.map((warning) => (
                      <span
                        key={warning}
                        className="mt-1 block max-w-xs text-xs text-error"
                      >
                        {warning}
                      </span>
                    ))}
                  </td>

                  <td className="px-4 py-3 font-mono text-xs break-all">
                    {row.newUrl}
                  </td>

                  <td className="px-4 py-3 font-mono text-xs tabular">
                    {row.type}
                    {/*
                      The stored intent and what actually goes on the wire are
                      not the same number, and someone reading this column
                      deserves to know before they check with curl.
                    */}
                    <span className="block text-muted">
                      sends {row.type === 301 || row.type === 308 ? '308' : '307'}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {row.hitCount}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular text-muted">
                    {row.lastHitAt ? formatDateTime(new Date(row.lastHitAt)) : '—'}
                  </td>

                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleActive(row)}
                      disabled={busy === row.id}
                      aria-pressed={row.isActive}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                        row.isActive
                          ? 'border-confirmed/30 bg-confirmed/10 text-confirmed'
                          : 'border-hairline bg-paper text-muted'
                      }`}
                    >
                      {row.isActive ? 'Active' : 'Off'}
                    </button>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => runTest(row.oldUrl)}
                      disabled={testing !== null}
                      className="text-xs font-semibold underline underline-offset-4 disabled:opacity-50"
                    >
                      {testing === row.oldUrl ? 'Testing…' : 'Test'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditing(editing === row.id ? null : row.id);
                        setAdding(false);
                      }}
                      className="ml-3 text-xs underline underline-offset-4"
                    >
                      {editing === row.id ? 'Close' : 'Edit'}
                    </button>

                    <button
                      type="button"
                      onClick={() => remove(row)}
                      disabled={busy === row.id}
                      className="ml-3 text-xs text-error underline underline-offset-4 disabled:opacity-50"
                    >
                      Delete
                    </button>

                    {testResult?.path === row.oldUrl && (
                      <div className="mt-3 text-left">
                        <TestReport result={testResult} />
                      </div>
                    )}

                    {editing === row.id && (
                      <div className="mt-3 text-left">
                        <RedirectForm
                          id={row.id}
                          initialOldUrl={row.oldUrl}
                          initialNewUrl={row.newUrl}
                          initialType={String(row.type)}
                          initialActive={row.isActive}
                          onCancel={() => setEditing(null)}
                          onSaved={() => {
                            setEditing(null);
                            router.refresh();
                          }}
                          onError={setFormError}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- unmapped 404s ---------------- */}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg font-extrabold tracking-display">
            Unmapped 404s
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Paths that were requested, found nothing, and had no redirect. Most
            asked-for first — a URL requested two hundred times is a live inbound
            link somewhere, and one requested once is probably a typo.
          </p>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Scanner noise — <code className="font-mono">/wp-admin</code>,{' '}
            <code className="font-mono">/.env</code> and the rest — is filtered
            out before it reaches this list, and every row drops off 30 days
            after it was last requested.
            {ignoredCount > 0 && ` ${ignoredCount} dismissed and hidden.`}
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-hairline bg-white">
          <table className="w-full min-w-3xl border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hairline bg-paper">
                <th scope="col" className="px-4 py-3 font-semibold">Path</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Hits</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last seen</th>
                <th scope="col" className="px-4 py-3 font-semibold">Came from</th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>

            <tbody>
              {notFounds.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                    Nothing unmapped. Either everything resolves, or nothing has
                    404&rsquo;d in the last 30 days — the log self-purges, so an empty
                    list is not proof the site was never asked for a dead URL.
                  </td>
                </tr>
              )}

              {notFounds.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-hairline last:border-0 hover:bg-paper/60"
                >
                  <td className="px-4 py-3 font-mono text-xs break-all">
                    {row.path}
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular">
                    {row.hits}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular text-muted">
                    {formatDateTime(new Date(row.lastSeenAt))}
                  </td>

                  <td className="px-4 py-3 text-xs break-all text-muted">
                    {/*
                      Plain text, never a link. This is the `referer` header —
                      a string the requester fully controls — and turning it
                      into a clickable anchor on an admin screen is how a log
                      viewer becomes a phishing delivery mechanism.
                    */}
                    {row.referer ?? '—'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setPrefill(row.path);
                        setAdding(true);
                        setEditing(null);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="text-xs font-semibold underline underline-offset-4"
                    >
                      Map this
                    </button>

                    {/* After mapping, the obvious next question is whether it
                        worked — and this is where the answer is looked for. */}
                    <button
                      type="button"
                      onClick={() => runTest(row.path)}
                      disabled={testing !== null}
                      className="ml-3 text-xs underline underline-offset-4 disabled:opacity-50"
                    >
                      {testing === row.path ? 'Testing…' : 'Test'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIgnored(row, !row.ignored)}
                      disabled={busy === row.id}
                      className="ml-3 text-xs text-muted underline underline-offset-4 disabled:opacity-50"
                    >
                      {row.ignored ? 'Restore' : 'Ignore'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/**
 * What a test found: what the map says, and what the site is actually doing.
 *
 * The two are reported separately because they answer different questions and
 * because they can legitimately disagree. When they do, the disagreement *is*
 * the finding — a correct redirect sitting behind a cached 404 and a redirect
 * pointing at the wrong page both look like "still 404" from a browser, and
 * one needs an edit while the other needs an hour.
 */
function TestReport({ result }: { result: TestResult }) {
  const { resolver, live } = result;

  const first = live.hops[0];
  const redirected =
    first !== undefined && first.status >= 300 && first.status < 400;

  const arrived =
    resolver.outcome === 'resolved' &&
    redirected &&
    live.finalStatus >= 200 &&
    live.finalStatus < 300;

  const cached404 = resolver.outcome === 'resolved' && !redirected;

  return (
    <div className="rounded-lg border border-hairline bg-paper p-4">
      <p className="font-mono text-xs break-all">
        <span className="text-muted">Tested</span> {result.path}
      </p>

      {/* ---- the verdict, first and in one sentence ---- */}

      <p
        className={`mt-2 text-sm font-semibold ${
          arrived
            ? 'text-confirmed'
            : cached404 || resolver.outcome === 'cycle'
              ? 'text-error'
              : ''
        }`}
      >
        {arrived && (
          <>
            Working. A visitor is sent to{' '}
            <code className="font-mono">{live.finalPath}</code> and gets it.
          </>
        )}

        {cached404 && (
          <>
            The map is right, but the site is still serving the old response.
          </>
        )}

        {resolver.outcome === 'resolved' && redirected && !arrived && (
          <>
            The redirect fires, but{' '}
            <code className="font-mono">{live.finalPath}</code> answers{' '}
            {live.finalStatus}. Visitors are being sent from one dead end to
            another.
          </>
        )}

        {resolver.outcome === 'cycle' && (
          <>This path loops, so nothing is served. Visitors get a 404.</>
        )}

        {resolver.outcome === 'junk' && (
          <>
            Filtered as scanner noise before any lookup — this path is never
            checked against the map at all.
          </>
        )}

        {resolver.outcome === 'no-row' &&
          (live.finalStatus >= 200 && live.finalStatus < 300 ? (
            <>No redirect, and none needed — this is a live page.</>
          ) : (
            <>
              No active redirect matches, so this path 404s.
            </>
          ))}
      </p>

      {/* ---- the two halves ---- */}

      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded border border-hairline bg-white p-3">
          <dt className="font-semibold">The map says</dt>
          <dd className="mt-1 text-muted">
            {resolver.outcome === 'resolved' && (
              <>
                <span className="font-mono break-all">
                  {resolver.trail.join(' → ')}
                </span>
                <span className="mt-1 block">
                  {resolver.hops === 1
                    ? 'One hop.'
                    : `${resolver.hops} rows, collapsed into one hop.`}{' '}
                  Recorded as {resolver.type}, sent as{' '}
                  {resolver.type === 301 || resolver.type === 308 ? 308 : 307}.
                  {resolver.stoppedAtLivePage && (
                    <>
                      {' '}
                      The chain stopped here because the next hop is a live
                      page.
                    </>
                  )}
                </span>
              </>
            )}

            {resolver.outcome === 'no-row' && 'No active row has this source.'}

            {resolver.outcome === 'junk' &&
              'Nothing — the path matches the scanner filter.'}

            {resolver.outcome === 'cycle' && (
              <span className="font-mono break-all">
                {resolver.trail.join(' → ')}
              </span>
            )}
          </dd>
        </div>

        <div className="rounded border border-hairline bg-white p-3">
          <dt className="font-semibold">The site does</dt>
          <dd className="mt-1 text-muted">
            <ol className="flex flex-col gap-0.5">
              {live.hops.map((hop, index) => (
                <li key={`${hop.path}-${index}`} className="font-mono break-all">
                  {hop.status} <span className="text-ink">{hop.path}</span>
                  {hop.location && <> → {hop.location}</>}
                </li>
              ))}
            </ol>

            {live.offSite && (
              <span className="mt-1 block">
                Leaves the site at{' '}
                <span className="font-mono break-all">{live.offSite}</span>.
              </span>
            )}

            {live.truncated && (
              <span className="mt-1 block text-error">
                Still redirecting after {live.hops.length} hops — stopped
                following.
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* ---- the notes that turn a result into an action ---- */}

      {cached404 && (
        <p className="mt-3 max-w-prose text-xs text-muted">
          This path had already returned a 404 before the redirect was written,
          and Next is still serving that cached 404. It clears itself within an
          hour — nothing here needs changing, and testing again after that will
          show the redirect. A path nobody has requested yet never has this
          problem.
        </p>
      )}

      {result.sourceIsLive && (
        <p className="mt-3 max-w-prose text-xs text-error">
          The source is a live page, so this row can never fire — redirects are
          only consulted after a path 404s. Delete it, or move the page.
        </p>
      )}

      {result.targetIsLive === false && resolver.outcome === 'resolved' && (
        <p className="mt-3 max-w-prose text-xs text-error">
          The target does not resolve to a page. Point it somewhere real — a
          redirect to a 404 tells a search engine the content moved there.
        </p>
      )}

      <p className="mt-3 text-xs text-muted">
        Testing does not count as a hit — the counters are put back afterwards.
      </p>
    </div>
  );
}

/** The add/edit form. Used inline in both places. */
function RedirectForm({
  id,
  initialOldUrl = '',
  initialNewUrl = '',
  initialType = '301',
  initialActive = true,
  onCancel,
  onSaved,
  onError,
}: {
  id?: string;
  initialOldUrl?: string;
  initialNewUrl?: string;
  initialType?: string;
  initialActive?: boolean;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [oldUrl, setOldUrl] = useState(initialOldUrl);
  const [newUrl, setNewUrl] = useState(initialNewUrl);
  const [type, setType] = useState(initialType);
  const [isActive, setIsActive] = useState(initialActive);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErrors({});
    onError(null);

    try {
      const response = await fetch(
        id ? `/api/admin/redirects/${id}` : '/api/admin/redirects',
        {
          method: id ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ oldUrl, newUrl, type, isActive }),
        }
      );

      if (response.status === 404) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin/redirects');
        return;
      }

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrors((result.fieldErrors ?? {}) as Record<string, string>);
        onError(result.error ?? 'Could not save the redirect.');
        return;
      }

      onSaved();
    } catch {
      onError('Could not reach the server. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-hairline bg-white p-5">
      <div className="flex max-w-2xl flex-col gap-4">
        <FieldRow>
          <TextField
            label="From"
            id={`${id ?? 'new'}-oldUrl`}
            required
            mono
            value={oldUrl}
            onChange={setOldUrl}
            error={errors.oldUrl}
            placeholder="/trekking/everest-base-camp"
            hint="A path, not a full URL. Drop the https://treknclimb.com part."
          />

          <TextField
            label="To"
            id={`${id ?? 'new'}-newUrl`}
            required
            mono
            value={newUrl}
            onChange={setNewUrl}
            error={errors.newUrl}
            placeholder="/nepal/trekking/everest-base-camp-trek"
          />
        </FieldRow>

        <FieldRow>
          <SelectField
            label="Type"
            id={`${id ?? 'new'}-type`}
            required
            value={type}
            onChange={setType}
            options={REDIRECT_TYPES.map((value) => ({
              value: String(value),
              label:
                value === 301
                  ? '301 — permanent (the usual choice)'
                  : value === 302
                    ? '302 — temporary'
                    : value === 307
                      ? '307 — temporary, method preserved'
                      : '308 — permanent, method preserved',
            }))}
            error={errors.type}
            hint="301 for a page that has moved for good. Permanent redirects pass ranking to the new URL; temporary ones do not."
          />

          <div className="self-end">
            <CheckboxField
              label="Active"
              id={`${id ?? 'new'}-active`}
              checked={isActive}
              onChange={setIsActive}
              description="Inactive redirects are invisible — the path 404s as if the row did not exist."
            />
          </div>
        </FieldRow>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : id ? 'Save changes' : 'Add redirect'}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="text-sm underline underline-offset-4"
          >
            Cancel
          </button>
        </div>

        {/*
          The one piece of behaviour an admin would otherwise report as a bug.
          A path that has already served a 404 keeps serving it from the cache
          until the page's revalidate window expires; a path nobody has
          requested yet redirects immediately.
        */}
        <p className="text-xs text-muted">
          If this path has already returned a 404 to someone, the redirect can
          take up to an hour to take effect — the 404 is cached by the page that
          served it. A path nobody has requested yet redirects straight away.
        </p>
      </div>
    </div>
  );
}
