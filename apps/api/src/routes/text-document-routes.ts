// A text document's doors (docs/specs/034-text-documents/live-editing-and-storage.md, files-and-print.md):
//   GET /api/documents/<id>/text-documents/<tabId>/state  the live state as one Yjs update, for a surface to load
//   GET /api/documents/<id>/text-documents/<tabId>/file?type=odt|fodt|docx|txt|md|html|epub  the file, written from the live state
//   POST /api/documents/<id>/text-documents/<tabId>/updates  one Yjs update too large for a frame ("Sending")
// The reads are gated as the tab is (a tab-scoped link on its own tab only), the update as an edit of the tab.
// Answered inside the document's room.
import type { TextDocumentFormat } from '@livedoc/document';
import {
  base64OfBytes,
  bytesOfBase64,
  EXPORT_EXTENSIONS,
  EXPORT_MEDIA_TYPES,
  isPicturedExportType,
  isTextDocumentExportType,
  isTextDocumentFileType,
  settledDocument,
  writeTextDocumentExport,
  type TextDocumentExportType,
  TEXT_DOCUMENT_UPDATE_MAX_BYTES,
  TextDocumentState,
  writeTextDocumentFile,
  type TextDocumentFileType,
} from '@livedoc/text-documents';
import {
  TEXT_DOCUMENT_CONVERSION_LOSSES_HEADER,
  TEXT_DOCUMENT_PICTURES_LEFT_OUT_HEADER,
  TEXT_DOCUMENT_STATE_VECTOR_HEADER,
  TEXT_DOCUMENT_VIEWER_COPY_HEADER,
} from '@livedoc/api-schema';
import { viewerStateOf } from '../text-documents/room-viewer-copies';
import { galleryMediaRead } from '../text-documents/gallery-media';
import { getDocumentMeta } from '../db';
import { downloadFileName } from '@livedoc/office-packages';
import { CORS_HEADERS, json } from '../responses';
import { postLiveTabUpdate, readViewerCopyState } from '../room-client';
import { readLiveTabState } from '../live-tabs/live-tab-store';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { storedTextDocumentTab } from '../text-documents/text-document-store';
import {
  deniedOnTab,
  gateEdit,
  gateGrant,
  missingDocument,
  requireOwner,
  type DocumentRouteContext,
} from './context';

const FILE_MEDIA_TYPES: Record<TextDocumentFileType, string> = {
  odt: 'application/vnd.oasis.opendocument.text',
  fodt: 'application/vnd.oasis.opendocument.text-flat-xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const notTextDocument = () => json({ error: 'text_document_not_found' }, { status: 404 });

/** A file name safe in a Content-Disposition header, from the document's name. */
export function fileNameOf(name: string, type: TextDocumentFileType): string {
  return downloadFileName(name, type, 'Untitled');
}

function bytesResponse(body: Uint8Array, headers: Record<string, string>): Response {
  return new Response(body.slice().buffer, {
    status: 200,
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-cache', ...headers },
  });
}

export async function handleTextDocumentRoutes(
  ctx: DocumentRouteContext,
): Promise<Response | null> {
  const { segments, request, env } = ctx;
  if (segments.length !== 6 || segments[3] !== 'text-documents') return null;
  if (request.method === 'POST' && segments[5] === 'updates') return postUpdate(ctx);
  if (request.method !== 'GET') return null;
  if (segments[5] !== 'state' && segments[5] !== 'file') return null;
  const documentId = segments[2]!;
  const tabId = segments[4]!;
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const meta = await getDocumentMeta(env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  const grant = await gateGrant(ctx, documentId, meta.ownerId, meta.teamId);
  if (!grant || (grant.tabScope !== null && grant.tabScope !== tabId))
    return deniedOnTab(ctx, meta);
  const tab = await storedTextDocumentTab(env, documentId, tabId);
  if (!tab) return notTextDocument();
  const started = Date.now();
  // A Viewer reads a copy without comments or authors (review.md "What a Viewer receives").
  const viewer = grant.role === 'view';
  if (viewer && segments[5] === 'state') return viewerStateResponse(ctx, started);
  const stored = await readLiveTabState(env, TEXT_DOCUMENT_LIVE_TAB, tabId);
  if (segments[5] === 'state') return stateResponse(ctx, stored, started);
  const state = viewer ? viewerStateOf(stored, { documentId, tabId }) : stored;
  if (!state) return viewerCopyUnavailable();
  const type = ctx.url.searchParams.get('type') ?? 'odt';
  if (isTextDocumentExportType(type))
    return exportResponse(ctx, { state, format: tab.format, name: meta.name, type, started });
  if (!isTextDocumentFileType(type)) return json({ error: 'file_type_unknown' }, { status: 400 });
  // The file is derived from the live state; its title is the document's name, written on save.
  const live = TextDocumentState.document(TextDocumentState.load([state]), tab.format);
  // Gallery media are read back first; a picture whose bytes cannot be read is left out, and said so.
  const read = await galleryMediaRead(env, documentId, live);
  for (const key of read.unavailable)
    console.warn(
      `[text-document] picture-unavailable document=${documentId} tab=${tabId} media=${key}`,
    );
  const document = { ...read.document, metadata: { ...live.metadata, title: meta.name } };
  // The other format is a converted copy (fork C1): the document keeps its format, the losses counted.
  const written = writeTextDocumentFile(document, type);
  const file = written.bytes;
  const losses = written.losses.reduce((sum, loss) => sum + loss.count, 0);
  console.info(
    `[text-document] file-written document=${documentId} tab=${tabId} type=${type} format=${tab.format} losses=${losses} bytes=${file.byteLength} ms=${Date.now() - started}`,
  );
  return bytesResponse(file, {
    'Content-Type': FILE_MEDIA_TYPES[type],
    'Content-Disposition': `attachment; filename="${fileNameOf(meta.name, type)}"`,
    [TEXT_DOCUMENT_PICTURES_LEFT_OUT_HEADER]: String(read.unavailable.length),
    [TEXT_DOCUMENT_CONVERSION_LOSSES_HEADER]: String(losses),
  });
}

// An export (files-and-print.md "Downloading"): written from the state with every pending suggestion accepted, as print
// has it. A Viewer's state is already their copy. The Web Page and the EPUB carry pictures: gallery media are read
// back first, as for the native files, and a picture whose bytes cannot be read is its alt text, said so.
async function exportResponse(
  ctx: DocumentRouteContext,
  {
    state,
    format,
    name,
    type,
    started,
  }: {
    state: Uint8Array;
    format: TextDocumentFormat;
    name: string;
    type: TextDocumentExportType;
    started: number;
  },
): Promise<Response> {
  const documentId = ctx.segments[2]!;
  const tabId = ctx.segments[4]!;
  const settled = settledDocument(TextDocumentState.load([state]), format);
  const read = isPicturedExportType(type)
    ? await galleryMediaRead(ctx.env, documentId, settled)
    : { document: settled, unavailable: [] };
  for (const key of read.unavailable)
    console.warn(
      `[text-document] picture-unavailable document=${documentId} tab=${tabId} media=${key}`,
    );
  const file = writeTextDocumentExport(
    { ...read.document, metadata: { ...read.document.metadata, title: name } },
    type,
  );
  console.info(
    `[text-document] file-written document=${documentId} tab=${tabId} type=${type} left-out=${read.unavailable.length} bytes=${file.byteLength} ms=${Date.now() - started}`,
  );
  return bytesResponse(file, {
    'Content-Type': EXPORT_MEDIA_TYPES[type],
    'Content-Disposition': `attachment; filename="${downloadFileName(name, EXPORT_EXTENSIONS[type], 'Untitled')}"`,
    [TEXT_DOCUMENT_PICTURES_LEFT_OUT_HEADER]: String(read.unavailable.length),
  });
}

// A Viewer's state, answered by the room from the tab's Viewer copy (live-editing-and-storage.md "A Viewer's copy"): with
// `since` (or alone, when the vector rides no URL) a reader names the copy it holds (`copy`), and one from another copy
// is refused 409 `viewer_copy_changed`.
async function viewerStateResponse(ctx: DocumentRouteContext, started: number): Promise<Response> {
  const documentId = ctx.segments[2]!;
  const tabId = ctx.segments[4]!;
  const copy = ctx.url.searchParams.get('copy');
  const since = ctx.url.searchParams.get('since');
  if (since !== null) {
    const vector = bytesOfBase64(since);
    if (!vector || !TextDocumentState.isStateVector(vector))
      return json({ error: 'state_vector_invalid' }, { status: 400 });
  }
  const answer = await readViewerCopyState(ctx.env, {
    documentId,
    tabId,
    ...(since === null ? {} : { since }),
    ...(copy === null ? {} : { copy }),
  });
  if (!answer) return json({ error: 'room_unavailable' }, { status: 503 });
  if (answer.status === 409) return json({ error: 'viewer_copy_changed' }, { status: 409 });
  if (answer.status !== 200) return viewerCopyUnavailable();
  const body = new Uint8Array(await answer.arrayBuffer());
  console.info(
    `[text-document] opened document=${documentId} tab=${tabId} bytes=${body.byteLength} since=${since !== null} viewer=true ms=${Date.now() - started}`,
  );
  return bytesResponse(body, {
    'Content-Type': 'application/octet-stream',
    [TEXT_DOCUMENT_STATE_VECTOR_HEADER]:
      answer.headers.get(TEXT_DOCUMENT_STATE_VECTOR_HEADER) ?? '',
    [TEXT_DOCUMENT_VIEWER_COPY_HEADER]: answer.headers.get(TEXT_DOCUMENT_VIEWER_COPY_HEADER) ?? '',
  });
}

const viewerCopyUnavailable = () => json({ error: 'viewer_copy_unavailable' }, { status: 503 });

// The state, or with `since` (a reader's state vector, base64) only what it holds beyond it: a catch-up's answer
// ("Reconnecting"). Either way the state's own vector rides `X-State-Vector`, so the reader can send what it lacks.
function stateResponse(ctx: DocumentRouteContext, state: Uint8Array, started: number): Response {
  const documentId = ctx.segments[2];
  const tabId = ctx.segments[4];
  const since = ctx.url.searchParams.get('since');
  let body = state;
  if (since !== null) {
    const vector = bytesOfBase64(since);
    if (!vector || !TextDocumentState.isStateVector(vector))
      return json({ error: 'state_vector_invalid' }, { status: 400 });
    body = TextDocumentState.since(state, vector);
  }
  console.info(
    `[text-document] opened document=${documentId} tab=${tabId} bytes=${body.byteLength} since=${since !== null} ms=${Date.now() - started}`,
  );
  return bytesResponse(body, {
    'Content-Type': 'application/octet-stream',
    [TEXT_DOCUMENT_STATE_VECTOR_HEADER]: base64OfBytes(TextDocumentState.stateVectorOf(state)),
  });
}

const refusedUpdate = (error: 'update_invalid' | 'update_too_large', status: number) =>
  json({ error }, { status });

// One update sent by the door: an edit of the tab, stored by the room on its write queue and relayed from there.
async function postUpdate(ctx: DocumentRouteContext): Promise<Response> {
  const { segments, request, env } = ctx;
  const documentId = segments[2]!;
  const tabId = segments[4]!;
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  const meta = await getDocumentMeta(env, documentId);
  if (!meta) return missingDocument(ctx, documentId);
  if (!(await gateEdit(ctx, documentId, meta.ownerId, meta.teamId, tabId)))
    return deniedOnTab(ctx, meta);
  const update = new Uint8Array(await request.arrayBuffer());
  if (update.byteLength > TEXT_DOCUMENT_UPDATE_MAX_BYTES) {
    console.warn(
      `[text-document] update-refused document=${documentId} tab=${tabId} reason=too-large bytes=${update.byteLength}`,
    );
    return refusedUpdate('update_too_large', 413);
  }
  if (!TextDocumentState.decodes(update)) {
    console.warn(
      `[text-document] update-refused document=${documentId} tab=${tabId} reason=decode`,
    );
    return refusedUpdate('update_invalid', 400);
  }
  const { status, limit } = await postLiveTabUpdate(
    env,
    TEXT_DOCUMENT_LIVE_TAB,
    documentId,
    tabId,
    update,
  );
  if (status === 413) return json({ error: 'document_too_large', limit }, { status: 413 });
  if (status === 204) return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (status === 404) return notTextDocument();
  if (status === 400) return refusedUpdate('update_invalid', 400);
  return json({ error: 'room_unavailable' }, { status: 503 });
}
