// The blob store's door out (docs/specs/006-document/blob-store.md "Getting bytes out"):
//   GET /api/documents/<id>/files/<key>  a blob the document holds, whole or by range, gated as its content is
// Answered inside the document's room. A self-host without the `FILES` bucket answers `503 files_unavailable`.
import { isBlobKey, type BlobKey } from '@livedoc/document';
import { byteRangeOf, readBlob } from '../blob-store/blob-store';
import { getDocumentMeta, heldBlob } from '../db';
import { documentBlobHold } from '../pdf-documents/pdf-document-store';
import { CORS_HEADERS, json } from '../responses';
import { refusedBlob, short } from './blob-door';
import {
  deniedOnTab,
  gateGrant,
  missingDocument,
  requireOwner,
  type DocumentRouteContext,
} from './context';

// What every read of a blob carries: the key as a strong validator, kept for good by the reader that may have it,
// and never a type a browser would run.
const blobHeaders = (key: BlobKey): Record<string, string> => ({
  ...CORS_HEADERS,
  ETag: `"${key}"`,
  'Cache-Control': 'private, max-age=31536000, immutable',
  'Content-Type': 'application/octet-stream',
  'Content-Disposition': 'attachment',
  'X-Content-Type-Options': 'nosniff',
  'Accept-Ranges': 'bytes',
});

/** `GET /api/documents/<id>/files/<key>`; null for any other path. Answered inside the document's room. */
export async function handleDocumentFileRoutes(
  ctx: DocumentRouteContext,
): Promise<Response | null> {
  const { segments, request, env } = ctx;
  if (segments.length !== 5 || segments[3] !== 'files' || request.method !== 'GET') return null;
  const documentId = segments[2]!;
  const key = segments[4]!;
  if (!isBlobKey(key)) return refusedBlob('key_invalid', { documentId });
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const meta = await getDocumentMeta(env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  const grant = await gateGrant(ctx, documentId, meta.ownerId, meta.teamId);
  if (!grant) return deniedOnTab(ctx, meta);
  if (!env.FILES) return refusedBlob('files_unavailable', { documentId });
  // A key the document does not hold opens nothing, whoever asks; a tab-scoped link reads its own tab's alone.
  const hold = await documentBlobHold(env, documentId, key, grant.tabScope);
  if (!hold) return refusedBlob('blob_not_held', { documentId, key });
  const headers = blobHeaders(key);
  if (request.headers.get('If-None-Match') === headers.ETag)
    return new Response(null, { status: 304, headers });
  const range = byteRangeOf(request.headers.get('Range'), hold.size);
  if (range === 'unsatisfiable') {
    const refusal = refusedBlob('range_not_satisfiable', { documentId, key });
    refusal.headers.set('Content-Range', `bytes */${hold.size}`);
    return refusal;
  }
  // The object is the one the document owner's row names: a guest's bytes stay where they were stored.
  const held = await heldBlob(env, meta.ownerId, key);
  const body = held ? await readBlob(env.FILES, held.object, range) : null;
  if (!body) {
    // The tab names bytes the store no longer has (docs/specs/035-pdf-documents/opening.md "Refusals").
    console.error(`[blob-store] missing document=${documentId} key=${short(key)}`);
    return json({ error: 'blob_missing' }, { status: 404 });
  }
  const bytes = range ? range.length : hold.size;
  console.info(
    `[blob-store] read document=${documentId} key=${short(key)} bytes=${bytes} ranged=${range !== null}`,
  );
  if (!range)
    return new Response(body, { headers: { ...headers, 'Content-Length': String(bytes) } });
  return new Response(body, {
    status: 206,
    headers: {
      ...headers,
      'Content-Length': String(bytes),
      'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${hold.size}`,
    },
  });
}
