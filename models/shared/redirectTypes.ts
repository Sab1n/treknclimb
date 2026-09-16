/**
 * HTTP redirect statuses the admin may choose.
 *
 * Split out of `models/Redirect.ts` per the client-boundary rule: the redirects
 * admin renders these as a select, and that is a Client Component. Importing
 * the constant from the model would pull in Mongoose, then the MongoDB driver,
 * then `net` and `tls`, and the build fails naming `tls` rather than anything
 * you wrote.
 *
 * 301 and 308 are permanent and pass ranking to the new URL; 302 and 307 are
 * temporary and do not. Within each pair the difference is whether the request
 * method is preserved on the redirect, which matters for form posts and never
 * for the links this table holds — so 301 is the default and the rest exist for
 * the rare case someone needs them.
 */
export const REDIRECT_TYPES = [301, 302, 307, 308] as const;

export type RedirectType = (typeof REDIRECT_TYPES)[number];
