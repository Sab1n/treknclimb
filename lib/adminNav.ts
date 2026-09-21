/**
 * The admin navigation, as data.
 *
 * Every screen v1 specifies is listed here, including the ones that do not
 * exist yet. Those render as **visibly disabled items, not as links** — a nav
 * that links to a 404 teaches whoever is using it to distrust the whole
 * sidebar, and an item silently omitted until it is built gives no sense of
 * what the tool will eventually be. Disabled-with-a-reason is the honest third
 * option, and it doubles as the build checklist.
 *
 * `href` is what decides: present means built and linked, absent means not yet.
 * There is no `enabled: boolean` to fall out of sync with it.
 */

export interface AdminNavItem {
  label: string;
  /** Omitted for screens that are not built. Those render disabled. */
  href?: string;
  /**
   * Exact-match highlighting. `/admin` would otherwise be marked current on
   * every page beneath it, since the active check is a prefix test — the index
   * is the one item where that is wrong.
   */
  exact?: boolean;
}

export interface AdminNavSection {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/admin', exact: true },
      { label: 'Booking inquiries', href: '/admin/inquiries' },
      { label: 'Rejected submissions', href: '/admin/rejections' },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'Trips', href: '/admin/trips' },
      { label: 'Activities', href: '/admin/activities' },
      { label: 'Regions', href: '/admin/regions' },
      { label: 'Destinations', href: '/admin/destinations' },
      { label: 'Blog', href: '/admin/blog' },
      { label: 'Categories' },
      { label: 'Team', href: '/admin/team' },
      { label: 'Testimonials', href: '/admin/testimonials' },
      { label: 'FAQs', href: '/admin/faqs' },
      { label: 'Media' },
    ],
  },
  {
    title: 'Site',
    items: [
      { label: 'Newsletter', href: '/admin/newsletter' },
      { label: 'Exchange rates', href: '/admin/rates' },
      { label: 'Redirects', href: '/admin/redirects' },
      { label: 'Settings', href: '/admin/settings' },
    ],
  },
];

/**
 * Labels for breadcrumb segments, keyed by the URL segment itself.
 *
 * Derived from the path rather than passed down from each page, because the
 * shell renders the trail and a layout cannot see its child's props. The cost
 * is that a segment with no entry here — an inquiry's ObjectId — has to fall
 * back to something generic, which `segmentLabel` handles.
 */
const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Admin',
  inquiries: 'Booking inquiries',
  trips: 'Trips',
  activities: 'Activities',
  regions: 'Regions',
  destinations: 'Destinations',
  redirects: 'Redirects',
  testimonials: 'Testimonials',
  faqs: 'FAQs',
  rejections: 'Rejected submissions',
  newsletter: 'Newsletter',
  team: 'Team',
  blog: 'Blog',
  rates: 'Exchange rates',
  settings: 'Settings',
};

/** A 24-character hex ObjectId, which is never a useful breadcrumb label. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * What to call a record, based on the collection it sits under.
 *
 * `/admin/inquiries/<id>` and `/admin/trips/<id>` both end in an ObjectId, and
 * one generic word covering both ("Record") is worse than either — the trail's
 * last item is the one naming the page you are on. The parent segment already
 * says which collection it is, so it decides.
 */
const RECORD_LABELS: Record<string, string> = {
  inquiries: 'Inquiry',
  trips: 'Trip',
  activities: 'Activity',
  regions: 'Region',
  destinations: 'Destination',
  blog: 'Post',
  team: 'Team member',
  testimonials: 'Testimonial',
  faqs: 'FAQ',
};

/**
 * @param parentSegment the segment immediately before this one, used to label
 *   an ObjectId. Omitted for the first segment, which never is one.
 */
export function segmentLabel(segment: string, parentSegment?: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];

  if (OBJECT_ID.test(segment)) {
    return (parentSegment && RECORD_LABELS[parentSegment]) || 'Record';
  }

  // Anything else: `exchange-rates` reads as `Exchange rates`.
  return segment
    .replace(/-/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}
