'use client';

/**
 * A plain string-list editor — the includes and excludes columns.
 *
 * These are `string[]` on the model, not subdocuments, so there is no `_id` and
 * no natural key. That rules out the `RepeatableList` used elsewhere, which
 * keys on `row.key`.
 *
 * **So the index is the key here, and that is a real compromise.** Reordering
 * or deleting a line re-associates the inputs below it. The mitigations are
 * that these lines are short single inputs where losing focus costs a click
 * rather than a paragraph, and that there is no drag-reorder — only add and
 * remove. Giving them keys would mean either a wrapper object the model does
 * not want, or a parallel key array to keep in step, and both are more
 * machinery than the problem deserves.
 */
export default function ListEditor({
  label,
  hint,
  id,
  lines,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  id: string;
  lines: string[];
  onChange: (lines: string[]) => void;
  placeholder: string;
}) {
  function update(index: number, value: string) {
    onChange(lines.map((line, i) => (i === index ? value : line)));
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-base font-extrabold tracking-display">
          {label}
        </h2>
        <p className="mt-1 text-sm text-muted">{hint}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {lines.map((line, index) => (
          // An index key — see the note at the top of this file for why it is
          // acceptable here and nowhere else in the editor.
          <li key={`${id}-${index}`} className="flex items-center gap-2">
            <input
              type="text"
              value={line}
              placeholder={placeholder}
              aria-label={`${label} line ${index + 1}`}
              onChange={(event) => update(index, event.target.value)}
              className="w-full rounded border border-hairline bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-ink"
            />

            <button
              type="button"
              onClick={() => onChange(lines.filter((_, i) => i !== index))}
              aria-label={`Remove ${label} line ${index + 1}`}
              className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-error transition-colors hover:bg-error/10"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {lines.length === 0 && (
        <p className="rounded border border-dashed border-hairline bg-white px-4 py-6 text-center text-sm text-muted">
          Nothing listed yet.
        </p>
      )}

      <button
        type="button"
        onClick={() => onChange([...lines, ''])}
        className="self-start rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
      >
        Add a line
      </button>

      {/*
        Says what happens to an empty line, because leaving one behind is the
        normal outcome of clicking Add and changing your mind — and silently
        dropping it without saying so looks like data loss.
      */}
      <p className="text-xs text-muted">
        Blank lines are dropped on save rather than stored.
      </p>
    </section>
  );
}
