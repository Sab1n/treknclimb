'use client';

import { useRef, useState } from 'react';

import type { GalleryRow } from '../../../types/tripEditor';
import { newRowKey } from '../../../types/tripEditor';
import { RepeatableList, updateRow } from './RepeatableList';
import { TextField } from '../fields';
import {
  uploadImage,
  checkFile,
  previewUrl,
  UploadNotConfiguredError,
  ACCEPTED_IMAGE_TYPES,
} from '../upload';

/**
 * The gallery editor: cover image, multi-upload, drag-to-reorder, alt text.
 *
 * ## The file never passes through our server
 *
 * The flow is: ask our `/api/admin/uploads/sign` for a signature, then POST the
 * file **directly to Cloudinary** with it. `CLOUDINARY_API_SECRET` stays on the
 * server and nothing in this file has ever seen it — the browser receives a
 * signature valid for one upload to one public ID, and an `api_key`, which is a
 * public identifier by design.
 *
 * Relaying the file through a route handler instead would mean a 6 MB photo
 * hitting a serverless request-body limit, and paying for the bandwidth twice.
 *
 * **The browser does not choose the public ID.** It sends a trip id; the server
 * derives `treknclimb/trips/<slug>/<random>` from that trip's slug. If the
 * client named the destination and the server signed it, an admin session could
 * sign an upload over `treknclimb/destinations/nepal` — a signed endpoint that
 * signs anything asked of it is an unsigned one with extra steps.
 *
 * ## One failure does not take the form down
 *
 * Uploads run one at a time and each is tracked separately. A file that fails —
 * network, file too large, Cloudinary rejecting the type — records its own
 * error and the others carry on. Nothing about a failed upload touches the
 * fields already filled in, which matters because this tab sits inside a form
 * holding an hour of itinerary work.
 *
 * ## Alt text is required, and collected at upload time
 *
 * The model requires it, the Zod schema requires it, and this asks for it the
 * moment an image arrives — because an empty alt field on a freshly uploaded
 * image is the one an editor fills in, while the same field found three days
 * later, on an image whose subject they no longer remember, is the one that
 * gets `"image"` typed into it.
 */

interface PendingUpload {
  id: string;
  filename: string;
  status: 'uploading' | 'failed';
  error?: string;
}

export default function GalleryUploader({
  tripId,
  coverImage,
  coverImageAlt,
  gallery,
  errors,
  onCoverChange,
  onCoverAltChange,
  onGalleryChange,
}: {
  tripId: string;
  coverImage: string;
  coverImageAlt: string;
  gallery: GalleryRow[];
  errors: Record<string, string>;
  onCoverChange: (publicId: string) => void;
  onCoverAltChange: (alt: string) => void;
  onGalleryChange: (rows: GalleryRow[]) => void;
}) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null, target: 'cover' | 'gallery') {
    if (!files || files.length === 0) return;

    setConfigError(null);

    /*
     * Sequential, not `Promise.all`. Each upload needs its own signature, so a
     * parallel batch of twelve would fire twelve signing requests at once and
     * then twelve uploads — enough to saturate an office connection and make
     * every one of them slower. One at a time also means the progress list
     * reads in a sensible order.
     */
    for (const file of Array.from(files)) {
      const id = newRowKey('upload');

      const rejection = checkFile(file);

      if (rejection) {
        setPending((current) => [
          ...current,
          { id, filename: file.name, status: 'failed', error: rejection },
        ]);
        continue;
      }

      setPending((current) => [
        ...current,
        { id, filename: file.name, status: 'uploading' },
      ]);

      try {
        const publicId = await uploadImage('trips', tripId, file);

        // Success: drop it from the pending list and add the real row.
        setPending((current) => current.filter((item) => item.id !== id));

        if (target === 'cover') {
          onCoverChange(publicId);
        } else {
          /*
           * Appended with empty alt text, which is invalid until filled in —
           * deliberately. The row appears immediately with its alt field
           * flagged, so the requirement is visible at the moment the editor is
           * looking at the image rather than at save time.
           */
          onGalleryChange([
            ...gallery,
            { key: newRowKey('img'), url: publicId, alt: '', caption: '' },
          ]);
        }
      } catch (error) {
        /*
         * A missing Cloudinary configuration is not about this file and will
         * not be fixed by retrying, so it is surfaced once at the top of the
         * tab rather than against every image in the batch.
         */
        if (error instanceof UploadNotConfiguredError) {
          setConfigError(error.message);
        }

        /*
         * The failure is recorded against this file and nothing else is
         * touched. The rest of the form — and any image that uploaded
         * successfully before this one — is untouched.
         */
        setPending((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'failed',
                  error:
                    error instanceof Error
                      ? error.message
                      : 'The upload failed.',
                }
              : item
          )
        );
      }
    }

    /*
     * Clearing the input matters: a file input holds its selection, so
     * re-picking the same file after a failure would fire no `change` event at
     * all and look like the retry did nothing.
     */
    if (fileInput.current) fileInput.current.value = '';
  }

  const missingAlt = gallery.filter((image) => image.alt.trim() === '').length;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      {configError && (
        <p role="alert" className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {configError}
        </p>
      )}

      {/* ---------------- cover ---------------- */}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-base font-extrabold tracking-display">
            Cover image
          </h2>
          <p className="mt-1 text-sm text-muted">
            The card image, the hero, and the fallback for the social preview.
            Required.
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <Thumb publicId={coverImage} />

          <div className="flex min-w-60 flex-1 flex-col gap-4">
            <UploadButton
              label={coverImage ? 'Replace cover image' : 'Upload a cover image'}
              onFiles={(files) => handleFiles(files, 'cover')}
            />

            <TextField
              label="Cover image reference"
              id="coverImage"
              required
              mono
              value={coverImage}
              onChange={onCoverChange}
              error={errors.coverImage}
              hint="The Cloudinary public ID. Set by the upload — edit it only if you know what you are pointing at."
            />

            <TextField
              label="Cover alt text"
              id="coverImageAlt"
              required
              value={coverImageAlt}
              onChange={onCoverAltChange}
              error={errors.coverImageAlt}
              hint="What the image shows, for a reader who cannot see it. Not a caption, and not the trip name again."
            />
          </div>
        </div>
      </section>

      {/* ---------------- gallery ---------------- */}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-base font-extrabold tracking-display">
            Gallery
          </h2>
          <p className="mt-1 text-sm text-muted">
            Shown in the trip page mosaic, in this order. Drag a row, or use the
            arrows.
          </p>
        </div>

        <UploadButton
          label="Upload images"
          multiple
          inputRef={fileInput}
          onFiles={(files) => handleFiles(files, 'gallery')}
        />

        {/* ---------------- per-file progress ---------------- */}

        {pending.length > 0 && (
          <ul className="flex flex-col gap-2">
            {pending.map((item) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-center gap-x-3 rounded border px-4 py-2 text-sm ${
                  item.status === 'failed'
                    ? 'border-error/30 bg-error/5'
                    : 'border-hairline bg-white'
                }`}
              >
                <span className="font-mono text-xs">{item.filename}</span>

                {item.status === 'uploading' ? (
                  <span role="status" className="text-muted">
                    Uploading…
                  </span>
                ) : (
                  <>
                    <span className="text-error">{item.error}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPending((current) =>
                          current.filter((entry) => entry.id !== item.id)
                        )
                      }
                      className="ml-auto text-xs underline underline-offset-4"
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {missingAlt > 0 && (
          <p role="status" className="rounded border border-marigold/40 bg-marigold/10 px-4 py-3 text-sm">
            {missingAlt} {missingAlt === 1 ? 'image needs' : 'images need'} alt
            text. Alt text is required on every image before the trip can save —
            this will block it.
          </p>
        )}

        <RepeatableList
          rows={gallery}
          onChange={onGalleryChange}
          label="Gallery images"
          rowLabel={(image, index) =>
            image.alt.trim() !== '' ? image.alt : `Image ${index + 1}`
          }
          empty={<>No gallery images. The cover image is used on its own.</>}
        >
          {(image, index) => (
            <div className="flex flex-wrap gap-4">
              <Thumb publicId={image.url} small />

              <div className="flex min-w-60 flex-1 flex-col gap-4">
                <TextField
                  label="Alt text"
                  id={`gallery-${image.key}-alt`}
                  required
                  value={image.alt}
                  onChange={(value) =>
                    onGalleryChange(updateRow(gallery, image.key, { alt: value }))
                  }
                  error={errors[`gallery.${index}.alt`]}
                />

                <TextField
                  label="Caption"
                  id={`gallery-${image.key}-caption`}
                  value={image.caption}
                  onChange={(value) =>
                    onGalleryChange(
                      updateRow(gallery, image.key, { caption: value })
                    )
                  }
                  error={errors[`gallery.${index}.caption`]}
                  hint="Optional, and shown to everyone — unlike alt text."
                />

                <p className="font-mono text-xs break-all text-muted">
                  {image.url}
                </p>
              </div>
            </div>
          )}
        </RepeatableList>
      </section>
    </div>
  );
}

/**
 * A file picker dressed as a button.
 *
 * A bare `input type="file"` cannot be styled, so the input is visually hidden
 * and a real `button` triggers it. **Not `display: none`** — a hidden input is
 * removed from the accessibility tree, and the label would then point at
 * nothing. `sr-only` keeps it reachable.
 */
function UploadButton({
  label,
  multiple,
  onFiles,
  inputRef,
}: {
  label: string;
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const fallback = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? fallback;

  return (
    <div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper"
      >
        {label}
      </button>

      <input
        ref={ref}
        type="file"
        multiple={multiple}
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        aria-label={label}
        onChange={(event) => onFiles(event.target.files)}
        className="sr-only"
      />
    </div>
  );
}

/**
 * A preview of a stored Cloudinary image.
 *
 * The URL comes from `../upload`, which builds it by hand rather than through
 * `next-cloudinary` — that package is what `types/dto.ts` warns against
 * value-importing into a Client Component.
 */
function Thumb({ publicId, small }: { publicId: string; small?: boolean }) {
  const size = small ? 'w-28 h-20' : 'w-44 h-32';
  const url = previewUrl(publicId, small ? 224 : 352);

  if (!url) {
    return (
      <div
        className={`${size} flex shrink-0 items-center justify-center rounded border border-dashed border-hairline bg-paper text-xs text-muted`}
      >
        {publicId ? 'No preview' : 'No image'}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      /*
       * Empty alt, deliberately. This is a preview sitting directly beside the
       * alt-text field that describes the same image — announcing it twice is
       * noise, and putting the editor's draft alt text here would make a screen
       * reader read back whatever half-typed string is in the box.
       */
      alt=""
      className={`${size} shrink-0 rounded border border-hairline object-cover`}
    />
  );
}
