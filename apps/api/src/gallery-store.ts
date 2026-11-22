// Storing one image in an owner's gallery (docs/specs/009-elements/images.md "Size cap", "Dedupe"): the checks every
// upload meets, wherever its bytes come from: an upload's body (routes/images.ts) or a picture of a file opened
// (docs/specs/034-text-documents/objects.md "Where the bytes live"). Pure of HTTP: it answers what happened, and the
// caller says it in its own words.
import { sha256Hex, type ImageSummary } from '@livedoc/api-schema';
import { findImageBySha, imageTotalsByOwner, insertImage } from './db';
import { sniffImageType } from './image-sniff';
import { stripJpegMetadata } from './image-strip';
import { MAX_IMAGE_BYTES } from './limits';
import { parsePositiveCap } from './positive-cap';
import type { Env } from './types';

export type GalleryCaps = { maxImages: number | null; maxBytes: number | null };

/** A full gallery: which cap the upload would cross, the cap, and what the gallery holds of it. */
export type GalleryFull = {
  error: 'gallery_full';
  reason: 'count' | 'bytes';
  limit: number;
  current: number;
};

export type GalleryStoreRefusal =
  | { error: 'file_too_large'; limitBytes: number }
  | { error: 'unsupported_type' }
  | { error: 'malformed_jpeg' }
  | { error: 'upload_conflict' }
  | GalleryFull;

export type GalleryStoreResult =
  { ok: true; image: ImageSummary; deduped: boolean } | ({ ok: false } & GalleryStoreRefusal);

/** The owner's caps, from the deployment's settings; none when unset (a self-hoster's default). */
/** Whether the deployment keeps images: without it every gallery route answers `images_unavailable`. */
export const hasImageStore = <E extends Env>(env: E): env is E & { IMAGES: R2Bucket } =>
  Boolean(env.IMAGES);

export const galleryCaps = (env: Env): GalleryCaps => ({
  maxImages: parsePositiveCap(env.IMAGE_MAX_PER_OWNER),
  maxBytes: parsePositiveCap(env.IMAGE_MAX_BYTES_PER_OWNER),
});

/** The cap an upload of `incomingBytes` would cross, or null when it fits. */
export function galleryFull(
  caps: GalleryCaps,
  totals: { count: number; bytes: number },
  incomingBytes: number,
): GalleryFull | null {
  if (caps.maxImages !== null && totals.count >= caps.maxImages)
    return { error: 'gallery_full', reason: 'count', limit: caps.maxImages, current: totals.count };
  if (caps.maxBytes !== null && totals.bytes + incomingBytes > caps.maxBytes)
    return { error: 'gallery_full', reason: 'bytes', limit: caps.maxBytes, current: totals.bytes };
  return null;
}

/** Whether the owner's gallery has room for `incomingBytes` more: a cheap check before bytes are read. */
export async function galleryRoom(
  env: Env,
  ownerId: string,
  incomingBytes: number,
): Promise<GalleryFull | null> {
  const caps = galleryCaps(env);
  if (caps.maxImages === null && caps.maxBytes === null) return null;
  return galleryFull(caps, await imageTotalsByOwner(env, ownerId), incomingBytes);
}

/**
 * Stores the bytes as the owner's gallery image: the size cap, the type its first bytes are (which must be the one
 * declared), dedupe on the owner and the SHA-256 of the bytes, JPEG metadata stripped, the bytes put before the row,
 * and the caps refused atomically by the insert. Bytes no row names are never left behind.
 * Answers the image, or why it was refused. The caller needs `env.IMAGES`.
 */
export async function storeGalleryImage(
  env: Env & { IMAGES: R2Bucket },
  ownerId: string,
  input: {
    bytes: ArrayBuffer;
    contentType: string;
    width: number;
    height: number;
    originalName: string | null;
  },
): Promise<GalleryStoreResult> {
  const { bytes } = input;
  if (bytes.byteLength > MAX_IMAGE_BYTES)
    return { ok: false, error: 'file_too_large', limitBytes: MAX_IMAGE_BYTES };
  const sniffed = sniffImageType(new Uint8Array(bytes.slice(0, 16)));
  if (!sniffed || sniffed !== input.contentType) return { ok: false, error: 'unsupported_type' };
  // The ORIGINAL bytes are hashed (the client's X-Image-Sha256 is of them too), so the same file dedupes
  // predictably though the stored bytes may lose a JPEG's metadata.
  const sha = await sha256Hex(bytes);
  const existing = await findImageBySha(env, ownerId, sha);
  if (existing) return { ok: true, image: existing, deduped: true };
  // EXIF GPS, camera serial, JFIF / ICC / comment markers leave before the bytes are kept (image-strip.ts); a
  // malformed JPEG is refused rather than kept with what it would leak.
  let stored: ArrayBuffer = bytes;
  if (sniffed === 'image/jpeg') {
    try {
      stored = stripJpegMetadata(bytes);
    } catch {
      return { ok: false, error: 'malformed_jpeg' };
    }
  }
  const caps = galleryCaps(env);
  const id = crypto.randomUUID();
  await env.IMAGES.put(id, stored, {
    httpMetadata: { contentType: sniffed },
    customMetadata: { ownerId, originalName: input.originalName ?? '' },
  });
  let image: ImageSummary | null;
  try {
    image = await insertImage(
      env,
      {
        id,
        ownerId,
        contentType: sniffed,
        byteSize: stored.byteLength,
        width: input.width,
        height: input.height,
        sha256: sha,
        originalName: input.originalName,
      },
      caps,
    );
  } catch (err) {
    // No row will ever name these bytes, and the retention sweep only walks rows: never leave them.
    await env.IMAGES.delete(id);
    throw err;
  }
  if (image) return { ok: true, image, deduped: false };
  // The insert refused: our bytes are an orphan either way.
  await env.IMAGES.delete(id);
  // The same bytes stored at the same moment (a file dropped twice, two tabs): the other's row won, as a dedupe.
  const raced = await findImageBySha(env, ownerId, sha);
  if (raced) {
    console.info('[images] racing upload of the same bytes deduped', { owner: ownerId });
    return { ok: true, image: raced, deduped: true };
  }
  // A concurrent upload filled the gallery after the caller's check; the insert refused atomically.
  console.info('[images] cap refused a racing upload', { owner: ownerId });
  const full = galleryFull(caps, await imageTotalsByOwner(env, ownerId), stored.byteLength);
  // Room again already (an image was deleted meanwhile): the caller may retry.
  return full ? { ok: false, ...full } : { ok: false, error: 'upload_conflict' };
}
