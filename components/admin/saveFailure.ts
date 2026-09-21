/**
 * What an admin editor says when a save comes back not-OK.
 *
 * ## Why this exists
 *
 * Every editor used to do `setFormError(result.error ?? 'Could not save.')`,
 * with `result` read by `response.json().catch(() => ({}))`. That is fine for
 * the failures the route handler *chooses* to return — they carry an `error`
 * string — and useless for the ones it does not. When a handler throws outside
 * its own `try`, Next answers with a bare 500 whose body is not JSON, `result`
 * is `{}`, and the admin sees "Could not save." with nothing to say whether
 * their data was wrong or the server was.
 *
 * That happened for real: after the seasons change a running dev server still
 * held the old Trip schema (see CLAUDE.md, "restart the dev server"), the trip
 * save route threw on `trip.departureSeasons.map`, and the editor showed a
 * sentence indistinguishable from a validation failure.
 *
 * ## Three kinds of failure
 *
 * - **validation** — the server returned `fieldErrors`. The fields say what is
 *   wrong; the message just introduces them.
 * - **server** — a 5xx, or a body that is not the JSON the route writes. The
 *   admin's input is not the problem, and the message says so.
 * - **rejected** — any other 4xx: a 409 on deleting a published trip, a
 *   malformed body. The route's own sentence is the useful one.
 *
 * No React and no fetch in here, so it is unit-tested directly.
 */

export type SaveFailureKind = 'validation' | 'server' | 'rejected';

export interface SaveFailure {
  kind: SaveFailureKind;
  message: string;
  fieldErrors: Record<string, string>;
}

/**
 * `unknown` in, checked shape out. The body came from `response.json()`, whose
 * return type is `any` — typing it as `unknown` forces the checks below rather
 * than trusting that the server sent what the happy path expects.
 */
function readBody(body: unknown): { error?: string; fieldErrors: Record<string, string> } {
  if (typeof body !== 'object' || body === null) return { fieldErrors: {} };

  const record = body as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};

  if (typeof record.fieldErrors === 'object' && record.fieldErrors !== null) {
    for (const [field, message] of Object.entries(record.fieldErrors)) {
      if (typeof message === 'string') fieldErrors[field] = message;
    }
  }

  return {
    error: typeof record.error === 'string' ? record.error : undefined,
    fieldErrors,
  };
}

export function describeSaveFailure(status: number, body: unknown): SaveFailure {
  const { error, fieldErrors } = readBody(body);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      kind: 'validation',
      message: error ?? 'Some fields need checking.',
      fieldErrors,
    };
  }

  /*
   * A 4xx with a message the route wrote on purpose. A 4xx with *no* message
   * is not one of those — it means something between the browser and the
   * handler answered — so it falls through to the server wording.
   */
  if (status < 500 && error) {
    return { kind: 'rejected', message: error, fieldErrors };
  }

  /*
   * `process.env.NODE_ENV` is replaced with a literal at build time, so the
   * hint is compiled out of the production bundle rather than hidden at
   * runtime. It names the cause that produced this bug in the first place.
   */
  const devHint =
    process.env.NODE_ENV === 'development'
      ? ' In development, a model changed without restarting the dev server is the usual cause.'
      : '';

  return {
    kind: 'server',
    message: `Server error (HTTP ${status}) — nothing was saved. This is not a problem with what you entered; try again, and if it keeps happening the server log has the cause.${devHint}`,
    fieldErrors,
  };
}
