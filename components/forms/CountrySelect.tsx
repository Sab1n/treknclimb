'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { COUNTRIES } from '../../lib/countries';
import { inputClass } from './Field';

/**
 * A searchable country select.
 *
 * A plain `<select>` with 242 options is a scroll on desktop, and free text
 * with a `<datalist>` puts "germany", "Deutschland" and "DE" into a field we
 * need to filter on later. So this is a combobox: type to narrow, arrow keys
 * to move, Enter to choose — and **the value can only ever be a name from the
 * list**, because it is set by selection and never from the typed text.
 *
 * The server does not take that on trust: `bookingFormSchema` checks the value
 * against the same list, since the endpoint is reachable without this component
 * in front of it.
 *
 * ## Accessibility
 *
 * The ARIA combobox pattern, not a div that looks like one: `role="combobox"`
 * on the input with `aria-expanded` and `aria-controls`, `role="listbox"` on
 * the list, `role="option"` with `aria-selected` on each row, and
 * `aria-activedescendant` pointing at the highlighted option so a screen reader
 * announces it as the arrow keys move — focus itself stays in the input, which
 * is what lets typing keep working.
 *
 * ## Two implementation details worth knowing
 *
 * `onMouseDown` with `preventDefault()` on each option, not `onClick` alone:
 * mousedown fires before blur, so without it the list would close on blur
 * before the click ever landed. Preventing the default stops focus leaving the
 * input at all.
 *
 * The scroll-into-view runs in an effect and finds the row with
 * `getElementById`. Reading a ref during render is a React rule violation, and
 * an effect that touches the DOM directly avoids holding refs to 242 rows.
 */
export default function CountrySelect({
  control,
  value,
  onChange,
  onBlur,
  hasError,
  placeholder = 'Start typing a country',
}: {
  /** The id and aria wiring from `Field`. */
  control: { id: string; 'aria-invalid': true | undefined; 'aria-describedby': string | undefined };
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  hasError: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  /**
   * Matches, ranked. Countries that *start* with what was typed come first —
   * typing "ind" should offer India before British Indian Ocean Territory.
   * `useMemo` because this runs on every keystroke over 242 entries.
   */
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return COUNTRIES as readonly string[];

    const starts: string[] = [];
    const contains: string[] = [];

    for (const country of COUNTRIES) {
      const haystack = country.toLowerCase();
      if (haystack.startsWith(needle)) starts.push(country);
      else if (haystack.includes(needle)) contains.push(country);
    }

    return [...starts, ...contains];
  }, [query]);

  // Keep the highlighted row in view as the arrow keys move down the list.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView({ block: 'nearest' });
    // optionId is derived from listId, which is stable for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex, listId]);

  function select(country: string) {
    onChange(country);
    setQuery('');
    setOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(0);
        } else {
          setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;

      case 'Enter':
        // Only swallow Enter while the list is open — otherwise it would stop
        // Enter submitting the form from any other field.
        if (open && matches[activeIndex]) {
          event.preventDefault();
          select(matches[activeIndex]);
        }
        break;

      case 'Escape':
        setOpen(false);
        setQuery('');
        break;

      case 'Tab':
        setOpen(false);
        setQuery('');
        break;
    }
  }

  return (
    <div className="relative">
      <input
        {...control}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        // While the list is open the input shows what is being typed; when it
        // closes it shows the chosen country again.
        value={open ? query : value}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setQuery('');
          onBlur();
        }}
        onKeyDown={handleKeyDown}
        className={inputClass(hasError)}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Countries"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border border-hairline bg-white py-1 shadow-lg"
        >
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">
              No country matches &ldquo;{query}&rdquo;
            </li>
          )}

          {matches.map((country, index) => (
            <li
              key={country}
              id={optionId(index)}
              role="option"
              aria-selected={country === value}
              // mousedown fires before blur; preventing its default keeps focus
              // in the input so the list is still open when the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(country)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                index === activeIndex ? 'bg-paper' : ''
              } ${country === value ? 'font-semibold' : ''}`}
            >
              {country}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
