import { JSDOM } from 'jsdom';

/**
 * Installs a jsdom window as the Node globals React needs, and returns the
 * function that puts everything back.
 *
 * Test-only. Extracted from GalleryUploader.test.tsx for the calendar test;
 * the two older DOM tests still carry their own copies and can move to this
 * when they are next touched.
 *
 * `defineProperty`, not assignment — several of these, `navigator` above all,
 * are getter-only on the Node global in current versions, so a plain
 * assignment throws rather than shadowing. React itself must be imported
 * **after** this runs (dynamically, inside the test), because react-dom reads
 * `window` and `document` when its module first evaluates.
 */
export function installJsdom(): () => void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const g = globalThis as unknown as Record<string, unknown>;
  const saved = new Map<string, PropertyDescriptor | undefined>();

  function install(name: string, value: unknown) {
    saved.set(name, Object.getOwnPropertyDescriptor(g, name));

    Object.defineProperty(g, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  const names = [
    'navigator',
    'HTMLElement',
    'HTMLButtonElement',
    'Element',
    'Node',
    'DocumentFragment',
    'Range',
    'Event',
    'KeyboardEvent',
    'MouseEvent',
    'MutationObserver',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ];

  for (const name of names) {
    const value = (dom.window as unknown as Record<string, unknown>)[name];

    if (value === undefined) continue;

    install(name, typeof value === 'function' && !/^[A-Z]/.test(name) ? value.bind(dom.window) : value);
  }

  // React checks this before allowing `act()`.
  install('IS_REACT_ACT_ENVIRONMENT', true);
  install('window', dom.window);
  install('document', dom.window.document);

  return () => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(g, name, descriptor);
      else delete g[name];
    }

    dom.window.close();
  };
}
