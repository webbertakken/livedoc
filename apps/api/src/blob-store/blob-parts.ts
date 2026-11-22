// A file in parts (docs/specs/006-document/blob-store.md "Getting bytes in"): the parts are put together under a
// name of the upload's own, and the whole is then stored under its key with the SHA-256 it must have, by storage
// itself. So no key ever names bytes that were not checked, and the api hashes nothing.
import type { BlobKey } from '@livedoc/document';
import { storeBlob } from './blob-store';

/** The object an upload's parts are put together as: never an owner's (an owner's id is never `uploads`). */
export const uploadObjectName = (uploadId: string): string => `uploads/${uploadId}`;

/** Begins object storage's own upload for the parts; its id, or null when storage did not begin one. */
export async function beginParts(bucket: R2Bucket, uploadId: string): Promise<string | null> {
  try {
    return (await bucket.createMultipartUpload(uploadObjectName(uploadId))).uploadId;
  } catch (err) {
    console.error(`[blob-store] parts begin failed upload=${uploadId}`, err);
    return null;
  }
}

/** Stores one part, streamed; the tag storage gave it, or null when storage did not take it. */
export async function storePart(
  bucket: R2Bucket,
  upload: { id: string; r2Upload: string },
  n: number,
  body: ReadableStream,
): Promise<string | null> {
  try {
    const part = await bucket
      .resumeMultipartUpload(uploadObjectName(upload.id), upload.r2Upload)
      .uploadPart(n, body);
    return part.etag;
  } catch (err) {
    console.error(`[blob-store] part failed upload=${upload.id} n=${n}`, err);
    return null;
  }
}

/**
 * Puts the parts together, then stores the whole as the object, checked against the key as a single request is.
 * Answers the bytes stored. Tried again after storage failed midway, it goes on from the parts already put
 * together. The upload's own object is gone once the whole is stored or refused.
 */
export async function completeParts(
  bucket: R2Bucket,
  upload: { id: string; r2Upload: string; parts: Readonly<Record<string, string>> },
  object: string,
  key: BlobKey,
): Promise<{ stored: number } | 'key_mismatch' | 'store_failed'> {
  const name = uploadObjectName(upload.id);
  try {
    if (!(await bucket.head(name))) {
      const parts = Object.entries(upload.parts)
        .map(([n, etag]) => ({ partNumber: Number(n), etag }))
        .sort((a, b) => a.partNumber - b.partNumber);
      await bucket.resumeMultipartUpload(name, upload.r2Upload).complete(parts);
    }
    const whole = await bucket.get(name);
    if (!whole) throw new Error('the parts put together are not there');
    const outcome = await storeBlob(bucket, object, key, whole.body);
    if (outcome === 'store_failed') return outcome;
    await bucket.delete(name);
    return outcome === 'stored' ? { stored: whole.size } : outcome;
  } catch (err) {
    console.error(`[blob-store] complete failed upload=${upload.id}`, err);
    return 'store_failed';
  }
}

/** Forgets an upload's parts: object storage's own upload, and the object they were put together as, if any. */
export async function abandonParts(
  bucket: R2Bucket,
  upload: { id: string; r2Upload: string },
): Promise<void> {
  const name = uploadObjectName(upload.id);
  try {
    await bucket.resumeMultipartUpload(name, upload.r2Upload).abort();
  } catch {
    // Already completed or aborted: storage has no such upload, which is what was wanted.
  }
  await bucket.delete(name);
}
