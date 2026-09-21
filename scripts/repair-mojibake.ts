import fs from 'node:fs';
import path from 'node:path';
import mongoose, { Model } from 'mongoose';

import { connectDB } from '../lib/db';
import { tripPath } from '../lib/urls';
import Destination from '../models/Destination';
import Trip from '../models/Trip';
import Activity from '../models/Activity';
import BlogPost from '../models/BlogPost';
import BlogCategory from '../models/BlogCategory';
import Faq from '../models/Faq';
import Testimonial from '../models/Testimonial';
import TeamMember from '../models/TeamMember';
import SiteSettings from '../models/SiteSettings';
import Affiliation from '../models/Affiliation';

/**
 * Repairs U+FFFD (the Unicode replacement character) in stored content.
 *
 *   npx tsx --env-file=.env.local scripts/repair-mojibake.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/repair-mojibake.ts
 *
 * ## What went wrong
 *
 * Twelve fields across three documents stored `world<FFFD>s` where
 * `world’s` belonged. The cause is reproducible: PowerShell's `Set-Content`
 * and `Out-File` default to the **system ANSI codepage**, not UTF-8. In
 * cp1252, `’` `—` `–` are the single bytes `0x92` `0x97` `0x96`. Read back as
 * UTF-8 those are lone continuation bytes — invalid — so the decoder emits
 * exactly **one** U+FFFD each. One byte in, one replacement out, which is why
 * the damage is one character wide and the surrounding text is untouched.
 *
 * That one-to-one property is what makes this repair provable rather than a
 * guess, and it is the whole basis of the check below.
 *
 * ## How the correct text is recovered
 *
 * **Nothing is retyped.** The seed and migration scripts on disk are correct
 * UTF-8 — verified against git history, where no version ever held a U+FFFD —
 * so they are the source of truth. This script reads them, applies the *same*
 * corruption to them in memory, and looks for the stored corrupt string in the
 * result. A hit means the corresponding span of the untouched source is the
 * original text, character for character.
 *
 * Because every character the corruption replaces is a single UTF-16 code
 * unit, and U+FFFD is too, **lengths and offsets are preserved** — so the
 * index found in the mangled copy is the same index in the clean one. That is
 * the only reason a plain `indexOf` is sound here.
 *
 * A field is only written when:
 *
 *   1. exactly one distinct candidate is found across all source files, and
 *   2. re-mangling that candidate reproduces the stored value **exactly**.
 *
 * Condition 2 is the acceptance test. It proves the replacement differs from
 * what is stored *only* in the corrupted positions — so this cannot silently
 * substitute a reworded paragraph that happens to look similar.
 *
 * ## findById → assign → save()
 *
 * Per CLAUDE.md, and it matters here rather than being ceremony: these are
 * `Trip` and `Destination` documents, and `Trip` carries the async
 * `pre('validate')` hook enforcing the Nepal/activity pairing. A
 * `findOneAndUpdate` would skip it. Each save is then read back **with the raw
 * driver**, because reading through Mongoose can hand back the value you just
 * set from the in-memory document and prove nothing.
 */

/* ------------------------------------------------------------------ *
 * The corruption, as a function
 * ------------------------------------------------------------------ */

/**
 * Applies the same damage the ANSI round trip did.
 *
 * Every non-ASCII character becomes one U+FFFD. That is broader than the three
 * characters actually lost, deliberately: it means the comparison never
 * depends on a list of "characters we think were affected", which is the kind
 * of list that is quietly incomplete.
 */
function mangle(text: string): string {
  return text.replace(/[^\u0000-\u007F]/g, '\uFFFD');
}

const SOURCE_DIR = path.join(__dirname);

/**
 * Decodes the JavaScript string escapes that appear in the seed literals.
 *
 * Needed because a value like `Trip.description` is written in source as a
 * single-quoted string containing a literal backslash-n, while what reaches
 * Atlas is a real newline. Without this the two are different lengths and a
 * search for the stored text finds nothing — which is exactly how
 * `druk-path-trek.description` failed to resolve on the first pass.
 *
 * One left-to-right pass, so an escaped backslash is consumed before the
 * character after it is considered: `\\n` becomes a backslash followed by the
 * letter n, not a newline.
 */
function unescapeJs(text: string): string {
  const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t' };

  return text.replace(/\\(n|r|t|'|"|`|\\|\$)/g, (_, c: string) => simple[c] ?? c);
}

/**
 * Every script on disk, as clean text plus its pre-mangled twin.
 *
 * Two views per file — raw and escape-decoded — because a stored value may
 * correspond to either. Both views are mangled *after* the decode, so offsets
 * stay aligned between each clean view and its own mangled copy, which is what
 * lets the slice below be taken by index.
 */
function loadSources(): { file: string; clean: string; mangled: string }[] {
  const sources: { file: string; clean: string; mangled: string }[] = [];

  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter(
      (f) => f.endsWith('.ts') && !f.startsWith('tmp-') && f !== 'repair-mojibake.ts'
    );

  for (const file of files) {
    const raw = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8');
    sources.push({ file, clean: raw, mangled: mangle(raw) });

    const decoded = unescapeJs(raw);
    if (decoded !== raw) {
      sources.push({ file: `${file} (escapes decoded)`, clean: decoded, mangled: mangle(decoded) });
    }
  }

  return sources;
}

/* ------------------------------------------------------------------ *
 * Finding the corrupt fields
 * ------------------------------------------------------------------ */

interface Corrupt {
  collection: string;
  id: unknown;
  label: string;
  /** Dotted path, e.g. `summary` or `itinerary.1.description`. */
  field: string;
  stored: string;
}

function walk(value: unknown, trail: string[], out: string[][]): void {
  if (typeof value === 'string') {
    if (value.includes('\uFFFD')) out.push([...trail]);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, [...trail, String(i)], out));
    return;
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      if (k === '_id') continue;
      walk(v, [...trail, k], out);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Models, keyed by the collection Mongoose pluralised them into
 * ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODELS: Model<any>[] = [
  Destination,
  Trip,
  Activity,
  BlogPost,
  BlogCategory,
  Faq,
  Testimonial,
  TeamMember,
  SiteSettings,
  Affiliation,
];

function modelForCollection(name: string): Model<unknown> | null {
  return (
    (MODELS.find((m) => m.collection.collectionName === name) as
      | Model<unknown>
      | undefined) ?? null
  );
}

/* ------------------------------------------------------------------ *
 * Cache purge
 * ------------------------------------------------------------------ */

/**
 * The public pages that were serving the corrupted text.
 *
 * Derived from the repaired documents rather than listed by hand, so a future
 * run against different documents purges the right pages without anyone
 * editing this file.
 *
 * `tripPath()` is reused rather than reimplemented — it is what resolves the
 * Nepal asymmetry, and a path built here by hand would 404 for three
 * destinations out of four.
 */
async function affectedPaths(
  repaired: { collection: string; id: unknown }[]
): Promise<string[]> {
  // The generated files read every document, so any content change dates them.
  const paths = new Set<string>(['/sitemap.xml', '/llms.txt']);

  const seen = new Set<string>();

  for (const { collection, id } of repaired) {
    const key = `${collection}::${String(id)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (collection === 'destinations') {
      const d = await Destination.findById(id).lean<{
        slug: string;
        hasActivities: boolean;
      }>();

      if (!d) continue;

      paths.add(`/${d.slug}`);
      paths.add('/destinations');
      paths.add('/trips');
      paths.add('/');

      if (d.hasActivities) paths.add(`/${d.slug}/activities`);
    }

    if (collection === 'trips') {
      const t = await Trip.findById(id)
        .populate('destination', 'slug')
        .populate('activity', 'slug')
        .lean<{
          slug: string;
          destination: { slug: string } | null;
          activity: { slug: string } | null;
        }>();

      if (!t?.destination) continue;

      paths.add(tripPath({ ...t, destination: t.destination }));
      paths.add(`/${t.destination.slug}`);
      paths.add('/trips');
      paths.add('/');

      if (t.activity) paths.add(`/${t.destination.slug}/${t.activity.slug}`);
    }
  }

  return [...paths];
}

/**
 * Asks the running site to purge them.
 *
 * `revalidatePath()` only works inside the Next runtime, and this is a plain
 * Node process — so the purge has to go over HTTP to `/api/revalidate`.
 *
 * A failure here is reported, never fatal. The data repair has already
 * succeeded and been verified at that point, and the cache catches up on the
 * next build or when each page's `revalidate` window lapses. Exiting non-zero
 * on an unreachable dev server would make a successful migration look failed.
 */
async function purge(paths: string[]): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET;
  const base = process.env.SITE_ORIGIN ?? 'http://localhost:3000';

  if (!secret) {
    console.log(
      '\nREVALIDATE_SECRET is not set, so nothing was purged. The corrected ' +
        'text is in Atlas; the pages above will pick it up on the next build.'
    );
    return;
  }

  try {
    const response = await fetch(`${base}/api/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': secret,
      },
      body: JSON.stringify({ paths }),
    });

    if (response.ok) {
      const result = (await response.json()) as { count: number };
      console.log(`\nPurged ${result.count} path(s) via ${base}/api/revalidate.`);
    } else {
      console.log(
        `\nPurge request returned ${response.status}. The data is repaired; ` +
          'the pages will refresh on the next build.'
      );
    }
  } catch {
    console.log(
      `\nNo server reachable at ${base}, so nothing was purged. The data is ` +
        'repaired; the pages will refresh on the next build. Set SITE_ORIGIN ' +
        'to point this at a running deployment.'
    );
  }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

(async () => {
  const dryRun = process.argv.includes('--dry-run');

  await connectDB();
  const db = mongoose.connection.db!;

  const sources = loadSources();
  console.log(`Loaded ${sources.length} script sources as reference.\n`);

  /* --- 1. Find every corrupt string in the database --- */

  const corrupt: Corrupt[] = [];

  for (const info of await db.listCollections().toArray()) {
    for (const doc of await db.collection(info.name).find({}).toArray()) {
      const paths: string[][] = [];
      walk(doc, [], paths);

      for (const trail of paths) {
        let value: unknown = doc;
        for (const key of trail) value = (value as Record<string, unknown>)[key];

        corrupt.push({
          collection: info.name,
          id: doc._id,
          label: (doc.slug as string) ?? (doc.key as string) ?? String(doc._id),
          field: trail.join('.'),
          stored: value as string,
        });
      }
    }
  }

  console.log(`Found ${corrupt.length} corrupt field(s).\n`);

  if (corrupt.length === 0) {
    console.log('Nothing to repair.');
    process.exit(0);
  }

  /* --- 2. Recover each one from the sources --- */

  const repairs: (Corrupt & { correct: string })[] = [];
  const unresolved: Corrupt[] = [];

  for (const item of corrupt) {
    const candidates = new Set<string>();

    for (const source of sources) {
      let from = 0;

      for (;;) {
        const idx = source.mangled.indexOf(item.stored, from);
        if (idx === -1) break;

        candidates.add(source.clean.slice(idx, idx + item.stored.length));
        from = idx + 1;
      }
    }

    const unique = [...candidates];

    // Condition 1: exactly one distinct candidate.
    if (unique.length !== 1) {
      unresolved.push(item);
      console.log(
        `  ? ${item.collection}/${item.label}.${item.field} — ${unique.length} candidates`
      );
      continue;
    }

    // Condition 2: re-mangling it must reproduce the stored value exactly.
    if (mangle(unique[0]) !== item.stored) {
      unresolved.push(item);
      console.log(
        `  ! ${item.collection}/${item.label}.${item.field} — candidate does not re-mangle to the stored value`
      );
      continue;
    }

    repairs.push({ ...item, correct: unique[0] });
  }

  console.log(`\nResolved ${repairs.length}, unresolved ${unresolved.length}.\n`);

  for (const r of repairs) {
    const before = r.stored.match(/.{0,20}\uFFFD.{0,20}/)?.[0] ?? '';
    const offset = r.stored.indexOf('\uFFFD');
    const after = r.correct.slice(Math.max(0, offset - 20), offset + 21);

    console.log(`  ${r.collection}/${r.label}.${r.field}`);
    console.log(`      was: ...${before}...`);
    console.log(`      now: ...${after}...`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    process.exit(unresolved.length ? 1 : 0);
  }

  /* --- 3. findById -> assign -> save(), grouped one document at a time --- */

  console.log('\nWriting...\n');

  const byDocument = new Map<string, (Corrupt & { correct: string })[]>();

  for (const r of repairs) {
    const key = `${r.collection}::${String(r.id)}`;
    byDocument.set(key, [...(byDocument.get(key) ?? []), r]);
  }

  let written = 0;

  for (const [key, fields] of byDocument) {
    const [collection] = key.split('::');
    const model = modelForCollection(collection);

    if (!model) {
      console.log(`  SKIPPED ${collection} — no model registered for it`);
      continue;
    }

    const doc = await model.findById(fields[0].id);

    if (!doc) {
      console.log(`  SKIPPED ${collection}/${fields[0].label} — document vanished`);
      continue;
    }

    for (const f of fields) doc.set(f.field, f.correct);

    await doc.save();

    /*
     * Read back with the raw driver, not through Mongoose. A Mongoose read can
     * return the value from the in-memory document and prove nothing about
     * what reached Atlas.
     */
    const stored = await db
      .collection(collection)
      .findOne({ _id: doc._id as mongoose.Types.ObjectId });

    for (const f of fields) {
      let value: unknown = stored;
      for (const seg of f.field.split('.')) {
        value = (value as Record<string, unknown>)?.[seg];
      }

      const ok = value === f.correct;
      console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${collection}/${f.label}.${f.field}`);
      if (ok) written += 1;
    }
  }

  console.log(`\n${written} of ${repairs.length} field(s) verified in Atlas.`);

  /* --- 4. Purge the pages that were serving the corrupted text --- */

  if (written > 0) {
    const paths = await affectedPaths([...byDocument.values()].flat());

    console.log(`\nPages affected (${paths.length}):`);
    for (const p of paths) console.log(`  ${p}`);

    await purge(paths);
  }

  if (unresolved.length) {
    console.log('\nStill corrupt (no unambiguous source):');
    for (const u of unresolved) {
      console.log(`  ${u.collection}/${u.label}.${u.field}`);
    }
  }

  process.exit(unresolved.length || written !== repairs.length ? 1 : 0);
})();
