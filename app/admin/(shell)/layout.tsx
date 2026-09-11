import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import AdminSidebar from '../../../components/admin/AdminSidebar';
import AdminBreadcrumbs from '../../../components/admin/AdminBreadcrumbs';
import AdminSignOut from '../../../components/forms/AdminSignOut';
import { getAdminSession } from '../../../lib/adminAuth';

/**
 * The admin shell — sidebar, top bar, breadcrumbs.
 *
 * ## Why this is a route group and not `app/admin/layout.tsx`
 *
 * `/admin/login` lives under `/admin` too, and it must not have this chrome
 * around it: a sidebar full of links a signed-out visitor cannot follow, above
 * a "Sign out" button, on a page whose whole job is to sign you *in*. A layout
 * at `app/admin/layout.tsx` would wrap it, with no way to opt out.
 *
 * `(shell)` in parentheses is a **route group**: it organises files without
 * appearing in the URL. `app/admin/(shell)/inquiries/page.tsx` still serves
 * `/admin/inquiries`. The login page sits outside the group and gets no layout
 * but the root one. Nothing about the URLs, the middleware matcher or the
 * `?next=` redirects changes.
 *
 * ## This layout is not the guard
 *
 * It checks the session, and every page inside it checks again. That is not
 * belt-and-braces for its own sake — **a layout genuinely cannot protect its
 * pages in the App Router.** Layouts and pages render in parallel, so a page's
 * database reads have already started before this function reaches its
 * redirect; and a layout does not re-render on client-side navigation between
 * pages inside it, so on the second and third screen this code does not run at
 * all. Its session check exists to render the admin's name in the top bar and
 * to catch a direct load. Authorisation is per page, every time.
 *
 * Three gates, each covering the previous one's blind spot: the middleware
 * turns away forged and expired tokens before a request costs a database read,
 * this renders nothing without a session, and the page checks revocation.
 */
export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Admin' },
  /*
   * Noindex on the whole subtree. `robots.txt` disallows /admin/ as well, and
   * the two do different jobs: robots.txt asks a crawler not to fetch, this
   * tells one that fetched anyway — from a link, a leaked URL, a browser
   * extension — not to index what it found. Neither is a substitute for the
   * login, which is the actual control.
   */
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Never statically generated, never cached.
 *
 * Set on the layout, where it applies to every segment underneath, so a new
 * admin page cannot be added without it. An admin screen rendered at build time
 * would be a snapshot of the database baked into the deployment; one cached at
 * the edge would be one admin's data served to the next request.
 */
export const dynamic = 'force-dynamic';

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  if (!session) redirect('/admin/login');

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/*
        Ink, per the 60-30-10 split: the sidebar is chrome framing the work, and
        the work itself — tables, forms, long lists of inquiries — stays on
        paper where it is readable for as long as staff have to look at it.
      */}
      {/*
        On a phone this collapses to a brand line and a one-line disclosure
        button — see `AdminSidebar`. Stacking the full nav above the content
        would push the inquiry list, the screen used daily, behind fifteen
        items. `py-3 lg:py-6` keeps the collapsed bar shallow without making
        the desktop rail cramped.
      */}
      <aside className="shrink-0 bg-ink px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:overflow-y-auto lg:py-6">
        <div className="flex items-baseline gap-2 px-3 lg:block">
          <Link
            href="/admin"
            className="font-display text-lg font-extrabold tracking-display text-paper"
          >
            Trek &amp; Climb
          </Link>
          <p className="text-xs text-paper/40 lg:mb-6">Admin</p>
        </div>

        <AdminSidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline bg-white px-4 py-3 sm:px-6 lg:px-8">
          <AdminBreadcrumbs />

          <div className="flex items-center gap-4">
            <p className="text-sm">
              <span className="font-semibold">{session.name}</span>
              <span className="ml-2 hidden text-muted sm:inline">
                {session.email}
              </span>
            </p>

            <AdminSignOut />
          </div>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
