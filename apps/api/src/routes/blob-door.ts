// What the blob store's doors share (docs/specs/006-document/blob-store.md "Getting bytes in", "Refusals"): a
// refusal answered by name, an upload's door once opened, and the sizes refused before the first byte.
import { FILE_TAB_MAX_BYTES, type BlobKey } from '@livedoc/document';
import { allowanceLeft } from '../blob-store/allowance';
import { BLOB_STORE_REFUSALS, type BlobStoreRefusal } from '../blob-store/blob-store';
import { json } from '../responses';
import type { RouteContext } from './context';

/** A key as a log names it: its first 8 characters. */
export const short = (key: string): string => key.slice(0, 8);

/** A refusal, logged with its fingerprint and answered by name. */
export function refusedBlob(
  name: BlobStoreRefusal,
  where: { documentId?: string | null; key?: string },
  extra: Record<string, unknown> = {},
): Response {
  const fingerprint = name === 'files_unavailable' ? 'unavailable' : `refused name=${name}`;
  console.warn(
    `[blob-store] ${fingerprint} document=${where.documentId ?? '-'} key=${where.key ? short(where.key) : '-'}`,
  );
  return json({ error: name, ...extra }, { status: BLOB_STORE_REFUSALS[name] });
}

/** The declared size of an upload, or null when the request does not say one. */
export function declaredLength(request: Request): number | null {
  const header = request.headers.get('Content-Length');
  const length = header === null ? Number.NaN : Number(header);
  return Number.isSafeInteger(length) && length > 0 ? length : null;
}

/** An upload's door, opened: the bucket, the key, whose the bytes are, and the document the upload names. */
export type BlobDoor = {
  readonly bucket: R2Bucket;
  readonly key: BlobKey;
  readonly ownerId: string;
  readonly documentId: string | null;
};

/** Why bytes of that size are not taken for the owner, before the first of them: the cap, then the allowance. */
export async function sizeRefusal(
  ctx: RouteContext,
  door: BlobDoor,
  size: number,
): Promise<Response | null> {
  const { documentId, key } = door;
  if (size > FILE_TAB_MAX_BYTES)
    return refusedBlob('file_too_large', { documentId, key }, { limitBytes: FILE_TAB_MAX_BYTES });
  const left = await allowanceLeft(ctx.env, door.ownerId);
  if (left !== null && size > left)
    return refusedBlob('usage_exceeded', { documentId, key }, { leftBytes: left });
  return null;
}
