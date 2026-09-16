import Link from 'next/link';
import type { Metadata } from 'next';

import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import CloudinaryImage from '../../components/ui/CloudinaryImage';
import PostBody from '../../components/content/PostBody';

import { getSiteSettings } from '../../lib/queries/settings';
import { getAffiliations } from '../../lib/queries/affiliations';
import { getPublishedTeam } from '../../lib/queries/team';
import { getAllDestinations } from '../../lib/queries/destinations';
import { organizationJsonLd, jsonLdScript, SITE_URL } from '../../lib/jsonLd';

/**
 * The About page — the trust surface.
 *
 * ## What this page is actually for
 *
 * Someone abroad is about to send several thousand dollars to a company they
 * found through a search result, in a country they have not been to. Every
 * other page on this site sells a trip; this one answers "are these people
 * real". That makes it a page of **checkable claims** rather than a page of
 * prose: a registration number that can be looked up, membership bodies with
 * their own registers, named guides with named certifications, and a stated
 * practice on insurance, evacuation and porter welfare.
 *
 * It is also the E-E-A-T substance behind the blog. A post about altitude
 * sickness is worth more when the site can show who writes them and what they
 * are qualified in.
 *
 * ## Every section is conditional
 *
 * Nothing here is hardcoded, and **every block disappears when its record is
 * empty** rather than rendering a heading over nothing. That matters more here
 * than anywhere else on the site: a trust page with an empty "Who you will
 * meet" heading actively damages the thing it exists to build. The one
 * unconditional element is the closing CTA.
 *
 * The consequence is that this page is largely blank until the client fills
 * SiteSettings in — which is correct, and is why the placeholder seed exists
 * and is marked as loudly as it is.
 */
export const metadata: Metadata = {
  title: 'About us',
  description:
    'Who runs Trek & Climb Adventure, how we operate, and the licences and memberships behind it.',
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: 'About | Trek & Climb Adventure',
    description:
      'Who runs Trek & Climb Adventure, how we operate, and the licences and memberships behind it.',
    url: `${SITE_URL}/about`,
    type: 'website',
  },
};

/** ISR backstop. On-demand revalidation from the admin is the primary path. */
export const revalidate = 3600;

export default async function AboutPage() {
  const [settings, affiliations, team, destinations] = await Promise.all([
    getSiteSettings(),
    getAffiliations(),
    getPublishedTeam(),
    getAllDestinations(),
  ]);

  const commitments = [...(settings?.commitments ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
  const will = commitments.filter((entry) => entry.kind === 'will');
  const wont = commitments.filter((entry) => entry.kind === 'wont');

  const safety = [...(settings?.safetyPolicies ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  const stats = [...(settings?.headlineStats ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  const base = settings?.addressLocality
    ? `Run from ${settings.addressLocality}`
    : 'Run from Nepal';

  /*
   * The same Organization node the homepage emits, carrying `memberOf` and
   * `identifier`. Repeated here deliberately: this is the page whose content
   * *is* the organisation, so it is the strongest place for the entity to be
   * described. The shared `@id` means both nodes resolve to one entity rather
   * than reading as two companies.
   */
  const orgJsonLd = organizationJsonLd(
    settings,
    affiliations,
    destinations.map((destination) => destination.name)
  );

  return (
    <>
      <Header />

      <main className="flex-1">
        {/* ---------------- hero ---------------- */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
            <Breadcrumbs
              crumbs={[{ label: 'Home', href: '/' }, { label: 'About' }]}
            />

            <div className="mt-6 max-w-3xl">
              <h1 className="font-display text-4xl font-extrabold tracking-display sm:text-5xl lg:text-6xl">
                {base}
                {settings?.foundingYear ? ` since ${settings.foundingYear}` : ''}
              </h1>

              {settings?.shortDescription && (
                <p className="mt-4 max-w-prose text-base leading-relaxed text-paper/80 sm:text-lg">
                  {settings.shortDescription}
                </p>
              )}
            </div>

            {/*
              Headline stats. Seeded empty on purpose — "3,800+ trekkers" is
              exactly the invented social proof the design rules forbid — so
              this row simply does not appear until the client supplies real
              numbers.
            */}
            {stats.length > 0 && (
              <dl className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dd className="font-mono text-3xl font-semibold tabular">
                      {stat.value}
                    </dd>
                    <dt className="mt-1 text-sm text-paper/60">{stat.label}</dt>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>

        {/* ---------------- the story ---------------- */}
        {settings?.longDescription && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="max-w-3xl">
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  How this started
                </h2>

                {/*
                  Through the Markdown-subset parser, never
                  `dangerouslySetInnerHTML`. This is admin-authored rich text on
                  a statically generated public page — the exact shape of the
                  stored-XSS case CLAUDE.md rules out structurally.
                */}
                <div className="mt-4">
                  <PostBody body={settings.longDescription} />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ---------------- what we will and will not do ---------------- */}
        {commitments.length > 0 && (
          <section className="border-b border-hairline bg-white">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="max-w-3xl">
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  What we will and will not do
                </h2>
                <p className="mt-2 max-w-prose text-muted">
                  The second list matters more than the first. Anyone can say
                  what they do.
                </p>
              </div>

              <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-12">
                {will.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      What we do
                    </h3>
                    <ul className="mt-4 flex flex-col gap-5">
                      {will.map((entry) => (
                        <li
                          key={entry.title}
                          className="border-l-2 border-confirmed pl-4"
                        >
                          <h4 className="font-semibold">{entry.title}</h4>
                          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">
                            {entry.body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {wont.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      What we will not do
                    </h3>
                    <ul className="mt-4 flex flex-col gap-5">
                      {wont.map((entry) => (
                        <li
                          key={entry.title}
                          /*
                           * The error colour is used here as a system colour
                           * meaning "refusal", not as decoration. Marigold
                           * means CTA everywhere on this site and reusing it
                           * to mean something else is the one thing the
                           * palette rule forbids.
                           */
                          className="border-l-2 border-error pl-4"
                        >
                          <h4 className="font-semibold">{entry.title}</h4>
                          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">
                            {entry.body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ---------------- affiliations, expanded ---------------- */}
        {affiliations.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="max-w-3xl">
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Registered and recognised by
                </h2>
                <p className="mt-2 max-w-prose text-muted">
                  Each of these bodies keeps a public register. The numbers below
                  are ours to check.
                </p>
              </div>

              <ul className="mt-8 grid gap-6 sm:grid-cols-2">
                {affiliations.map((affiliation) => (
                  <li
                    key={String(affiliation._id)}
                    className="flex gap-4 rounded-lg border border-hairline bg-white p-5"
                  >
                    {affiliation.logo && (
                      <CloudinaryImage
                        src={affiliation.logo}
                        alt={affiliation.logoAlt}
                        width={96}
                        height={96}
                        className="size-14 shrink-0 object-contain"
                      />
                    )}

                    <div className="min-w-0">
                      <h3 className="font-semibold">
                        {/*
                          `rel="noopener"` and an explicit new tab: these are
                          off-site registers, and a visitor checking one should
                          not lose the page they were reading.
                        */}
                        <a
                          href={affiliation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-4 hover:text-muted"
                        >
                          {affiliation.name}
                        </a>
                      </h3>

                      <p className="mt-0.5 text-sm text-muted">
                        {affiliation.abbreviation}
                      </p>

                      {/*
                        The registration number is the entire point of the
                        expanded treatment — and it is omitted, not faked, until
                        the client supplies it. A placeholder licence number is
                        a lie of exactly the kind this page exists to disprove.
                      */}
                      {affiliation.registrationNumber ? (
                        <p className="mt-2 font-mono text-sm tabular">
                          {affiliation.registrationNumber}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted">
                          Registration number to be confirmed.
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {settings?.registrationNumber && (
                <p className="mt-6 max-w-prose text-sm text-muted">
                  Company registration{' '}
                  <span className="font-mono tabular text-ink">
                    {settings.registrationNumber}
                  </span>
                  {settings.legalName ? `, registered as ${settings.legalName}.` : '.'}
                </p>
              )}
            </div>
          </section>
        )}

        {/* ---------------- the team ---------------- */}
        {team.length > 0 && (
          <section className="border-b border-hairline bg-white">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="max-w-3xl">
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Who you will meet
                </h2>
                <p className="mt-2 max-w-prose text-muted">
                  The people who answer your inquiry and the people who walk with
                  you.
                </p>
              </div>

              <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {team.map((member) => (
                  <li key={String(member._id)}>
                    {member.photo ? (
                      <CloudinaryImage
                        src={member.photo}
                        alt={member.photoAlt ?? ''}
                        width={480}
                        height={480}
                        sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 90vw"
                        className="aspect-square w-full rounded-lg object-cover"
                      />
                    ) : (
                      /*
                        No photo is a normal state, not a broken one — a guide
                        can be added before a portrait exists. A neutral block
                        keeps the grid aligned without pretending to be an
                        image.
                      */
                      <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-hairline bg-paper text-sm text-muted">
                        No photo yet
                      </div>
                    )}

                    <h3 className="mt-4 font-display text-lg font-extrabold tracking-display">
                      {member.name}
                    </h3>
                    <p className="text-sm font-semibold text-muted">
                      {member.role}
                      {member.yearsExperience
                        ? ` · ${member.yearsExperience} years guiding`
                        : ''}
                    </p>

                    {member.bio && (
                      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
                        {member.bio}
                      </p>
                    )}

                    {/*
                      Credentials as separate chips rather than a sentence. Each
                      is an individual verifiable claim, and one that lapses is
                      removed rather than edited out of prose.
                    */}
                    {member.credentials.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {member.credentials.map((credential) => (
                          <li
                            key={credential}
                            className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-semibold"
                          >
                            {credential}
                          </li>
                        ))}
                      </ul>
                    )}

                    {member.languages.length > 0 && (
                      <p className="mt-2 text-xs text-muted">
                        Speaks {member.languages.join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------------- safety and responsibility ---------------- */}
        {safety.length > 0 && (
          <section className="border-b border-hairline">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="max-w-3xl">
                <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                  Safety and responsibility
                </h2>
                <p className="mt-2 max-w-prose text-muted">
                  What we carry, what we insure, and how the people carrying your
                  bags are treated.
                </p>
              </div>

              <ul className="mt-8 grid gap-6 lg:grid-cols-3">
                {safety.map((policy) => (
                  <li
                    key={policy.title}
                    className="rounded-lg border border-hairline bg-white p-6"
                  >
                    <h3 className="font-display text-lg font-extrabold tracking-display">
                      {policy.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {policy.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ---------------- closing CTA — the page's one marigold button ---- */}
        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="max-w-3xl">
              <h2 className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
                Come walk with us
              </h2>
              <p className="mt-3 max-w-prose text-paper/80">
                Send your dates and we will come back with a day-by-day plan and
                a final price.
              </p>

              {settings?.responseTimePromise && (
                <p className="mt-2 text-sm text-paper/60">
                  {settings.responseTimePromise}
                  {settings.contactPersonName
                    ? ` Usually ${settings.contactPersonName}.`
                    : ''}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/contact"
                  className="rounded-full bg-marigold px-6 py-3 font-semibold text-ink transition-opacity hover:opacity-90"
                >
                  Get my free itinerary
                </Link>

                <Link
                  href="/trips"
                  className="rounded-full px-6 py-3 font-semibold underline underline-offset-4 hover:text-paper/70"
                >
                  Browse trips
                </Link>
              </div>

              <p className="mt-3 text-sm text-paper/60">
                No payment now. Deposit only after you approve the plan.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <script
        type="application/ld+json"
        // Through `jsonLdScript`, which escapes `<` so admin-authored text
        // containing `</script>` cannot close this tag early.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(orgJsonLd) }}
      />
    </>
  );
}
