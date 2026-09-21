import { Schema } from 'mongoose';

/**
 * Refuses to store U+FFFD, the Unicode replacement character.
 *
 * ## Why this can be an absolute rule
 *
 * U+FFFD is not a character anyone types. A decoder emits it when it is handed
 * bytes it cannot interpret, so its presence in a string **always** means a
 * decode already failed somewhere upstream. There is no legitimate content
 * that contains one, which is what makes a blanket rejection safe — unlike
 * most input rules, this one has no false positives to trade off.
 *
 * ## The incident this exists to prevent
 *
 * Twelve fields across `Destination/nepal`, `Trip/druk-path-trek` and
 * `Trip/poon-hill-trek` shipped reading `world<FFFD>s` and `Mar<FFFD>May`.
 * They were live on four public pages, inside `<meta name="description">`, and
 * in `/llms.txt`.
 *
 * The cause was reproduced: PowerShell's `Set-Content` and `Out-File` default
 * to the **system ANSI codepage**, not UTF-8. In cp1252 `’` `—` `–` are the
 * single bytes `0x92` `0x97` `0x96`; read back as UTF-8 those are lone
 * continuation bytes, so the decoder emits exactly one U+FFFD each. Nothing
 * errored at any point — the write succeeded, the build passed, and the only
 * symptom was a broken character in a search snippet.
 *
 * That is the shape of failure this codebase keeps meeting: the write works,
 * so nothing tells you. The answer is the same as for the Markdown
 * round trip and the alt-text rule — make it impossible at the layer that
 * actually guarantees things, which is the model.
 *
 * ## Applied by plugin, enforced by test
 *
 * `models/shared/noMojibake.test.ts` asserts that **every** model carries this.
 * A plugin a new model forgets to apply is worth very little, and "remember to
 * add this" is not a mechanism — the test is.
 */

/** The check itself, exported so scripts and route handlers can reuse it. */
export function hasMojibake(value: unknown): boolean {
  return typeof value === 'string' && value.includes('\uFFFD');
}

const MESSAGE =
  'contains U+FFFD (the Unicode replacement character), which means text was decoded with the wrong encoding before it got here. Check that whatever wrote this used UTF-8 — on Windows, PowerShell\'s Set-Content and Out-File default to the ANSI codepage and need an explicit -Encoding utf8.';

/**
 * Adds the validator to every `String` path on a schema, recursing into
 * subdocuments.
 *
 * A **path validator** rather than a `pre('validate')` hook, deliberately: it
 * produces a Mongoose `ValidationError` keyed to the field path, which the
 * admin editors already know how to map onto a form input. A hook can only
 * throw, and a thrown error arrives with no field to attach it to — the
 * two-shapes problem recorded in CLAUDE.md.
 *
 * Recursion into `childSchemas` matters here. Trip keeps its itinerary days,
 * gallery images, pricing tiers and FAQs as embedded subdocuments, and those
 * are where most of its prose lives — a guard that only covered top-level
 * paths would have missed `itinerary[n].description` entirely.
 */
export function noMojibakePlugin(schema: Schema): void {
  schema.eachPath((pathName, schemaType) => {
    if (schemaType.instance !== 'String') return;

    schemaType.validate({
      validator: (value: unknown) => !hasMojibake(value),
      message: `\`{PATH}\` ${MESSAGE}`,
    });
  });

  // Embedded subdocument schemas are separate Schema objects and do not
  // inherit a parent's plugins.
  for (const child of schema.childSchemas) {
    noMojibakePlugin(child.schema);
  }
}

/**
 * True when a schema (and all its children) already carry the guard.
 *
 * Used by the test. It looks for the validator by its message rather than by
 * identity, because `schemaType.validate()` wraps the function it is given.
 */
export function hasMojibakeGuard(schema: Schema): boolean {
  let everyStringPathGuarded = true;

  schema.eachPath((_pathName, schemaType) => {
    if (schemaType.instance !== 'String') return;

    const validators = (schemaType as unknown as {
      validators: { message?: unknown }[];
    }).validators;

    const guarded = validators.some(
      (v) => typeof v.message === 'string' && v.message.includes('U+FFFD')
    );

    if (!guarded) everyStringPathGuarded = false;
  });

  for (const child of schema.childSchemas) {
    if (!hasMojibakeGuard(child.schema)) everyStringPathGuarded = false;
  }

  return everyStringPathGuarded;
}
