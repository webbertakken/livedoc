// The blob store's doors in (docs/specs/006-document/blob-store.md "Getting bytes in"):
//   GET  /api/files/<key>[?document=<id>]  whether the owner holds the key: the question an upload begins with
//   PUT  /api/files/<key>[?document=<id>]  the bytes, in one request, streamed into storage and checked against the key
// A self-host without the `FILES` bucket answers each `503 files_unavailable`. The door out is a document's
// (document-file-routes.ts).
import { FILE_TAB_MAX_BYTES, isBlobKey } from '@livedoc/document';
import {
  BLOB_STORE_REFUSALS,
  heldBlobSize,
  storeBlob,
  type BlobStoreRefusal,
} from '../blob-store/blob-store';
import { getDocumentMeta } from '../db';
import { json, notFound } from '../responses';
import { deniedOnTab, gateEdit, missingDocument, requireOwner, type RouteContext } from './context';

const short = (key: string): string => key.slice(0, 8);

export /** A refusal, logged with its fingerprint and answered by name. */
function refusedBlob(
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
function declaredLength(request: Request): number | null {
  const header = request.headers.get('Content-Length');
  const length = header === null ? Number.NaN : Number(header);
  return Number.isSafeInteger(length) && length > 0 ? length : null;
}

// Whose the bytes are, or the response that refuses the caller: the document's owner when the upload names a
// document (edit access asked; a tab-scoped link is refused, as on every document-level door), else the caller's own.
async function blobOwnerOf(ctx: RouteContext, caller: string): Promise<string | Response> {
  const documentId = ctx.url.searchParams.get('document');
  if (documentId === null) return caller;
  const meta = await getDocumentMeta(ctx.env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  if (!(await gateEdit(ctx, documentId, meta.ownerId, meta.teamId))) return deniedOnTab(ctx, meta);
  return meta.ownerId;
}

export async function handleBlobStoreRoutes(ctx: RouteContext): Promise<Response> {
  const { request, env, segments, url } = ctx;
  if (segments.length !== 3) return notFound();
  if (request.method !== 'PUT' && request.method !== 'GET') return notFound();
  const key = segments[2]!;
  const documentId = url.searchParams.get('document');
  if (!env.FILES) return refusedBlob('files_unavailable', { documentId });
  if (!isBlobKey(key)) return refusedBlob('key_invalid', { documentId });
  const caller = requireOwner(ctx);
  if (caller instanceof Response) return caller;
  const ownerId = await blobOwnerOf(ctx, caller);
  if (ownerId instanceof Response) return ownerId;

  const held = await heldBlobSize(env.FILES, ownerId, key);
  // Not holding the bytes is an answer, never an error: the upload that follows is the ordinary path.
  if (request.method === 'GET') return json({ held: held !== null });
  // Bytes already held for that owner are never read again: the body is left unread.
  if (held !== null) {
    console.info(`[blob-store] held document=${documentId ?? '-'} key=${short(key)}`);
    return json({ held: true });
  }
  // The size is refused before any byte is read.
  const length = declaredLength(request);
  if (length === null || !request.body) return refusedBlob('length_required', { documentId, key });
  if (length > FILE_TAB_MAX_BYTES)
    return refusedBlob('file_too_large', { documentId, key }, { limitBytes: FILE_TAB_MAX_BYTES });
  const outcome = await storeBlob(env.FILES, ownerId, key, request.body);
  if (outcome !== 'stored') return refusedBlob(outcome, { documentId, key });
  console.info(
    `[blob-store] stored document=${documentId ?? '-'} key=${short(key)} bytes=${length} parts=1`,
  );
  return json({ stored: true }, { status: 201 });
}
