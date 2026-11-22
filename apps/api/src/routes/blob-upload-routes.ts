// The blob store's doors in, for a file in parts (docs/specs/006-document/blob-store.md "Getting bytes in"):
//   POST /api/files/<key>/uploads?size=<bytes>            begins, or resumes the owner's unfinished upload
//   PUT  /api/files/<key>/uploads/<upload>/parts/<n>      one part, the next or one already stored
//   POST /api/files/<key>/uploads/<upload>/complete       puts the parts together, checked against the key
// Each also takes `?document=<id>`; the door is opened by blob-store-routes.ts.
import { FILE_PART_BYTES, filePartCount, filePartSize } from '@livedoc/document';
import { abandonParts, beginParts, completeParts, storePart } from '../blob-store/blob-parts';
import {
  blobUpload,
  claimBlob,
  deleteBlobUpload,
  heldBlob,
  insertBlobUpload,
  markBlobStored,
  recordBlobUploadPart,
  storedParts,
  unfinishedBlobUpload,
  type BlobUpload,
} from '../db';
import { json } from '../responses';
import { declaredLength, refusedBlob, short, sizeRefusal, type BlobDoor } from './blob-door';
import type { RouteContext } from './context';

const resumed = (upload: BlobUpload, status: number): Response =>
  json({ upload: upload.id, partBytes: FILE_PART_BYTES, parts: storedParts(upload) }, { status });

async function begin(ctx: RouteContext, door: BlobDoor): Promise<Response> {
  const { bucket, key, ownerId, documentId } = door;
  const size = Number(ctx.url.searchParams.get('size') ?? Number.NaN);
  if (!Number.isSafeInteger(size) || size < 1)
    return refusedBlob('size_invalid', { documentId, key });
  if (await heldBlob(ctx.env, ownerId, key)) {
    console.info(`[blob-store] held document=${documentId ?? '-'} key=${short(key)}`);
    return json({ held: true });
  }
  const refusal = await sizeRefusal(ctx, door, size);
  if (refusal) return refusal;
  const unfinished = await unfinishedBlobUpload(ctx.env, ownerId, key, size);
  if (unfinished) {
    console.info(
      `[blob-store] upload-resumed document=${documentId ?? '-'} key=${short(key)} have=${storedParts(unfinished).length}`,
    );
    return resumed(unfinished, 200);
  }
  const now = Date.now();
  await claimBlob(ctx.env, ownerId, key, size, now);
  const id = crypto.randomUUID();
  const r2Upload = await beginParts(bucket, id);
  if (r2Upload === null) return refusedBlob('store_failed', { documentId, key });
  const upload: BlobUpload = { id, ownerId, key, size, r2Upload, parts: {}, begunAt: now };
  if (!(await insertBlobUpload(ctx.env, upload))) {
    // Two began at once: the other's stands and is answered, and this one's is given back to storage.
    await abandonParts(bucket, upload);
    return begin(ctx, door);
  }
  console.info(
    `[blob-store] upload-begun document=${documentId ?? '-'} key=${short(key)} parts=${filePartCount(size)}`,
  );
  return resumed(upload, 201);
}

async function part(
  ctx: RouteContext,
  door: BlobDoor,
  uploadId: string,
  number: string,
): Promise<Response> {
  const { bucket, key, ownerId, documentId } = door;
  const upload = await blobUpload(ctx.env, uploadId, ownerId, key);
  if (!upload) return refusedBlob('upload_not_found', { documentId, key });
  const n = /^[1-9]\d*$/.test(number) ? Number(number) : Number.NaN;
  // The next part, or one already stored; every part whole but the last, which is what is left of the size.
  const inOrder = n === 1 || String(n - 1) in upload.parts;
  const body = ctx.request.body;
  if (
    !(n <= filePartCount(upload.size)) ||
    !inOrder ||
    !body ||
    declaredLength(ctx.request) !== filePartSize(upload.size, n)
  )
    return refusedBlob('part_invalid', { documentId, key });
  const etag = await storePart(bucket, upload, n, body);
  if (etag === null) return refusedBlob('store_failed', { documentId, key });
  const parts = await recordBlobUploadPart(ctx.env, upload.id, n, etag);
  console.info(`[blob-store] part-stored document=${documentId ?? '-'} key=${short(key)} n=${n}`);
  return json({ parts });
}

async function complete(ctx: RouteContext, door: BlobDoor, uploadId: string): Promise<Response> {
  const { bucket, key, ownerId, documentId } = door;
  const upload = await blobUpload(ctx.env, uploadId, ownerId, key);
  if (!upload) return refusedBlob('upload_not_found', { documentId, key });
  const count = filePartCount(upload.size);
  if (storedParts(upload).length !== count)
    return refusedBlob('upload_incomplete', { documentId, key }, { parts: storedParts(upload) });
  const object = await claimBlob(ctx.env, ownerId, key, upload.size, Date.now());
  const outcome = await completeParts(bucket, upload, object, key);
  if (outcome === 'store_failed') return refusedBlob(outcome, { documentId, key });
  // Stored or refused, the upload is over: its parts are gone.
  await deleteBlobUpload(ctx.env, upload.id);
  if (outcome === 'key_mismatch') return refusedBlob(outcome, { documentId, key });
  await markBlobStored(ctx.env, ownerId, key, outcome.stored, Date.now());
  console.info(
    `[blob-store] stored document=${documentId ?? '-'} key=${short(key)} bytes=${outcome.stored} parts=${count}`,
  );
  return json({ stored: true }, { status: 201 });
}

/** Which of the three doors a path and method are, read before anything is asked of storage; null for none. */
export type BlobUploadDoor =
  | { readonly door: 'begin' }
  | { readonly door: 'part'; readonly upload: string; readonly n: string }
  | { readonly door: 'complete'; readonly upload: string };

export function blobUploadDoorOf(
  segments: readonly string[],
  method: string,
): BlobUploadDoor | null {
  if (segments[3] !== 'uploads') return null;
  if (segments.length === 4) return method === 'POST' ? { door: 'begin' } : null;
  const upload = segments[4]!;
  if (segments.length === 6 && segments[5] === 'complete' && method === 'POST')
    return { door: 'complete', upload };
  if (segments.length === 7 && segments[5] === 'parts' && method === 'PUT')
    return { door: 'part', upload, n: segments[6]! };
  return null;
}

export function handleBlobUploadRoutes(
  ctx: RouteContext,
  door: BlobDoor,
  which: BlobUploadDoor,
): Promise<Response> {
  if (which.door === 'begin') return begin(ctx, door);
  if (which.door === 'complete') return complete(ctx, door, which.upload);
  return part(ctx, door, which.upload, which.n);
}
