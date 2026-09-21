import mongoose from 'mongoose';
import { connectDB } from '../lib/db';

/**
 * Two questions at once:
 *
 *   1. Which stored strings contain U+FFFD (corrupted)?
 *   2. Which contain a *correct* smart quote or dash (U+2013/2014/2018/2019/
 *      201C/201D)?
 *
 * The second is the diagnostic. If nothing anywhere holds a correct one, every
 * write of a special character was mangled and the fault is systemic. If some
 * documents hold them, the corruption belongs to particular write events and
 * the rest of the data is fine.
 */

const GOOD = /[–—‘’“”…]/;

interface Hit {
  where: string;
  kind: 'BAD' | 'GOOD';
  sample: string;
}

function walk(value: unknown, path: string, hits: Hit[]): void {
  if (typeof value === 'string') {
    if (value.includes('\uFFFD')) {
      const m = value.match(/.{0,14}\uFFFD.{0,14}/);
      hits.push({ where: path, kind: 'BAD', sample: m ? m[0] : '' });
    } else if (GOOD.test(value)) {
      const m = value.match(new RegExp('.{0,14}' + GOOD.source + '.{0,14}'));
      hits.push({ where: path, kind: 'GOOD', sample: m ? m[0] : '' });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, hits));
    return;
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      if (k === '_id') continue;
      walk(v, `${path}.${k}`, hits);
    }
  }
}

(async () => {
  await connectDB();
  const db = mongoose.connection.db!;

  const collections = await db.listCollections().toArray();
  const hits: Hit[] = [];

  for (const info of collections) {
    const docs = await db.collection(info.name).find({}).toArray();

    for (const doc of docs) {
      const label =
        (doc.slug as string) ?? (doc.key as string) ?? (doc.code as string) ?? String(doc._id);
      walk(doc, `${info.name}/${label}`, hits);
    }
  }

  const bad = hits.filter((h) => h.kind === 'BAD');
  const good = hits.filter((h) => h.kind === 'GOOD');

  console.log('=== CORRUPTED (U+FFFD) : ' + bad.length + ' ===');
  for (const h of bad) console.log('  ' + h.where + '\n      ...' + h.sample + '...');

  console.log('\n=== CORRECT smart punctuation : ' + good.length + ' ===');
  for (const h of good.slice(0, 40)) console.log('  ' + h.where + '\n      ...' + h.sample + '...');
  if (good.length > 40) console.log('  ... and ' + (good.length - 40) + ' more');

  console.log('\ncollections scanned: ' + collections.length);
  process.exit(0);
})();
