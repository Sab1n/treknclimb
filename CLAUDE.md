# TrekNClimb — project brief

Read this before doing anything. It holds the decisions already made so they
don't get re-litigated or accidentally contradicted.

This file is the **working specification**. The docx in `docs/` is the original
client-facing SRS and is now partially out of date — where the two disagree,
this file wins.

---

## What this is

A trekking and adventure travel website for **Trek & Climb Adventure**, a
Nepal-based operator running out of Pokhara. It **replaces the company's
existing WordPress site at treknclimb.com** — same domain, full cutover.

The site sells the company's own fixed tour packages across four destinations.
There is **no online payment and no customer account system**. Visitors browse
trips and submit a booking inquiry, which is stored in MongoDB and delivered to
the company by email and WhatsApp. Staff follow up manually.

The single conversion event on this site is an inquiry form submission. Design
and copy decisions should be judged against that.

---

## Working with Sabin

- Full-stack developer. **Handles all business logic himself.** Do not add
  logic he did not ask for. When he asks for styling help, give styling help.
- Works in **Tailwind CSS**. Restyling requests should not come bundled with
  unrequested refactors.
- **Learning TypeScript on this project.** Explain the concepts in what you
  write — what a generic is doing, why a field is `| null` rather than `?`,
  what an interface buys over plain JS. React, hooks and general JS need no
  explanation; he has shipped a Next.js ecommerce site before.
- **Has never used Next.js route handlers.** Prior Next.js work used a separate
  Express server (`client/` and `server/` folders, two dev terminals). Where a
  route handler differs from the Express equivalent, say so.
- Prefers direct answers. Flag real problems rather than agreeing.

---

## Stack — settled, do not substitute

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js, App Router | |
| Language | TypeScript | `strict: true` — already enabled, everything compiles |
| API layer | **Next.js route handlers only** | Express dropped — decided, not open |
| Styling | Tailwind CSS | |
| Database | MongoDB Atlas — free M0, AWS, Mumbai `ap-south-1` | |
| ODM | Mongoose | |
| Forms | React Hook Form + Zod | Zod schemas shared client and server |
| Email | **Resend** | Gmail SMTP rejected — SPF/DKIM alignment, deliverability, no logs |
| Media | Cloudinary | |
| Rate limiting | Upstash Redis | Counter must be in shared storage, never in-memory |
| Bot protection | Cloudflare Turnstile | |
| Auth | JWT in httpOnly cookie | Admin only, single role |
| Monitoring | Sentry, UptimeRobot, GA4, Search Console, Bing Webmaster | |

**Resend only sends, it does not receive.** The `from` mailbox
(`bookings@treknclimb.com`) must exist on a real mail host or customer replies
bounce. Reply-To is set to the customer's address on every notification.

### Why route handlers, not Express

Most pages are statically generated for SEO. With a separate Express server,
generating a trip page means Next.js → HTTP → Express → Mongoose → MongoDB.
With route handlers, a server component calls Mongoose directly and the network
hop disappears. One codebase, one deployment, no CORS, shared types.

This flips only if a second consumer appears (mobile app, partner API). None is
planned.

### Data fetching pattern

**Most reads do not go through the API.** Server components query Mongoose
directly. Route handlers exist only for: public form submissions, admin CRUD
mutations, and anything the browser fetches after page load. There are far fewer
endpoints here than in a MERN app.

---

## Domain rules

**Four destinations: Nepal, India, Tibet, Bhutan.** Seeded once, **edit-only**
in the CMS — never created or deleted through the UI.

**Nepal has an Activity layer. The other three do not.**

```
Nepal  → Activity (Trekking, Peak Climbing, Hiking) → Trip
India  → Trip
Tibet  → Trip
Bhutan → Trip
```

`Trip.activity` is a **nullable reference** — null for India, Tibet, Bhutan.
Type it `activity: Types.ObjectId | null`, never `activity?: ...`. The key is
always present; null is a real, meaningful value for three of four destinations,
not missing data. `?` invites `undefined` checks scattered everywhere and
produces bugs that only appear on non-Nepal trips.

`Destination.hasActivities` is the source of truth. Enforce the pairing in a
`pre('validate')` hook so the asymmetry lives in one place rather than being
re-checked in every form and route. The hook is async (it looks up the
destination). **`insertMany` does run validation and fires `pre('validate')`** —
it skips *save* middleware, not validate.

This asymmetry propagates through the data model, URL structure, filters,
breadcrumbs and the admin trip editor. **It is the single most important rule
in the codebase**, because code written without it looks correct and fails only
on India, Bhutan and Tibet.

### Populated vs unpopulated types

A single interface cannot describe both shapes. Export two:

```ts
export interface ITrip {
  activity: Types.ObjectId | null;
  destination: Types.ObjectId;
  // ...
}

export interface ITripPopulated extends Omit<ITrip, 'activity' | 'destination'> {
  activity: IActivity | null;
  destination: IDestination;
}
```

`Omit<T, K>` takes everything from `T` except keys `K`, so the populated shape
redeclares just those two. Trip pages use `ITripPopulated`; admin lists use
`ITrip`.

Refs are `Types.ObjectId`, **not `string`** — that is what Mongoose actually
stores, and `Schema<ITrip>` will not compile otherwise. A serialized DTO layer
in `types/` (where `_id` and refs become strings for client components) is
**deferred until the first client-component boundary needs it**.

`.lean<ITripPopulated>()` is an **assertion, not a check** — nothing verifies you
called `.populate()`. All populated reads go through typed helpers in
`lib/queries/` so that assertion lives in one auditable place.

### Pricing

**Two structures per trip:**
- **Flat price** — the anchor used on cards, listings and structured data.
- **Group pricing tiers** — embedded array, shown on the trip detail page only.
  Tiers must not overlap; validate on save.

**Multi-currency:** base is **USD, always**. Prices are **never stored
pre-converted**. An `ExchangeRates` collection holds rate, source and
`lastUpdated`. Admin can override manually and force a refresh; a warning shows
if rates are older than 7 days. Converted prices display an "indicative, final
price confirmed on inquiry" note. **Structured data and sitemap always emit
USD** so search engines see one consistent price.

---

## Collections

`Destinations` · `Activities` · `Trips` · `BookingRequests` · `BlogPosts` ·
`BlogCategories` · `Testimonials` · `Faqs` · `Admin` · `ExchangeRates` ·
`Redirects` · `Affiliations` · `SiteSettings`

**Embedded, not separate collections:** itinerary days, gallery images, group
pricing tiers, trip FAQs — all live inside the Trip document.

**`Affiliations`** — name, abbreviation, logo, url, registrationNumber,
displayOrder. Four records: Department of Tourism (tourism.gov.np), Nepal
Tourism Board (ntb.gov.np), TAAN Pokhara (taanpokhara.org), Nepal Mountaineering
Association (nepalmountaineering.org). A primary trust asset for a Nepali
operator selling to strangers abroad — content, not chrome.

**`SiteSettings`** — singleton. Organisation details and NAP, response-time
promise, headline stats, hero copy, the value-proposition points, policy copy,
named contact person, social links. Anything the client should be able to change
without a code deploy.

**`Redirects`** — `oldUrl` (unique, indexed), `newUrl`, `type` (301 default),
`hitCount`, `lastHitAt`, `isActive`.

**Reviews:** trips carry `ratingAverage`, `ratingCount` and `ratingSource`.
**Display-only, always attributed** — "4.9 on TripAdvisor from 186 reviews".
See the JSON-LD prohibition below.

---

## URL architecture

Lowercase, hyphenated, hierarchical. No dates, IDs or extensions.

```
/                                    homepage
/destinations                        overview
/nepal                               destination with activities
/india  /bhutan  /tibet              destinations without
/nepal/activities                    activity listing
/nepal/[activity]                    activity page
/nepal/[activity]/[trip]             trip, Nepal
/[destination]/[trip]                trip, elsewhere
/trips                               search and filter
/blog  /blog/[slug]  /blog/category/[slug]
/faq  /contact  /about
/privacy-policy  /terms  /booking-policy
/admin/*                             noindex, disallowed in robots.txt
```

Slugs unique within their collection. Changing a published slug auto-creates a
301 and retains `slugHistory` on the document — this applies to **all** slugged
models, not just Trip. A trip's canonical URL is the one under its
destination/activity hierarchy. Filter and pagination query strings never create
indexable URLs — filtered listings canonical to the unfiltered one.

---

## Caching and revalidation

| Content | Strategy |
|---|---|
| Trip, destination, activity, blog pages | Static generation + ISR |
| Listing pages | ISR |
| Admin dashboard, booking submissions, inquiry counts | Explicitly dynamic, never cached |

**On-demand revalidation is the primary mechanism.** When admin saves, the
mutation handler calls `revalidatePath()` for the affected page plus its parent
listings — live in seconds, no full rebuild:

```ts
revalidatePath(`/${destination}/${activity}/${slug}`);
revalidatePath('/trips');
```

**Gotcha:** Next.js caches `fetch()` automatically but **does not cache direct
Mongoose queries** — it has no idea what they are. Caching happens at page level
via `revalidate`, or by wrapping expensive queries in `unstable_cache`.

A dedicated `/api/revalidate` endpoint is only needed for external triggers
(webhooks, a manual "refresh site" admin button). If kept, it must be protected
by a secret token or it becomes a free denial-of-service.

---

## SEO and GEO — architectural, not polish

This site's organic traffic is the business.

- **JSON-LD on every page:** `TouristTrip` (trips), `BlogPosting`, `FAQPage`,
  `BreadcrumbList`, `ItemList` (listings), `Organization`/`TravelAgency`
  site-wide. Organization schema carries full legal name, address, phone,
  founding date, `identifier` for registration numbers, `memberOf` for the four
  affiliations, and `sameAs` for every official profile.
- **`aggregateRating` is NOT emitted in JSON-LD.** Google's review-snippet
  policy requires reviews to be collected and displayed first-party. Our ratings
  are imported from off-site platforms, so emitting them risks a manual action —
  catastrophic on a site whose entire value is organic traffic. Ratings are
  display-only with visible attribution. Revisit only if first-party review
  collection is ever built.
- **Shared SEO field set** on every indexable content type: SEO title, meta
  description, slug, canonical override, OG title/description/image, schema type
  override, index/noindex toggle. (**No `focusKeyword`** — it was a note-to-self
  field that affected nothing.)
- Auto-generated sitemap. Draft and archived content excluded and noindexed.
- **GEO:** server-rendered HTML is the main advantage — most AI crawlers do not
  execute JS. `robots.txt` must name AI crawlers explicitly (GPTBot,
  OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot,
  Google-Extended, CCBot, Bytespider, Applebot-Extended). An `/llms.txt`
  summarising the site is required.
- **NAP consistency** — business name, address and phone byte-identical across
  footer, Organization schema, Google Business Profile, TripAdvisor and every
  directory. Inconsistency weakens entity resolution and reduces the chance of
  being named in a generated answer.
- Every trip page carries an **answer block** near the top stating cost,
  duration, difficulty and season in plain sentences. Authored, not generated.
  This is the AI-extraction target and it converts.

---

## Security

Rate limits, server-side against Upstash, keyed by IP and by email:

| Endpoint | Limit |
|---|---|
| `POST /api/bookings` | 5 per IP per hour, 20 per day |
| `POST /api/bookings` per email | 3 per day |
| `POST /api/contact` | 5 per IP per hour |
| `POST /api/admin/login` | 5 failures per 15 min, then 30-min lockout |
| All public API routes | 100 per IP per minute |

Layered alongside: Turnstile verified server-side, hidden honeypot field, and a
time trap rejecting submissions completed in under 3 seconds.

**Booking endpoint fails open** if Upstash is unreachable — losing a real
inquiry is worse than letting spam through. Admin login fails closed.

Admin auth: bcrypt cost 12 or Argon2. 2-hour access token, sliding refresh,
12-hour absolute cap. Token version field on the admin document invalidates all
sessions on password change. Single-use 30-minute reset tokens. Credentials
seeded via env vars — **there is no public registration route**.

Also: input sanitisation on rich text (stored XSS), signed Cloudinary uploads so
credentials never reach the client, security headers (CSP, X-Frame-Options,
X-Content-Type-Options, Referrer-Policy, HSTS), HTTPS enforced.

---

## Conventions

- Every Mongoose model exports an `I<Name>` interface from the same module and
  wires it via `Schema<IName>`.
- Guard every model: `mongoose.models.X || mongoose.model<IX>('X', schema)` —
  hot reload throws otherwise.
- `lib/db.ts` caches the connection on `global`. **Never call
  `mongoose.connect()` anywhere else.**
- **Admin mutations use `findById` → assign → `save()`, never
  `findOneAndUpdate`.** Query middleware does not run `pre('validate')`, so
  `findByIdAndUpdate` silently skips the Nepal/activity rule —
  `runValidators: true` runs path validators only, not the hook. Every model
  with a validate hook also gets a matching `pre('findOneAndUpdate')` as a
  second line of defence.
- All populated reads go through typed helpers in `lib/queries/`, never a raw
  `.lean<T>()` at the call site.
- Server Components by default. Client Components only for filters, currency
  switcher, booking form, admin editors.
- **Alt text is required on every image before save.** Not optional.
- Validate on the server independently of the client. Never trust client
  validation alone.

---

## Folder structure

```
app/           routes, pages, layouts, api/ route handlers
  api/         bookings, contact, admin/*, revalidate
  admin/       dashboard, login, trips, activities, blog, bookings, settings
components/    ui/ layout/ trip/ forms/ admin/
lib/           db, auth, rateLimit, email, cloudinary, currency, schema,
               validators/, queries/
models/        one Mongoose model per file, typed
types/         shared interfaces; serialized DTOs when client boundaries appear
scripts/       seed and maintenance scripts
docs/          SRS + both prototypes
middleware.ts  admin auth guard
next.config.js 301 redirects live here
```

## Environment variables

```
MONGODB_URI  JWT_SECRET
RESEND_API_KEY  EMAIL_FROM  EMAIL_TO
CLOUDINARY_CLOUD_NAME  CLOUDINARY_API_KEY  CLOUDINARY_API_SECRET
UPSTASH_REDIS_REST_URL  UPSTASH_REDIS_REST_TOKEN
TURNSTILE_SECRET_KEY  NEXT_PUBLIC_TURNSTILE_SITE_KEY
NEXT_PUBLIC_WHATSAPP_NUMBER  NEXT_PUBLIC_GA_ID
EXCHANGE_RATE_API_KEY  REVALIDATE_SECRET
```

`NEXT_PUBLIC_` is visible in the browser. **Never put a secret behind it.**

---

## Design direction

### How to read the prototypes

The prototypes are **visual and structural references, not a specification.**
They show layout, hierarchy, spacing, colour and component patterns. They do
not define what data exists.

Everything in them is placeholder: trek names, prices, altitudes, staff names,
review counts, testimonial quotes, registration numbers, "6 of 12 places left",
"3,800+ trekkers", "avg 1h 47m". None of it is real, none of it was supplied by
the client, and none of it implies a schema field.

**The SRS and this file define what the system does. The prototypes define what
it looks like.** When a prototype shows something the spec doesn't mention, that
is a question to raise, not a requirement to implement.

Take from them: layout and section order, component structure, the palette and
type scale, the conversion patterns below, responsive behaviour.

Do not take from them: any specific value, any data point, or any feature not
named in the SRS or this file.

---

Both prototypes are in `docs/`. **Use v2's visual language with v1's information
depth** — that combination is the agreed direction.
`treknclimb-prototype.html` is v1 (information structure);
`treknclimb-prototype-v2-conversion.html` is v2 (visual language, conversion
patterns, 60-30-10 reference screen).

**60-30-10 palette:**
- **60% Paper `#F4F6F7`** + white surfaces — page background, cards, tables,
  forms. Carries all long-form reading.
- **30% Ink `#0F1A24`** — hero, sticky rail, section bands, footer, mobile bar.
  Frames the money zones.
- **10% Marigold `#F0A02A`** — **CTAs and urgency chips only, never
  decorative.** When the accent means exactly one thing, visitors learn it in
  seconds.

System colours sit outside the ratio: `#1B7A4B` confirmed, `#C0392B` error,
`#5E7180` muted text, `#E2E7E9` hairline.

**Type:** Bricolage Grotesque for headlines (800 weight, −3.5% tracking),
Instrument Sans for body and UI, IBM Plex Mono for prices, altitudes and metrics
only, with tabular figures.

**One marigold button per viewport, maximum.**

Light-dominant is deliberate. Dark-dominant looks sharp in a portfolio and
underperforms with 45–65 year olds spending $2,000. Legibility is a conversion
feature. **No `prefers-color-scheme: dark` handling** — the site is light in
both modes.

### Conversion patterns — must survive any redesign

- **Two-step inquiry form.** Step 1 is trip details (low friction, no personal
  data). Step 2 is contact details. Splitting it exploits sunk cost and gives a
  drop-off diagnostic a single-page form cannot.
- **Risk reversal directly under every CTA:** "No payment now. Deposit only
  after you approve the plan." The biggest objection is not price, it's what
  happens when they press the button.
- **Sticky inquiry rail** on desktop trip pages, **sticky action bar** on
  mobile. On a long trip page, a CTA only at top and bottom leaks most of its
  traffic.
- **Response-time promise and a named human** near the CTA (from
  `SiteSettings`). Speed is a proxy for legitimacy when a stranger can't verify
  you any other way.
- **Honest scarcity only** — permit lead times (Manaslu needs 21 days), season
  windows closing, and the group-size cap. **Not** per-departure remaining
  places: the company does not run fixed departures with tracked capacity, so
  "6 of 12 places left" would be the fake urgency this rule forbids. If they
  ever do, an embedded optional `departures[]` is an additive change and blocks
  nothing.
- **CTA copy is "Get a quote" / "Get my free itinerary", never "Book now."**
  There is no checkout, so "Book" is a promise the form cannot keep.
- **Affiliations at the decision point** — compact row beside the booking CTA,
  plus footer strip, homepage section, and expanded with registration numbers on
  About. Not on blog posts, legal pages or admin.
- **Trip pages open with an elevation profile** driven by itinerary altitude
  data. It answers "how hard is this" faster than prose and costs nothing extra
  — the data is already in the schema.

---

## Migration — highest risk item in the project

The existing WordPress site holds the domain's search equity. Losing it at
cutover undoes years of ranking.

**Data collection must happen while the old site is still live:**
- Full crawl producing a complete URL inventory (its sitemap.xml, or Screaming
  Frog free tier)
- Search Console export of indexed URLs and top pages by clicks
- Backlink profile export

**Then:**
- Redirect map: every old URL → closest new equivalent. **Never bulk-redirect to
  the homepage.**
- Content migration — existing blog posts and trip descriptions come across
- **Record all DNS records before touching them, especially MX** — company email
  may be hosted with the current provider and changing hosting can kill it
- Lower DNS TTL 24–48h before switching; provision SSL on the new host before
  pointing DNS
- 301s in `next.config.js` plus a database-backed catch-all for slug history
- Post-launch: monitor Search Console 404s daily for two weeks, weekly after

A `Redirects` collection and an admin screen for it — showing hit counts and
unmapped 404s — are part of the MVP.

---

## Out of scope

Payment gateway. Customer accounts. Multi-role admin permissions. Scheduled
departures with live availability. Multi-language content. First-party review
collection.

Admin funnel analytics come from **GA4, not MongoDB** — do not build a pageview
or session collection. `BookingRequest` stores source page, submitted-at and
status timestamps; conversion rates and drop-off come from GA4.

The schema is built so none of these need breaking changes later. **Do not add
them speculatively.**

---

## Open items

- `robots.txt` final AI-crawler allow/block list — not yet written
- `/llms.txt` contents — not yet written
- Hosting provider: Vercel Pro, Render, Railway, or VPS. **Vercel Hobby is
  non-commercial and does not apply.** Use Upstash for rate limiting either way
  so the choice stays reversible.
- Exchange rate API provider
- Review data source for `ratingAverage` / `ratingCount`
- **Flat-price vs lowest-tier reconciliation** — a warning in the admin trip
  editor, explicitly **not** a schema validator. Not yet built.
- Customer acknowledgement email on submission (recommended: yes)

## Known local dev quirks

- Atlas connection uses the **non-SRV `mongodb://` string**. SRV lookups fail on
  this network — `querySrv ECONNREFUSED` — despite `nslookup` resolving fine.
  **Do not "helpfully" switch it back to `mongodb+srv://`.**
- Atlas Network Access is currently `0.0.0.0/0` for development. **Must be
  tightened before the database holds real inquiries.**
- Windows dev machine. Use PowerShell syntax for shell commands, not `mkdir -p`.