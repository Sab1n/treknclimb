'use client';

/**
 * The browser half of a signed Cloudinary upload.
 *
 * Shared by the trip gallery and every single-image field. Nothing here reads
 * a Cloudinary credential — it asks `/api/admin/uploads/sign` for a signature
 * and posts the file with it, so `CLOUDINARY_API_SECRET` never enters the
 * bundle.
 *
 * The file goes **browser → Cloudinary directly**. Relaying it through a route
 * handler would mean a 6 MB photo hitting a serverless request-body limit and
 * the bandwidth paid for twice.
 */

/*
 * Checked before the file leaves the browser. Cloudinary enforces its own
 * limits, but finding out after a 20 MB upload has been pushed over a hotel
 * wifi connection in Pokhara is a worse way to learn it.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];

/**
 * Which collection the record belongs to. The server checks this too.
 *
 * **Deliberately duplicated from `UPLOAD_COLLECTIONS` in `lib/cloudinary.ts`
 * rather than imported.** That module pulls in the Cloudinary SDK, which holds
 * the API secret and must never reach a Client Component — importing the type
 * from it would drag the whole runtime into the browser bundle. The cost is
 * that the two lists can drift: adding a collection means editing both, and
 * the server rejects anything the canonical list does not have, so the failure
 * is a refused upload rather than a silent one.
 */
export type UploadCollection =
  | 'trips'
  | 'activities'
  | 'destinations'
  | 'testimonials'
  | 'team'
  | 'blog'
  | 'regions';

/** What Cloudinary returns. Only these two fields are used. */
interface CloudinaryUploadResponse {
  public_id?: string;
  error?: { message?: string };
}

/**
 * Thrown when the deployment has no Cloudinary credentials.
 *
 * Distinguished from an ordinary failure because it is not about this file and
 * will not be fixed by retrying — the caller surfaces it once, at the top of
 * the form, rather than against every image in a batch.
 */
export class UploadNotConfiguredError extends Error {}

/** Rejects a file the upload would certainly refuse. Returns null when fine. */
export function checkFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `${file.type || 'That file type'} is not an image Cloudinary will take. Use JPEG, PNG, WebP or AVIF.`;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `${(file.size / 1024 / 1024).toFixed(1)} MB is over the 10 MB limit. Resize it first.`;
  }

  return null;
}

/**
 * Uploads one file and resolves to its Cloudinary public ID.
 *
 * Throws on failure, so every caller has to decide what a failure means rather
 * than receiving a falsy value it might forget to check.
 */
export async function uploadImage(
  collection: UploadCollection,
  /**
   * The record's id, or `{ newSlug }` for one that does not exist yet — an
   * activity's cover image is required and has no draft state to wait in, so
   * the create form uploads before saving.
   */
  target: string | { newSlug: string },
  file: File
): Promise<string> {
  const signResponse = await fetch('/api/admin/uploads/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      typeof target === 'string'
        ? { collection, id: target }
        : { collection, newSlug: target.newSlug }
    ),
  });

  if (!signResponse.ok) {
    const body = await signResponse.json().catch(() => ({}));

    if (signResponse.status === 503) {
      throw new UploadNotConfiguredError(
        body.error ?? 'Image upload is not configured.'
      );
    }

    throw new Error(body.error ?? 'Could not authorise the upload.');
  }

  const signature = await signResponse.json();

  /*
   * These fields and no others.
   *
   * Cloudinary rebuilds the signature from the parameters it receives —
   * excluding file, api_key, resource_type and cloud_name — so one extra field
   * makes the rebuilt signature disagree and the upload fails with a 401 that
   * explains nothing. This list is the contract with `signUpload`.
   */
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('public_id', signature.publicId);
  form.append('overwrite', 'false');
  form.append('signature', signature.signature);

  const uploadResponse = await fetch(signature.uploadUrl, {
    method: 'POST',
    body: form,
  });

  const result: CloudinaryUploadResponse = await uploadResponse
    .json()
    .catch(() => ({}));

  if (!uploadResponse.ok || !result.public_id) {
    throw new Error(result.error?.message ?? 'Cloudinary rejected the file.');
  }

  return result.public_id;
}

/**
 * A delivery URL for a stored public ID, or null.
 *
 * Built by hand rather than through `next-cloudinary`, which `types/dto.ts`
 * warns against value-importing into a Client Component. A plain `img` on a
 * delivery URL needs no SDK: `f_auto,q_auto` lets Cloudinary choose format and
 * quality, and `c_fill,g_auto` crops to the box with face-aware framing.
 *
 * `NEXT_PUBLIC_` is correct for the cloud name — it is in every delivery URL on
 * the public site already, so it is not a secret and never was.
 */
export function previewUrl(publicId: string, width: number): string | null {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  if (!publicId || !cloudName) return null;

  return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,g_auto,f_auto,q_auto,w_${width}/${publicId}`;
}
