import { v2 as cloudinary } from 'cloudinary';
import { randomBytes } from 'crypto';

/**
 * Signed Cloudinary uploads.
 *
 * **Server only. This module reads `CLOUDINARY_API_SECRET`, so nothing that
 * imports it may ever be pulled into a Client Component.** The uploader is a
 * Client Component and imports none of this — it calls the sign endpoint and
 * gets back a signature, never a key.
 *
 * ## Why signed rather than unsigned
 *
 * An unsigned upload preset is a URL anyone can find in the page source and
 * POST to. It costs nothing to discover and nothing to abuse: the account pays
 * for storage and bandwidth for whatever strangers decide to put in it. A
 * signed upload requires a signature this server produced, so every upload is
 * one an authenticated admin asked for.
 *
 * The file itself still goes **browser → Cloudinary directly**, never through
 * this server. A 6 MB photo relayed through a serverless function is a
 * request-body limit waiting to be hit and a cost paid twice.
 *
 * ## The client does not choose the public ID
 *
 * This is the part that is easy to get wrong. If the browser sends the public
 * ID and the server signs whatever it is handed, an admin — or anything with an
 * admin session — can sign an upload to `treknclimb/destinations/nepal` and
 * overwrite the Nepal hero image. The ID is built here, from the record being
 * edited, and the caller supplies only which collection and which record.
 *
 * The collection is checked against a closed list for the same reason: it
 * becomes part of the path, so a free string would let one collection's editor
 * write into another's folder.
 */

/** Every asset lives under this prefix. Never Cloudinary's default filename. */
const ROOT_FOLDER = 'treknclimb';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Reads the configuration, or returns null.
 *
 * Null rather than a throw, so an unconfigured deployment degrades to "upload
 * unavailable" with an explanation instead of a 500 on a page that otherwise
 * works. The editor's other tabs do not need Cloudinary to function.
 */
export function cloudinaryConfig(): CloudinaryConfig | null {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ??
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) return null;

  return { cloudName, apiKey, apiSecret };
}

/**
 * Which collections may receive uploads, and the folder each one uses.
 *
 * A closed list, not a free string. The folder becomes part of the public ID,
 * so accepting whatever the caller sends would let an admin session write into
 * any folder in the account — including one holding another collection's
 * images. Adding a collection here is deliberate; passing an unknown one is a
 * rejected request.
 */
export const UPLOAD_COLLECTIONS = [
  'trips',
  'activities',
  'destinations',
  'testimonials',
  'team',
  'blog',
  'regions',
] as const;

export type UploadCollection = (typeof UPLOAD_COLLECTIONS)[number];

export function isUploadCollection(value: string): value is UploadCollection {
  return (UPLOAD_COLLECTIONS as readonly string[]).includes(value);
}

/**
 * Builds the public ID for an image.
 *
 * `treknclimb/<collection>/<segment>/<random>`. The prefix is required by
 * CLAUDE.md because Cloudinary's default is the uploaded filename, and two
 * collections both holding something called `nepal` would silently overwrite
 * each other.
 *
 * `segment` is the record's slug where it has one and its id where it does not
 * — testimonials have no slug, and a person's name is neither unique nor
 * stable enough to file images under.
 *
 * The random suffix rather than the filename: two photos called `IMG_2041.jpg`
 * from the same camera would otherwise collide, and Cloudinary's default
 * behaviour on a collision is to replace. Eight bytes of hex is short enough to
 * read in a URL and long enough that a collision is not a thing that happens.
 *
 * The segment is sanitised even though it comes from our own database — it
 * reaches a URL path, and a slug is admin-editable, so treating it as trusted
 * is a habit rather than a fact.
 */
export function imagePublicId(
  collection: UploadCollection,
  segment: string
): string {
  const safeSegment = segment
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${ROOT_FOLDER}/${collection}/${safeSegment}/${randomBytes(8).toString('hex')}`;
}

export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  publicId: string;
  uploadUrl: string;
}

/**
 * Signs one upload.
 *
 * ## The signature has to cover exactly what the browser sends
 *
 * Cloudinary rebuilds the signature from the parameters it receives, excluding
 * `file`, `api_key`, `resource_type` and `cloud_name`. If the browser adds any
 * other field — a tag, a folder, a context — the rebuilt signature will not
 * match and the upload fails with a 401 that says nothing useful about why.
 * So `signedParams` below is the contract: the uploader sends these and only
 * these, plus the file and the key.
 *
 * `overwrite: false` is deliberate. The public ID is random, so an overwrite
 * should be impossible; setting it false means that if the assumption is ever
 * wrong, the upload fails loudly rather than replacing an image silently.
 */
export function signUpload(
  collection: UploadCollection,
  segment: string
): UploadSignature | null {
  const config = cloudinaryConfig();

  if (!config) return null;

  const publicId = imagePublicId(collection, segment);
  // Cloudinary expects seconds, and rejects a timestamp more than an hour from
  // its own clock — so this is genuinely short-lived, not a token to cache.
  const timestamp = Math.round(Date.now() / 1000);

  const signedParams = {
    public_id: publicId,
    timestamp,
    overwrite: false,
  };

  const signature = cloudinary.utils.api_sign_request(
    signedParams,
    config.apiSecret
  );

  return {
    signature,
    timestamp,
    apiKey: config.apiKey,
    cloudName: config.cloudName,
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
  };
}

/**
 * Is this string a public ID we issued?
 *
 * The save route stores whatever the editor sends as an image reference, and
 * that value ends up interpolated into a Cloudinary URL on the public site. A
 * check that it looks like one of ours stops a stored value from pointing at
 * something else entirely — and rejects an absolute URL, which is the shape an
 * injected value would most likely take.
 *
 * Deliberately a shape check, not an existence check: asking Cloudinary whether
 * every image still exists on every save would be a network call per image on
 * the site's slowest write.
 */
export function isOwnPublicId(value: string): boolean {
  return /^treknclimb\/[a-z0-9-]+\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(value);
}
