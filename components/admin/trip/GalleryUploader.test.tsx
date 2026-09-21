import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * Does a multi-file upload keep every image?
 *
 * ## The bug this exists to prevent
 *
 * `handleFiles` uploads a batch **one file at a time**, and appended each
 * result with `onGalleryChange([...gallery, row])`. `gallery` is a prop, so
 * every iteration of that loop spread the array as it stood when the batch
 * started — each upload overwrote the previous one's row, and selecting five
 * images left exactly one: the last.
 *
 * Nothing about it looked broken. The progress list showed five files
 * completing, Cloudinary held five images, and the form showed one row. The
 * only symptom was four missing pictures.
 *
 * The fix is the updater form, `onGalleryChange((current) => [...current, row])`.
 * Reverting to the spread makes the count assertion below fail with 1.
 *
 * ## Why this needs a mounted component
 *
 * The bug lives in a closure over a prop held across an `await`. There is no
 * reducer to unit-test — the staleness is a property of React's render cycle,
 * which is only real once something is rendered. So: jsdom, a real root, real
 * `act()`.
 *
 * **`fetch` is stubbed, not `uploadImage`.** An ES module namespace is
 * read-only so the export cannot be reassigned, but stubbing a layer lower is
 * better anyway: the real `uploadImage` runs, including its signing round trip
 * and its FormData assembly, and only the network is fake.
 */

let cleanup: (() => void) | undefined;

before(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const g = globalThis as unknown as Record<string, unknown>;

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
    'File',
    'Blob',
    'FormData',
  ];

  const saved = new Map<string, PropertyDescriptor | undefined>();

  /*
   * `defineProperty`, not assignment — several of these, `navigator` above all,
   * are getter-only on the Node global in current versions, so a plain
   * assignment throws rather than shadowing.
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

  // React checks this before allowing `act()`; without it the warnings drown
  // the results.
  install('IS_REACT_ACT_ENVIRONMENT', true);

  install('window', dom.window);
  install('document', dom.window.document);

  // jsdom does not implement object URLs, and the thumbnail preview calls one.
  const urlCtor = dom.window.URL as unknown as Record<string, unknown>;
  urlCtor.createObjectURL = () => 'blob:stub';
  urlCtor.revokeObjectURL = () => {};

  cleanup = () => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(g, name, descriptor);
      else delete g[name];
    }

    dom.window.close();
  };
});

after(() => cleanup?.());

/**
 * Two legs per upload: our signing route, then Cloudinary.
 *
 * Both resolve after a tick. The await is the whole point — it is what lets a
 * captured prop go stale between files.
 */
function installFetchStub(): () => void {
  const original = globalThis.fetch;

  let issued = 0;

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    await new Promise((resolve) => setTimeout(resolve, 0));

    const url = String(input);

    if (url.includes('/api/admin/uploads/sign')) {
      issued += 1;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          signature: 'stub',
          timestamp: 1,
          apiKey: 'stub',
          cloudName: 'stub',
          publicId: `treknclimb/trips/test/img-${issued}`,
          uploadUrl: 'https://api.cloudinary.com/v1_1/stub/image/upload',
        }),
      } as unknown as Response;
    }

    /*
     * The Cloudinary leg echoes back the public ID it was handed rather than
     * inventing one, so the order assertion below is actually about order.
     */
    const form = init?.body as FormData | undefined;

    return {
      ok: true,
      status: 200,
      json: async () => ({ public_id: String(form?.get('public_id') ?? '') }),
    } as unknown as Response;
  }) as typeof fetch;

  return () => {
    globalThis.fetch = original;
  };
}

describe('gallery multi-upload', () => {
  test('a batch of five files produces five rows, not one', async () => {
    const { createElement, useState } = await import('react');
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');

    const restoreFetch = installFetchStub();

    const GalleryUploader = (await import('./GalleryUploader')).default;

    type Row = { key: string; url: string; alt: string; caption: string };

    let latest: Row[] = [];

    /*
     * A host that owns the gallery state the way TripEditor does, including
     * the functional-update path. Without a real parent holding state, a stale
     * closure has nothing to be stale against.
     */
    function Host() {
      const [gallery, setGallery] = useState<Row[]>([]);

      latest = gallery;

      return createElement(GalleryUploader, {
        tripId: '000000000000000000000000',
        coverImage: '',
        coverImageAlt: '',
        gallery,
        errors: {},
        onCoverChange: () => {},
        onCoverAltChange: () => {},
        onGalleryChange: (rows: Row[] | ((current: Row[]) => Row[])) =>
          setGallery((current) =>
            typeof rows === 'function' ? rows(current) : rows
          ),
      });
    }

    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Host));
    });

    // The gallery input is the one accepting several files at once.
    const inputs = Array.from(
      container.querySelectorAll('input[type="file"]')
    ) as HTMLInputElement[];

    const galleryInput = inputs.find((input) => input.multiple);

    assert.ok(galleryInput, 'expected a multi-file input for the gallery');

    const files = [1, 2, 3, 4, 5].map(
      (n) =>
        new File([`fake-image-${n}`], `photo-${n}.jpg`, { type: 'image/jpeg' })
    );

    /*
     * `files` on a file input is read-only, so the batch is installed with
     * defineProperty — indistinguishable from a real selection as far as the
     * change handler is concerned.
     */
    Object.defineProperty(galleryInput, 'files', {
      value: Object.assign(files, {
        item: (i: number) => files[i] ?? null,
      }) as unknown as FileList,
      configurable: true,
    });

    await act(async () => {
      galleryInput.dispatchEvent(new Event('change', { bubbles: true }));
      // Five sequential uploads, two awaited legs each.
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    assert.equal(
      latest.length,
      5,
      `expected all five uploads to be kept, got ${latest.length}. ` +
        'One means each append spread a stale `gallery` prop and overwrote the previous row.'
    );

    // Distinct, and in the order they were uploaded.
    assert.deepEqual(
      latest.map((row) => row.url),
      [1, 2, 3, 4, 5].map((n) => `treknclimb/trips/test/img-${n}`)
    );

    // Keys must be unique, or React reuses rows and the alt fields cross over.
    assert.equal(new Set(latest.map((row) => row.key)).size, 5);

    // Alt text starts empty on purpose — it is what flags the row as incomplete.
    assert.ok(latest.every((row) => row.alt === ''));

    await act(async () => root.unmount());

    restoreFetch();
  });
});
