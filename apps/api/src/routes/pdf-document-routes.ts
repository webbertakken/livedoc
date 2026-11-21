// A PDF document's doors (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage"):
//   GET  /api/documents/<id>/pdf-documents/<tabId>/state    the live changes as one Yjs update, the stored file's
//                                                           key in X-Stored-File; with since, only what lies beyond
//   POST /api/documents/<id>/pdf-documents/<tabId>/updates  one Yjs update too large for a frame
// The read is gated as the tab is (a tab-scoped link on its own tab only), the update as an edit of the tab.
// Answered inside the document's room. The stored file's bytes are the blob store's (blob-store-routes.ts).
import { PDF_UPDATE_MAX_BYTES, PdfLiveChanges } from '@livedoc/pdf-documents';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/text-documents';
import { PDF_STORED_FILE_HEADER, TEXT_DOCUMENT_STATE_VECTOR_HEADER } from '@livedoc/api-schema';
import { getDocumentMeta } from '../db';
import { readLiveTabState } from '../live-tabs/live-tab-store';
import { storedPdfTab } from '../pdf-documents/pdf-document-store';
import { PDF_LIVE_TAB } from '../pdf-documents/pdf-live-tab';
import { CORS_HEADERS, forbidden, json } from '../responses';
import { postLiveTabUpdate } from '../room-client';
import {
  deniedOnTab,
  gateEdit,
  gateGrant,
  missingDocument,
  requireOwner,
  type DocumentRouteContext,
} from './context';

const notPdf = () => json({ error: 'pdf_not_found' }, { status: 404 });

const refusedUpdate = (
  where: string,
  error: 'update_invalid' | 'update_too_large',
  status: number,
) => {
  console.warn(`[pdf] update-refused ${where} name=${error}`);
  return json({ error }, { status });
};

export async function handlePdfDocumentRoutes(ctx: DocumentRouteContext): Promise<Response | null> {
  const { segments, request } = ctx;
  if (segments.length !== 6 || segments[3] !== 'pdf-documents') return null;
  if (request.method === 'POST' && segments[5] === 'updates') return postUpdate(ctx);
  if (request.method === 'GET' && segments[5] === 'state') return readState(ctx);
  return null;
}

async function readState(ctx: DocumentRouteContext): Promise<Response> {
  const { segments, env } = ctx;
  const documentId = segments[2]!;
  const tabId = segments[4]!;
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const meta = await getDocumentMeta(env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  const grant = await gateGrant(ctx, documentId, meta.ownerId, meta.teamId);
  if (!grant || (grant.tabScope !== null && grant.tabScope !== tabId))
    return deniedOnTab(ctx, meta);
  const tab = await storedPdfTab(env, documentId, tabId);
  if (!tab) return notPdf();
  const state = await readLiveTabState(env, PDF_LIVE_TAB, tabId);
  // With `since` (a reader's state vector, base64) only what the state holds beyond it: a catch-up's answer.
  const since = ctx.url.searchParams.get('since');
  let body = state;
  if (since !== null) {
    const vector = bytesOfBase64(since);
    if (!vector || !PdfLiveChanges.isStateVector(vector))
      return json({ error: 'state_vector_invalid' }, { status: 400 });
    body = PdfLiveChanges.since(state, vector);
  }
  console.info(
    `[pdf] state-read document=${documentId} tab=${tabId} bytes=${body.byteLength} since=${since !== null}`,
  );
  return new Response(body.slice().buffer, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/octet-stream',
      [PDF_STORED_FILE_HEADER]: tab.blob,
      [TEXT_DOCUMENT_STATE_VECTOR_HEADER]: base64OfBytes(PdfLiveChanges.stateVectorOf(state)),
    },
  });
}

// One update sent by the door: an edit of the tab, stored by the room on its write queue and relayed from there.
async function postUpdate(ctx: DocumentRouteContext): Promise<Response> {
  const { segments, request, env } = ctx;
  const documentId = segments[2]!;
  const tabId = segments[4]!;
  const where = `document=${documentId} tab=${tabId}`;
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const meta = await getDocumentMeta(env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  if (!(await gateEdit(ctx, documentId, meta.ownerId, meta.teamId, tabId))) {
    // A grant confined to another tab sees no such tab; a level below Editor is told so by name
    // (docs/specs/035-pdf-documents/editing-modes.md "Errors"), a caller with no grant nothing more than refused.
    const grant = await gateGrant(ctx, documentId, meta.ownerId, meta.teamId);
    if (!grant) return forbidden();
    if (grant.tabScope !== null && grant.tabScope !== tabId) return notPdf();
    console.warn(`[pdf] mode-refused ${where} op=pdf level=${grant.role}`);
    return forbidden('level_too_low');
  }
  const update = new Uint8Array(await request.arrayBuffer());
  if (update.byteLength > PDF_UPDATE_MAX_BYTES)
    return refusedUpdate(where, 'update_too_large', 413);
  if (!PdfLiveChanges.decodes(update)) return refusedUpdate(where, 'update_invalid', 400);
  const { status, limit } = await postLiveTabUpdate(env, PDF_LIVE_TAB, documentId, tabId, update);
  if (status === 204) return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (status === 413) return json({ error: 'live_changes_too_large', limit }, { status: 413 });
  if (status === 404) return notPdf();
  if (status === 400) return refusedUpdate(where, 'update_invalid', 400);
  return json({ error: 'room_unavailable' }, { status: 503 });
}
