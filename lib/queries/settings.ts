import { cache } from 'react';
import { connectDB } from '../db';
import SiteSettings, { ISiteSettings } from '../../models/SiteSettings';

/**
 * The SiteSettings singleton.
 *
 * Returns `null` if the record does not exist, and **almost every field on it
 * is optional even when it does** — the document is created empty by the seed
 * and filled in through the admin, so a half-completed settings record has to
 * be renderable. Every caller has to cope with a missing value rather than
 * printing a blank: the legal pages fall back to the contact form where an
 * email address would go, because a privacy policy that cannot tell you where
 * to write is broken.
 *
 * `cache()` memoises it for the duration of one server render. Next.js
 * deduplicates repeated `fetch()` calls on its own but has no idea what a
 * Mongoose query is, so without this a page whose metadata and body both need
 * the settings would make two round trips to Atlas.
 */
export const getSiteSettings = cache(async (): Promise<ISiteSettings | null> => {
  await connectDB();

  return SiteSettings.findOne({ key: 'site' }).lean<ISiteSettings>().exec();
});
