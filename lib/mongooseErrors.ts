import type mongoose from 'mongoose';

/**
 * A Mongoose `ValidationError` as the `fieldErrors` the admin editors read.
 *
 * Keys are kept **exactly as Mongoose reports them**, nested paths and all:
 * `departureSeasons.0.exceptions.0.status`, not `departureSeasons`. The editor
 * opens the tab from the first segment and renders the message under the input
 * whose name is the whole path, so flattening here would leave the tab badge
 * lit and the field unmarked.
 *
 * `import type` because nothing at runtime is needed from Mongoose — only the
 * shape of the error. The caller has already done the `instanceof` check.
 */
export function mongooseFieldErrors(
  error: mongoose.Error.ValidationError
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const [path, detail] of Object.entries(error.errors)) {
    fieldErrors[path] = detail.message;
  }

  return fieldErrors;
}
