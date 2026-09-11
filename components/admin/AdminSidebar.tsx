'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';

import { ADMIN_NAV, segmentLabel } from '../../lib/adminNav';

/**
 * The admin sidebar.
 *
 * A Client Component for two reasons: `usePathname()`, and the mobile
 * disclosure state. Marking the current screen needs the URL, and a Server
 * Component in a layout cannot see it — a layout does not re-render on
 * navigation, so even if it could read the path it would show a stale one.
 *
 * ## Mobile is a disclosure, not a stacked list
 *
 * On a phone the sidebar is collapsed to a single button showing the current
 * screen. Rendering the full nav above the content would push the work down
 * behind fifteen items, eleven of which are disabled — and the inquiry list is
 * the screen staff use every day, plausibly from a phone while following up a
 * booking.
 *
 * Collapsed is the initial state on every load rather than something
 * remembered. A remembered-open nav means arriving at a screen with the
 * content pushed off-frame, which is the problem this is solving.
 *
 * ## Unbuilt screens
 *
 * Rendered as `span aria-disabled="true"`, not as a disabled link. A link with
 * its `href` removed is still focusable and still announced as a link; a span
 * is announced as text. The title says why, so a greyed-out item never reads
 * as a permissions problem.
 */
export default function AdminSidebar() {
  const pathname = usePathname();
  const panelId = useId();

  /*
   * Open state is stored as *the path it was opened on*, not as a boolean.
   *
   * The panel has to close when the admin navigates — otherwise the tap that
   * chose a destination leaves the thing obscuring it still on screen. The
   * obvious version is a boolean plus `useEffect(() => setOpen(false),
   * [pathname])`, and the React Compiler rejects it: setting state in an effect
   * to mirror a prop or a hook value is a second render pass to compute
   * something that was already derivable.
   *
   * Comparing against the current path derives it instead. Navigating makes
   * `openedAt` stale, which closes the panel with no effect, no extra render,
   * and no window where the old state is briefly visible.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  const currentLabel = currentScreenLabel(pathname);

  return (
    <>
      {/* ---------------- mobile: a disclosure button ---------------- */}

      <button
        type="button"
        onClick={() => setOpenedAt(open ? null : pathname)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-paper/80 transition-colors hover:bg-paper/5 lg:hidden"
      >
        <span>
          <span className="text-paper/40">Screen: </span>
          <span className="font-semibold text-paper">{currentLabel}</span>
        </span>

        {/*
          `aria-hidden` on the caret: the button already announces its state
          through `aria-expanded`, and without this a screen reader reads the
          glyph out as well.
        */}
        <span aria-hidden="true" className="text-paper/50">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/*
        One nav element, shown as a collapsible panel below the button on small
        screens and always visible from `lg` up. `hidden` is toggled by a class
        rather than by unmounting, so the links stay in the DOM and the desktop
        layout never depends on the disclosure state.
      */}
      <nav
        id={panelId}
        aria-label="Admin sections"
        className={`flex-col gap-7 pt-4 lg:flex lg:pt-0 ${open ? 'flex' : 'hidden'}`}
      >
        {ADMIN_NAV.map((section) => (
          <div key={section.title}>
            <h2 className="px-3 text-xs font-semibold uppercase tracking-wide text-paper/40">
              {section.title}
            </h2>

            <ul className="mt-2 flex flex-col gap-0.5">
              {section.items.map((item) => {
                const current = item.href ? isCurrent(pathname, item) : false;

                return (
                  <li key={item.label}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        aria-current={current ? 'page' : undefined}
                        className={`block rounded px-3 py-2 text-sm transition-colors ${
                          current
                            ? 'bg-paper/10 font-semibold text-paper'
                            : 'text-paper/70 hover:bg-paper/5 hover:text-paper'
                        }`}
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span
                        aria-disabled="true"
                        title="Not built yet — this content is still edited directly in the database."
                        className="block cursor-not-allowed rounded px-3 py-2 text-sm text-paper/30"
                      >
                        {item.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}

/**
 * Exact-match highlighting for the index, prefix matching for everything else.
 *
 * `/admin` is a prefix of every admin URL, so without the `exact` flag the
 * Dashboard item would be marked current on every screen.
 */
function isCurrent(
  pathname: string,
  item: { href?: string; exact?: boolean }
): boolean {
  if (!item.href) return false;

  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/**
 * What the collapsed mobile button says.
 *
 * Reuses the breadcrumb labels so the button and the trail cannot disagree
 * about what a screen is called. Falls back to the deepest named segment,
 * which for `/admin/inquiries/<id>` gives "Booking inquiries" rather than the
 * ObjectId — the id is not a screen name, and the detail page's own heading
 * shows the reference anyway.
 */
function currentScreenLabel(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);

  for (const section of ADMIN_NAV) {
    for (const item of section.items) {
      if (item.href && isCurrent(pathname, item)) return item.label;
    }
  }

  const last = segments[segments.length - 1];

  return last ? segmentLabel(last, segments[segments.length - 2]) : 'Admin';
}
