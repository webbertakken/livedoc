// A PDF document's doors (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage"):
//   GET  /api/documents/<id>/pdf-documents/<tabId>/state    the live changes as one Yjs update, the stored file's
//                                                           key in X-Stored-File; with since, only what lies beyond
//   POST /api/documents/<id>/pdf-documents/<tabId>/updates  one Yjs update too large for a frame
//   GET, PUT /api/documents/<id>/pdf-documents/<tabId>/thumbnail  a browser's thumbnail (pdf-thumbnail-routes.ts)
// The read is gated as the tab is (a tab-scoped link on its own tab only). The update is an Editor's as it is, a
// Participant's when the room finds it changes only what Reviewing changes ("The room's op kinds").
// Answered inside the document's room. The stored file's bytes are the blob store's (blob-store-routes.ts).
import { PDF_UPDATE_MAX_BYTES, PdfLiveChanges } from '@livedoc/pdf-documents';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/text-documents';
import {
  parseStoredLevel,
  PDF_STORED_FILE_HEADER,
  TEXT_DOCUMENT_STATE_VECTOR_HEADER,
  type AccessLevel,
} from '@livedoc/api-schema';
import { getDocumentMeta } from '../db';
import { readLiveTabState } from '../live-tabs/live-tab-store';
import { storedPdfTab } from '../pdf-documents/pdf-document-store';
import { PDF_LIVE_TAB } from '../pdf-documents/pdf-live-tab';
import { CORS_HEADERS, forbidden, json } from '../responses';
import { postLiveTabUpdate } from '../room-client';
import { handlePdfThumbnailRoutes } from './pdf-thumbnail-routes';
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
  error: 'update_invalid' | 'update_too_large' | 'update_unreadable' | 'stored_file_changed',
  status: number,
) => {
  console.warn(`[pdf] update-refused ${where} name=${error}`);
  return json({ error }, { status });
};

export async function handlePdfDocumentRoutes(ctx: DocumentRouteContext): Promise<Response | null> {
  const { segments, request } = ctx;
  if (segments.length !== 6 || segments[3] !== 'pdf-documents') return null;
  if (segments[5] === 'thumbnail') return handlePdfThumbnailRoutes(ctx);
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

// One update sent by the door: stored by the room on its write queue and relayed from there, when the caller's level
// allows what it changes.
async function postUpdate(ctx: DocumentRouteContext): Promise<Response> {
  const { segments, request, env } = ctx;
  const documentId = segments[2]!;
  const tabId = segments[4]!;
  const where = `document=${documentId} tab=${tabId}`;
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const meta = await getDocumentMeta(env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  const tooLow = (level: AccessLevel) => {
    // Told by name (docs/specs/035-pdf-documents/editing-modes.md "Errors").
    console.warn(`[pdf] mode-refused ${where} op=pdf level=${level}`);
    return forbidden('level_too_low');
  };
  let level: AccessLevel = 'edit';
  if (!(await gateEdit(ctx, documentId, meta.ownerId, meta.teamId, tabId))) {
    // A grant confined to another tab sees no such tab; a caller with no grant is told nothing more than refused.
    const grant = await gateGrant(ctx, documentId, meta.ownerId, meta.teamId);
    if (!grant) return forbidden();
    if (grant.tabScope !== null && grant.tabScope !== tabId) return notPdf();
    level = parseStoredLevel(grant.role);
    // A Participant's update goes on to the room, which reads what it changes; a Viewer's goes nowhere.
    if (level !== 'participate') return tooLow(level);
  }
  const update = new Uint8Array(await request.arrayBuffer());
  if (update.byteLength > PDF_UPDATE_MAX_BYTES)
    return refusedUpdate(where, 'update_too_large', 413);
  if (!PdfLiveChanges.decodes(update)) return refusedUpdate(where, 'update_invalid', 400);
  // The stored file the update was made on: the room refuses one made on another.
  const on = request.headers.get(PDF_STORED_FILE_HEADER);
  const { status, limit } = await postLiveTabUpdate(env, PDF_LIVE_TAB, documentId, tabId, update, {
    level,
    on,
  });
  if (status === 204) return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (status === 403) return tooLow(level);
  if (status === 409) return refusedUpdate(where, 'update_unreadable', 409);
  if (status === 412) return refusedUpdate(where, 'stored_file_changed', 409);
  if (status === 413) return json({ error: 'live_changes_too_large', limit }, { status: 413 });
  if (status === 404) return notPdf();
  if (status === 400) return refusedUpdate(where, 'update_invalid', 400);
  return json({ error: 'room_unavailable' }, { status: 503 });
}
