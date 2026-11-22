// The blob store (docs/specs/006-document/blob-store.md): a file's bytes held exactly in the `FILES` bucket, an
// object a blob, named by its owner and its key (the bytes' SHA-256), so one owner's equal files are stored once
// and two owners never share an object. The store itself verifies the key against the bytes as they are stored.
import type { BlobKey } from '@livedoc/document';

/** A named reason the blob store refuses ("Refusals"), with its status. */
export const BLOB_STORE_REFUSALS = {
  files_unavailable: 503,
  file_too_large: 413,
  length_required: 411,
  key_invalid: 400,
  key_mismatch: 422,
  blob_not_held: 404,
  range_not_satisfiable: 416,
  store_failed: 502,
} as const;
export type BlobStoreRefusal = keyof typeof BLOB_STORE_REFUSALS;

/** The object a blob is: the owner's id, then the key. */
export const blobObjectName = (ownerId: string, key: BlobKey): string => `${ownerId}/${key}`;

/** The size of the blob the owner holds under the key, or null when they hold none: what an upload begins by asking. */
export async function heldBlobSize(
  bucket: R2Bucket,
  ownerId: string,
  key: BlobKey,
): Promise<number | null> {
  return (await bucket.head(blobObjectName(ownerId, key)))?.size ?? null;
}

// Object storage's own word for bytes that do not hash to the checksum given (its error 10037).
const CHECKSUM_MISMATCH = /10037|checksum/i;

/**
 * Stores the bytes under the key for the owner, streamed, never held in memory. Object storage is handed the key
 * as the SHA-256 the bytes must have, so bytes that do not hash to it are refused there and nothing is kept.
 */
export async function storeBlob(
  bucket: R2Bucket,
  ownerId: string,
  key: BlobKey,
  body: ReadableStream,
): Promise<'stored' | 'key_mismatch' | 'store_failed'> {
  try {
    await bucket.put(blobObjectName(ownerId, key), body, { sha256: key });
    return 'stored';
  } catch (err) {
    if (CHECKSUM_MISMATCH.test(String(err))) return 'key_mismatch';
    console.error(`[blob-store] put failed key=${key.slice(0, 8)}`, err);
    return 'store_failed';
  }
}

/** The bytes of a range read: where they start and how many. */
export type ByteRange = { readonly offset: number; readonly length: number };

const RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * The one range a `Range` header asks of a blob of `size` bytes: the range, `unsatisfiable` when it lies past the
 * blob's end, or null for no header and for what a server may ignore (another unit, several ranges, no numbers).
 */
export function byteRangeOf(
  header: string | null,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  const match = header === null ? null : RANGE.exec(header.trim());
  if (!match) return null;
  const [, first, last] = match;
  if (first === '' && last === '') return null;
  if (first === '') {
    // The last N bytes.
    const suffix = Number(last);
    if (suffix === 0) return 'unsatisfiable';
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const offset = Number(first);
  if (!Number.isSafeInteger(offset) || offset >= size) return 'unsatisfiable';
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  if (!Number.isSafeInteger(end) || end < offset) return null;
  return { offset, length: end - offset + 1 };
}

/** A held blob's bytes, whole or one range of them; null when object storage does not have the object. */
export async function readBlob(
  bucket: R2Bucket,
  ownerId: string,
  key: BlobKey,
  range: ByteRange | null,
): Promise<ReadableStream | null> {
  const object = await bucket.get(blobObjectName(ownerId, key), range ? { range } : undefined);
  return object ? object.body : null;
}
