import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * Does the parent form still know when the body has changed?
 *
 * TipTap keeps its document in ProseMirror's own state, not in React's, so the
 * dirty check every admin editor uses —
 * `JSON.stringify(values) !== JSON.stringify(baseline)` — only works if the
 * editor pushes its Markdown back up on every edit and, just as importantly,
 * **stays quiet when it has not been edited**.
 *
 * Two failure modes, opposite and both silent:
 *
 *  1. The editor never calls `onChange`. The unsaved-changes guard does not
 *     fire, Save stays disabled, and an hour of writing is lost to a misclick.
 *  2. The editor calls `onChange` while *loading* a record. Every record looks
 *     dirty the moment it opens, the guard cries wolf on every navigation, and
 *     people learn to click through it — which is worse than not having it.
 *
 * The second is the one that needs a mounted component to catch, because it is
 * a consequence of `emitUpdate: false` on `setContent` and of TipTap not firing
 * `onUpdate` for its initial `content`. Neither is visible from a pure test.
 *
 * jsdom, not a browser: enough DOM for ProseMirror to build a view, which is
 * all this needs. What it does **not** cover is real typing, selection and
 * paste — those need a browser, and the round-trip guarantee those would
 * exercise is asserted directly in `lib/richText.test.ts` instead.
 */

let cleanup: (() => void) | undefined;

before(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const g = globalThis as unknown as Record<string, unknown>;

  /*
   * ProseMirror reaches for these by bare name, not off `window`, so they have
   * to exist as globals rather than only as properties of the jsdom window.
   */
  const globals = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'DocumentFragment',
    'Range',
    'Event',
    'MutationObserver',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ];

  const saved = new Map<string, PropertyDescriptor | undefined>();

  /*
   * `defineProperty`, not assignment. Several of these — `navigator` above all —
   * are getter-only on the Node global in current versions, so `g.navigator = …`
   * throws rather than shadowing. Defining the property outright replaces the
   * accessor, and the saved descriptor puts the original back afterwards.
   */
  function install(name: string, value: unknown) {
    saved.set(name, Object.getOwnPropertyDescriptor(g, name));

    Object.defineProperty(g, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  for (const name of globals) {
    const value = (dom.window as unknown as Record<string, unknown>)[name];

    if (value === undefined) continue;

    install(name, typeof value === 'function' ? value.bind(dom.window) : value);
  }

  /*
   * React checks this flag before allowing `act()`. Without it every call logs
   * "The current testing environment is not configured to support act(...)" and
   * the warnings drown the actual results.
   */
  install('IS_REACT_ACT_ENVIRONMENT', true);

  // `window` and `document` must be the objects themselves, not bound copies.
  install('window', dom.window);
  install('document', dom.window.document);

  cleanup = () => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(g, name, descriptor);
      else delete g[name];
    }

    dom.window.close();
  };
});

after(() => cleanup?.());

describe('the parent form sees the editor', () => {
  test('mounting a record does not report a change', async () => {
    const { createElement, StrictMode } = await import('react');
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const RichTextEditor = (await import('./RichTextEditor')).default;

    const source =
      '## A heading\n\nA paragraph with **bold** in it.\n\n- one\n- two\n\n> A quote.';

    const seen: string[] = [];

    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(RichTextEditor, {
            value: source,
            onChange: (markdown: string) => seen.push(markdown),
            id: 'body',
            label: 'Body',
          })
        )
      );
    });

    /*
     * The whole point. If this array is non-empty, every editor screen reports
     * unsaved changes the instant it opens.
     */
    assert.deepEqual(
      seen,
      [],
      `loading a record emitted ${seen.length} change(s); the form would open dirty`
    );

    // And the document really did load — otherwise the assertion above passes
    // on an editor that rendered nothing.
    const surface = container.querySelector('[contenteditable]');

    assert.ok(surface, 'the editor surface did not mount');
    assert.match(surface!.innerHTML, /<h2/, 'the heading did not render');
    assert.match(surface!.innerHTML, /<strong>/, 'the bold mark did not render');
    assert.match(surface!.innerHTML, /<ul/, 'the list did not render');
    assert.match(surface!.innerHTML, /<blockquote/, 'the quote did not render');

    await act(async () => root.unmount());
    container.remove();
  });

  test('re-supplying the same value does not report a change', async () => {
    const { createElement } = await import('react');
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const RichTextEditor = (await import('./RichTextEditor')).default;

    const source = 'A paragraph.\n\n## Then a heading';
    const seen: string[] = [];

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function render(value: string) {
      return createElement(RichTextEditor, {
        value,
        onChange: (markdown: string) => seen.push(markdown),
        id: 'body',
        label: 'Body',
      });
    }

    await act(async () => root.render(render(source)));
    // A parent re-render with an unchanged value — which happens on every
    // keystroke in any *other* field on the same form.
    await act(async () => root.render(render(source)));

    assert.deepEqual(seen, [], 'a parent re-render emitted a change');

    await act(async () => root.unmount());
    container.remove();
  });

  test('an externally changed value reloads the document without reporting it', async () => {
    const { createElement } = await import('react');
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const RichTextEditor = (await import('./RichTextEditor')).default;

    const seen: string[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function render(value: string) {
      return createElement(RichTextEditor, {
        value,
        onChange: (markdown: string) => seen.push(markdown),
        id: 'body',
        label: 'Body',
      });
    }

    await act(async () => root.render(render('First body.')));
    await act(async () => root.render(render('## Second body')));

    /*
     * A record loaded after mount, or a form reset. The new document must
     * appear without being reported as an edit — otherwise loading a second
     * record marks the form dirty against the first one's baseline.
     */
    assert.deepEqual(seen, [], 'reloading the value emitted a change');

    const surface = container.querySelector('[contenteditable]');
    assert.match(surface!.innerHTML, /<h2/, 'the new document did not load');
    assert.doesNotMatch(
      surface!.innerHTML,
      /First body/,
      'the old document is still there'
    );

    await act(async () => root.unmount());
    container.remove();
  });
});

describe('the editor pushes real edits up', () => {
  test('a ProseMirror transaction reaches onChange as Markdown', async () => {
    const { createElement } = await import('react');
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const RichTextEditor = (await import('./RichTextEditor')).default;

    const seen: string[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(RichTextEditor, {
          value: 'Original text.',
          onChange: (markdown: string) => seen.push(markdown),
          id: 'body',
          label: 'Body',
        })
      );
    });

    assert.deepEqual(seen, [], 'precondition: mounting is silent');

    /*
     * Driving a real edit the way the browser would needs typing, which jsdom
     * cannot do. Dispatching a ProseMirror transaction against the mounted view
     * is the same path an edit takes once the keystroke has been interpreted —
     * it is what fires `onUpdate`, which is the wiring under test.
     */
    const surface = container.querySelector('[contenteditable]') as
      | (HTMLElement & { pmViewDesc?: { node?: unknown } })
      | null;

    assert.ok(surface, 'the editor surface did not mount');

    await act(async () => {
      // A plain DOM mutation plus an input event is how ProseMirror learns
      // about a composition it did not initiate.
      const paragraph = surface!.querySelector('p');
      assert.ok(paragraph, 'expected a paragraph to edit');

      paragraph!.textContent = 'Original text. And more.';
      surface!.dispatchEvent(
        new window.Event('input', { bubbles: true, cancelable: false })
      );
    });

    assert.ok(
      seen.length > 0,
      'an edit produced no onChange — the parent form would never go dirty'
    );

    assert.equal(
      seen.at(-1),
      'Original text. And more.',
      'the edit reached the parent, but not as the Markdown that would be stored'
    );

    await act(async () => root.unmount());
    container.remove();
  });
});
