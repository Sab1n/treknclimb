import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import AdminLoginForm from '../../../components/forms/AdminLoginForm';
import { getAdminSession } from '../../../lib/adminAuth';

export const metadata: Metadata = {
  title: 'Admin sign in',
  robots: { index: false, follow: false },
};

// Never cached: it reads a cookie and redirects on it.
export const dynamic = 'force-dynamic';

/**
 * The one admin page outside the guard — see `PUBLIC_ADMIN_PATHS` in
 * `proxy.ts`. It has to be, or there is no way to obtain a session.
 *
 * No Header or Footer. This is a tool, not a page of the website, and the site
 * chrome would put a "Get a quote" CTA and a newsletter signup around a
 * password field.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Already signed in: nothing to do here.
  if (await getAdminSession()) redirect(safeNext(next));

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-extrabold tracking-display">
          Trek &amp; Climb admin
        </h1>
        <p className="mt-2 text-sm text-muted">
          Staff only. There is no public registration.
        </p>

        <div className="mt-8 rounded-lg border border-hairline bg-white p-6">
          <AdminLoginForm next={safeNext(next)} />
        </div>
      </div>
    </main>
  );
}

/**
 * Sanitises the `?next=` destination.
 *
 * The value arrives in a query string, which anyone can write, and it is fed to
 * a redirect on the page where an admin is about to type a password — the
 * textbook open-redirect-into-phishing setup. Only a same-site absolute path is
 * accepted.
 *
 * `//evil.com` is the case that catches people out: it starts with `/`, so a
 * naive `startsWith('/')` check passes it, and the browser reads it as a
 * protocol-relative URL to another host. Hence the second character test.
 */
function safeNext(next?: string): string {
  const fallback = '/admin';

  if (!next) return fallback;
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//')) return fallback;
  // A backslash is normalised to a forward slash by some browsers, so `/\evil.com`
  // is the same trick wearing a different character.
  if (next.startsWith('/\\')) return fallback;
  // Never bounce straight back to the login page.
  if (next.startsWith('/admin/login')) return fallback;

  return next;
}
