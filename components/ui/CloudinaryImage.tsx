import Image from 'next/image';
import { getCldImageUrl } from 'next-cloudinary';

/**
 * A Cloudinary-backed image that renders entirely on the server.
 *
 * `CldImage` cannot be used here: next-cloudinary ships it without a
 * `"use client"` directive even though it calls `useState`, so rendering it
 * from a Server Component fails the build outright. `getCldImageUrl` is a pure
 * function with no hooks, so it builds the transformed URL server-side and
 * `next/image` takes it from there — same CDN, same transformations, no
 * client JavaScript.
 *
 * If `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is missing, `getCldImageUrl` throws.
 * Rather than take the page down, that falls back to the styled placeholder
 * CLAUDE.md requires for an image that will not load.
 */
interface CloudinaryImageProps {
  /** Cloudinary public ID, e.g. treknclimb/destinations/nepal */
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Responsive hint for next/image — which slot width to expect per breakpoint. */
  sizes?: string;
  className?: string;
  priority?: boolean;
}

export default function CloudinaryImage({
  src,
  alt,
  width,
  height,
  sizes,
  className,
  priority = false,
}: CloudinaryImageProps) {
  let url: string | null = null;

  try {
    url = getCldImageUrl({
      src,
      width,
      height,
      crop: { type: 'fill', gravity: 'auto', source: true },
    });
  } catch {
    url = null;
  }

  if (!url) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-hairline text-muted ${className ?? ''}`}
      >
        <span className="px-4 text-center text-xs">{alt}</span>
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );
}
