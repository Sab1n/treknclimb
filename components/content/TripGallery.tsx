'use client';

import { useState, useEffect, useCallback } from 'react';

// `import type` only: a value import would pull next-cloudinary, which types/dto
// uses to build the URLs, into the client bundle. Type imports are erased.
import type { GalleryImageDTO } from '../../types/dto';

/**
 * Featured-image mosaic with a lightbox.
 *
 * The layout is chosen from the actual image count rather than poured into a
 * fixed grid, so there are never empty cells and never two images stretched
 * across five slots:
 *
 *   0      styled placeholder
 *   1      one full-width image
 *   2      two side by side
 *   3-4    featured image plus a stacked column of the rest
 *   5+     featured image plus a 2x2 grid, overflow count on the last tile
 *
 * Below `md` every arrangement collapses to a single column, featured first.
 */
export default function TripGallery({
  images,
  title,
}: {
  images: GalleryImageDTO[];
  title: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpenIndex((current) =>
        current === null
          ? null
          : (current + delta + images.length) % images.length
      ),
    [images.length]
  );

  // Escape closes, arrows navigate. Registered only while the lightbox is open.
  useEffect(() => {
    if (openIndex === null) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    }

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [openIndex, close, step]);

  if (images.length === 0) {
    return (
      <div className="flex aspect-[16/7] w-full items-center justify-center rounded-lg border border-dashed border-hairline bg-white">
        <p className="px-6 text-center text-sm text-muted">
          Photographs of this trip are being added.
        </p>
      </div>
    );
  }

  const [featured, ...rest] = images;

  /** How many tiles sit beside the featured image in each arrangement. */
  const tileCount = images.length >= 5 ? 4 : rest.length;
  const tiles = rest.slice(0, tileCount);
  const hiddenCount = images.length - 1 - tileCount;

  return (
    <>
      {/* One image: nothing to arrange. */}
      {images.length === 1 && (
        <Tile image={featured} onOpen={() => setOpenIndex(0)} className="aspect-[16/7]" priority />
      )}

      {/* Two images: equal halves. */}
      {images.length === 2 && (
        <div className="grid gap-2 md:grid-cols-2">
          {images.map((image, index) => (
            <Tile
              key={index}
              image={image}
              onOpen={() => setOpenIndex(index)}
              className="aspect-[4/3] md:aspect-[3/2]"
              priority={index === 0}
            />
          ))}
        </div>
      )}

      {/* Three or more: featured half, remainder beside it. */}
      {images.length >= 3 && (
        <div className="grid gap-2 md:grid-cols-2">
          <Tile
            image={featured}
            onOpen={() => setOpenIndex(0)}
            className="aspect-[4/3] md:aspect-auto md:h-full md:min-h-[22rem]"
            priority
          />

          {/*
            Class strings are written out in full rather than built from
            `tiles.length`. Tailwind scans source text for class names at build
            time, so `md:grid-rows-${n}` is never generated and silently does
            nothing.
          */}
          <div
            className={
              images.length >= 5
                ? 'grid grid-cols-2 gap-2'
                : tiles.length === 3
                  ? 'grid gap-2 md:grid-rows-3'
                  : 'grid gap-2 md:grid-rows-2'
            }
          >
            {tiles.map((image, index) => {
              const isLast = index === tiles.length - 1;

              return (
                <Tile
                  key={index}
                  image={image}
                  onOpen={() => setOpenIndex(index + 1)}
                  className="aspect-[4/3] md:aspect-auto md:h-full"
                  overlayCount={isLast && hiddenCount > 0 ? images.length : 0}
                />
              );
            })}
          </div>
        </div>
      )}

      {openIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photographs`}
          className="fixed inset-0 z-50 flex flex-col bg-ink/95 p-4"
          onClick={close}
        >
          <div className="flex items-center justify-between text-paper">
            <p className="font-mono text-sm tabular">
              {openIndex + 1} / {images.length}
            </p>
            <button
              type="button"
              onClick={close}
              className="rounded px-3 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Close
            </button>
          </div>

          <div
            className="flex flex-1 items-center justify-center gap-4"
            onClick={(event) => event.stopPropagation()}
          >
            <NavButton label="Previous photo" onClick={() => step(-1)}>
              ‹
            </NavButton>

            <figure className="flex max-h-full flex-col items-center gap-3">
              {images[openIndex].fullUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={images[openIndex].fullUrl!}
                  alt={images[openIndex].alt}
                  className="max-h-[75vh] w-auto rounded object-contain"
                />
              ) : (
                <div className="flex h-64 w-96 items-center justify-center rounded bg-white/10 px-6 text-center text-sm text-paper/70">
                  {images[openIndex].alt}
                </div>
              )}
              {images[openIndex].caption && (
                <figcaption className="text-sm text-paper/70">
                  {images[openIndex].caption}
                </figcaption>
              )}
            </figure>

            <NavButton label="Next photo" onClick={() => step(1)}>
              ›
            </NavButton>
          </div>
        </div>
      )}
    </>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="shrink-0 rounded-full px-4 py-3 text-3xl leading-none text-paper hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function Tile({
  image,
  onOpen,
  className,
  overlayCount = 0,
  priority = false,
}: {
  image: GalleryImageDTO;
  onOpen: () => void;
  className: string;
  overlayCount?: number;
  priority?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative w-full overflow-hidden rounded-lg bg-hairline ${className}`}
    >
      {image.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.thumbUrl}
          alt={image.alt}
          loading={priority ? 'eager' : 'lazy'}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-muted">
          {image.alt}
        </span>
      )}

      {overlayCount > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-ink/60 text-sm font-semibold text-paper">
          View all {overlayCount} photos
        </span>
      )}
    </button>
  );
}
