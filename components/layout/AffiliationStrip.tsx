import CloudinaryImage from '../ui/CloudinaryImage';
import { getAffiliations } from '../../lib/queries/affiliations';

/**
 * The licensing bodies, as a compact row.
 *
 * An async Server Component that fetches its own data. There is no prop
 * drilling and no client fetch — it runs on the server during static
 * generation and its result is part of the HTML.
 *
 * `variant` covers the two placements this page needs: a light strip in the
 * body and a dark one in the footer.
 *
 * ## Logo and link, nothing else
 *
 * A licence body is recognised by its crest, not by its name set in the
 * site's own type — the whole reason this row is here is that a visitor who
 * knows what the NTB mark looks like can see it without reading anything. So
 * each entry is the logo, linked to the organisation's own website, and the
 * registration numbers live on the About page where there is room to read
 * them.
 *
 * **No logo files have been supplied yet**, so every record's `logo` is blank
 * and this falls back to the abbreviation as a typographic mark. That is a
 * designed state rather than a gap: uploading a logo in Settings replaces it
 * with no code change, and until then nothing renders a broken image.
 *
 * The link carries the full name as its accessible name, so the logo itself
 * is `alt=""` — with both, a screen reader reads the organisation twice.
 */
export default async function AffiliationStrip({
  variant = 'light',
}: {
  variant?: 'light' | 'dark';
}) {
  const affiliations = await getAffiliations();

  if (affiliations.length === 0) return null;

  const isDark = variant === 'dark';

  return (
    <div>
      <p
        className={`text-xs uppercase tracking-wide ${isDark ? 'text-paper/60' : 'text-muted'}`}
      >
        Government licensed operator
      </p>

      <ul className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-4">
        {affiliations.map((affiliation) => (
          <li key={String(affiliation._id)}>
            <a
              href={affiliation.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={affiliation.name}
              title={affiliation.name}
              className={`block transition-opacity hover:opacity-70 ${
                isDark ? 'text-paper/80' : 'text-ink'
              }`}
            >
              {affiliation.logo ? (
                <CloudinaryImage
                  src={affiliation.logo}
                  alt=""
                  width={160}
                  height={80}
                  className="h-10 w-auto object-contain"
                />
              ) : (
                <span className="font-mono text-xs font-semibold uppercase tracking-wide underline underline-offset-4">
                  {affiliation.abbreviation}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
