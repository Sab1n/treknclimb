import { getAffiliations } from '../../lib/queries/affiliations';

/**
 * The licensing bodies, as a compact row.
 *
 * An async Server Component that fetches its own data. There is no prop
 * drilling and no client fetch — it runs on the server during static
 * generation and its result is part of the HTML.
 *
 * `variant` covers the two placements this page needs: a light strip in the
 * body and a dark one in the footer. The expanded About-page treatment with
 * registration numbers is a separate component when that page exists.
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

      <ul className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        {affiliations.map((affiliation) => (
          <li key={String(affiliation._id)}>
            <a
              href={affiliation.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`group flex items-baseline gap-2 text-sm underline-offset-4 hover:underline ${
                isDark ? 'text-paper/80 hover:text-paper' : 'text-ink'
              }`}
            >
              <span className="font-mono text-xs font-semibold">
                {affiliation.abbreviation}
              </span>
              <span className={isDark ? 'text-paper/60' : 'text-muted'}>
                {affiliation.name}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
