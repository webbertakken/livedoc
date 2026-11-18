// A text document's doors (docs/specs/034-text-documents/live-editing-and-storage.md, files-and-print.md):
//   GET /api/documents/<id>/text-documents/<tabId>/state  the live state as one Yjs update, for a surface to load
//   GET /api/documents/<id>/text-documents/<tabId>/file?type=odt|fodt|docx  the file, written from the live state
// Both are reads, gated as the tab is (a tab-scoped link on its own tab only). Answered inside the document's room.
import {
  isTextDocumentFileType,
  readOdfText,
  TextDocumentState,
  writeFodt,
  writeOdt,
  type TextDocumentFileType,
} from '@livedoc/text-documents';
import type { TextDocumentFormat } from '@livedoc/document';
import { getDocumentMeta } from '../db';
import { CORS_HEADERS, json } from '../responses';
import {
  readTextDocumentState,
  storedTextDocumentTab,
} from '../text-documents/text-document-store';
import {
  deniedOnTab,
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

// Which format each file is, so a download never changes a document's format behind a person's back (fork C1).
const FILE_FORMAT: Record<TextDocumentFileType, TextDocumentFormat> = {
  odt: 'odf',
  fodt: 'odf',
  docx: 'ooxml',
};

const notTextDocument = () => json({ error: 'text_document_not_found' }, { status: 404 });

/** A file name safe in a Content-Disposition header, from the document's name. */
// Characters a file name or a Content-Disposition header cannot carry: controls and the path and quoting ones.
const UNSAFE_IN_FILE_NAME = new Set(['"', '\\', '/', ':', '*', '?', '<', '>', '|']);
const safeInFileName = (char: string) => char >= ' ' && !UNSAFE_IN_FILE_NAME.has(char);

export function fileNameOf(name: string, type: TextDocumentFileType): string {
  const kept = [...name].map((char) => (safeInFileName(char) ? char : ' ')).join('');
  const base = kept.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
  return `${base}.${type}`;
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
  const state = await readTextDocumentState(env, tabId);
  if (segments[5] === 'state') {
    console.info(
      `[text-document] opened document=${documentId} tab=${tabId} bytes=${state.byteLength} ms=${Date.now() - started}`,
    );
    return bytesResponse(state, { 'Content-Type': 'application/octet-stream' });
  }
  const type = ctx.url.searchParams.get('type') ?? 'odt';
  if (!isTextDocumentFileType(type)) return json({ error: 'file_type_unknown' }, { status: 400 });
  // Conversion is a person's choice (File > Convert); until it is built, only the document's own format leaves.
  if (FILE_FORMAT[type] !== tab.format || type === 'docx')
    return json({ error: 'format_not_native' }, { status: 409 });
  const body = TextDocumentState.paragraphs(TextDocumentState.load([state]));
  const file = type === 'fodt' ? writeFodt(body, meta.name) : writeOdt(body, meta.name);
  console.info(
    `[text-document] file-written document=${documentId} tab=${tabId} type=${type} bytes=${file.byteLength} ms=${Date.now() - started}`,
  );
  return bytesResponse(file, {
    'Content-Type': FILE_MEDIA_TYPES[type],
    'Content-Disposition': `attachment; filename="${fileNameOf(meta.name, type)}"`,
  });
}

/** A file read into the update that seeds a new text document tab, or the package's named rejection. */
export async function seedOfTextDocumentFile(file: Uint8Array) {
  const read = await readOdfText(file);
  if (!read.ok) return read;
  return {
    ok: true as const,
    update: TextDocumentState.fromBody(read.body),
    dropped: read.dropped,
  };
}
