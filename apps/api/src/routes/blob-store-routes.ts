// The blob store's doors in (docs/specs/006-document/blob-store.md "Getting bytes in"):
//   GET  /api/files                        what the caller's blobs count, and the allowance
//   GET  /api/files/<key>[?document=<id>]  whether the owner holds the key: the question an upload begins with
//   PUT  /api/files/<key>[?document=<id>]  the bytes, in one request, streamed into storage and checked against the key
//   .../files/<key>/uploads...             the same in parts (blob-upload-routes.ts)
// A self-host without the `FILES` bucket answers each `503 files_unavailable`. The door out is a document's
// (document-file-routes.ts).
import { isBlobKey } from '@livedoc/document';
import { filesAllowance } from '../blob-store/allowance';
import { deleteUnnamedObjects } from '../blob-store/blob-retention';
import { storeBlob } from '../blob-store/blob-store';
import { blobUsage, claimBlob, getDocumentMeta, heldBlob, markBlobStored } from '../db';
import { json, notFound } from '../responses';
import { declaredLength, refusedBlob, short, sizeRefusal, type BlobDoor } from './blob-door';
import { blobUploadDoorOf, handleBlobUploadRoutes } from './blob-upload-routes';
import {
  deniedParticipate,
  gateParticipate,
  missingDocument,
  requireOwner,
  type RouteContext,
} from './context';

// Whose the bytes are, or the response that refuses the caller: the document's owner when the upload names a
// document (participate access asked, for the bytes a Participant's change brings: a stamp's picture; a Viewer stores
// nothing; a tab-scoped link is refused, as on every document-level door), else the caller's own.
async function blobOwnerOf(ctx: RouteContext, caller: string): Promise<string | Response> {
  const documentId = ctx.url.searchParams.get('document');
  if (documentId === null) return caller;
  const meta = await getDocumentMeta(ctx.env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  if (!(await gateParticipate(ctx, documentId, meta.ownerId, meta.teamId)))
    return deniedParticipate(ctx, meta);
  return meta.ownerId;
}

async function usage(ctx: RouteContext): Promise<Response> {
  if (!ctx.env.FILES) return refusedBlob('files_unavailable', {});
  const caller = requireOwner(ctx);
  if (caller instanceof Response) return caller;
  return json({ ...(await blobUsage(ctx.env, caller)), allowanceBytes: filesAllowance(ctx.env) });
}

async function storeInOneRequest(ctx: RouteContext, door: BlobDoor): Promise<Response> {
  const { bucket, key, ownerId, documentId } = door;
  // Bytes already held for that owner are never read again: the body is left unread.
  if (await heldBlob(ctx.env, ownerId, key)) {
    console.info(`[blob-store] held document=${documentId ?? '-'} key=${short(key)}`);
    return json({ held: true });
  }
  // The size is refused before any byte is read.
  const length = declaredLength(ctx.request);
  if (length === null || !ctx.request.body)
    return refusedBlob('length_required', { documentId, key });
  const refusal = await sizeRefusal(ctx, door, length);
  if (refusal) return refusal;
  const object = await claimBlob(ctx.env, ownerId, key, length, Date.now());
  const outcome = await storeBlob(bucket, object, key, ctx.request.body);
  if (outcome !== 'stored') return refusedBlob(outcome, { documentId, key });
  if (!(await markBlobStored(ctx.env, ownerId, key, length, Date.now()))) {
    // The row was held meanwhile: by the same upload sent twice (the same object, kept), or as a row given with a
    // copy ("A row is given, never bytes"), whose object the row names now; these bytes are then no row's.
    await deleteUnnamedObjects(ctx.env, bucket, [object]);
    console.info(`[blob-store] upload-superseded document=${documentId ?? '-'} key=${short(key)}`);
    return json({ held: true });
  }
  console.info(
    `[blob-store] stored document=${documentId ?? '-'} key=${short(key)} bytes=${length} parts=1`,
  );
  return json({ stored: true }, { status: 201 });
}

export async function handleBlobStoreRoutes(ctx: RouteContext): Promise<Response> {
  const { request, env, segments, url } = ctx;
  if (segments.length === 2) return request.method === 'GET' ? usage(ctx) : notFound();
  const whole = segments.length === 3;
  if (whole && request.method !== 'PUT' && request.method !== 'GET') return notFound();
  const upload = whole ? null : blobUploadDoorOf(segments, request.method);
  if (!whole && !upload) return notFound();
  const key = segments[2]!;
  const documentId = url.searchParams.get('document');
  if (!env.FILES) return refusedBlob('files_unavailable', { documentId });
  if (!isBlobKey(key)) return refusedBlob('key_invalid', { documentId });
  const caller = requireOwner(ctx);
  if (caller instanceof Response) return caller;
  const ownerId = await blobOwnerOf(ctx, caller);
  if (ownerId instanceof Response) return ownerId;
  const door: BlobDoor = { bucket: env.FILES, key, ownerId, documentId };

  if (upload) return handleBlobUploadRoutes(ctx, door, upload);
  // Not holding the bytes is an answer, never an error: the upload that follows is the ordinary path.
  if (request.method === 'GET') return json({ held: (await heldBlob(env, ownerId, key)) !== null });
  return storeInOneRequest(ctx, door);
}
