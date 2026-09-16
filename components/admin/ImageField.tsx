'use client';

import { useRef, useState } from 'react';

import { TextField } from './fields';
import {
  uploadImage,
  checkFile,
  previewUrl,
  UploadNotConfiguredError,
  ACCEPTED_IMAGE_TYPES,
  type UploadCollection,
} from './upload';

/**
 * One image plus its alt text, with a signed upload behind it.
 *
 * Used by the activity, destination and testimonial editors — everywhere a
 * record has a single cover image rather than a gallery. The trip gallery has
 * its own component because it manages an ordered list; this manages one field.
 *
 * ## Alt text lives here, not next to it
 *
 * The image and its alt text are one control, deliberately. CLAUDE.md requires
 * alt text on every image before save, and the reliable way to get it is to ask
 * at the moment the image arrives — an empty alt field beside a photo someone
 * just chose gets filled in; the same field found three days later, on an image
 * whose subject nobody remembers, gets `"image"` typed into it.
 *
 * When the image is optional the alt text is required **only once there is an
 * image**, which is the same rule the models apply (`Testimonial.photoAlt`,
 * `IItineraryDay.imageAlt`). A required marker that appears when a photo is
 * added is the honest rendering of that.
 *
 * ## A failed upload changes nothing else
 *
 * The error is held here and the surrounding form is untouched, which matters
 * because these editors hold work that is not saved yet. A configuration
 * failure is reported separately from a file failure — it is not about this
 * file and retrying will not fix it.
 */
export default function ImageField({
  label,
  id,
  collection,
  recordId,
  publicId,
  alt,
  onPublicIdChange,
  onAltChange,
  required = false,
  hint,
  errors = {},
  publicIdField,
  altField,
}: {
  label: string;
  id: string;
  collection: UploadCollection;
  /**
   * The record the image belongs to — its id, or `{ newSlug }` when it has
   * not been saved yet. Decides the Cloudinary folder either way.
   */
  recordId: string | { newSlug: string };
  publicId: string;
  alt: string;
  onPublicIdChange: (value: string) => void;
  onAltChange: (value: string) => void;
  /** True when the image itself is mandatory, not just its alt text. */
  required?: boolean;
  hint?: string;
  errors?: Record<string, string>;
  /** Field names the server keys its errors by. */
  publicIdField: string;
  altField: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    setFileError(null);
    setConfigError(null);

    const rejection = checkFile(file);

    if (rejection) {
      setFileError(rejection);
      return;
    }

    setUploading(true);

    try {
      onPublicIdChange(await uploadImage(collection, recordId, file));
    } catch (error) {
      if (error instanceof UploadNotConfiguredError) {
        setConfigError(error.message);
      } else {
        setFileError(
          error instanceof Error ? error.message : 'The upload failed.'
        );
      }
    } finally {
      setUploading(false);

      /*
       * Clearing the input matters: a file input holds its selection, so
       * re-picking the same file after a failure fires no `change` event at all
       * and looks like the retry did nothing.
       */
      if (input.current) input.current.value = '';
    }
  }

  const preview = previewUrl(publicId, 352);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            /*
             * Empty alt, deliberately. This is a preview sitting directly
             * beside the field that describes the same image — announcing it
             * twice is noise, and echoing the editor's half-typed alt text back
             * would have a screen reader read a draft aloud.
             */
            alt=""
            className="h-32 w-44 shrink-0 rounded border border-hairline object-cover"
          />
        ) : (
          <div className="flex h-32 w-44 shrink-0 items-center justify-center rounded border border-dashed border-hairline bg-paper text-xs text-muted">
            {publicId ? 'No preview' : 'No image'}
          </div>
        )}

        <div className="flex min-w-60 flex-1 flex-col gap-4">
          <div>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={uploading}
              className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ink hover:text-paper disabled:opacity-50"
            >
              {uploading
                ? 'Uploading…'
                : publicId
                  ? `Replace ${label.toLowerCase()}`
                  : `Upload ${label.toLowerCase()}`}
            </button>

            {/*
              Visually hidden rather than `display: none`. A hidden input is
              removed from the accessibility tree entirely, and its label would
              then point at nothing.
            */}
            <input
              ref={input}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              aria-label={`Upload ${label}`}
              onChange={(event) => handleFile(event.target.files?.[0])}
              className="sr-only"
            />
          </div>

          {fileError && (
            <p role="alert" className="text-sm text-error">
              {fileError}
            </p>
          )}

          {configError && (
            <p
              role="alert"
              className="rounded border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
            >
              {configError}
            </p>
          )}

          <TextField
            label={`${label} reference`}
            id={id}
            required={required}
            mono
            value={publicId}
            onChange={onPublicIdChange}
            error={errors[publicIdField]}
            hint={
              hint ??
              'The Cloudinary public ID. Set by the upload — edit it only if you know what you are pointing at.'
            }
          />

          <TextField
            label={`${label} alt text`}
            id={`${id}-alt`}
            /*
             * Required exactly when there is an image to describe — the same
             * condition the model applies. On a record whose image is itself
             * mandatory this is always true.
             */
            required={required || publicId.trim() !== ''}
            value={alt}
            onChange={onAltChange}
            error={errors[altField]}
            hint="What the image shows, for a reader who cannot see it. Not a caption, and not the record's name again."
          />
        </div>
      </div>
    </section>
  );
}
