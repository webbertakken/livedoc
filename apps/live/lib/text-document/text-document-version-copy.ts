// A version's Make a copy (docs/specs/034-text-documents/review.md "Version history"): a new text document holding the
// version as it reads, suggestions as they stood, in this one's format and filed beside it, with no history, versions
// or comments; the person's own. Every failure is named, nothing made.
import type { TextDocumentFormat } from '@livedoc/document';
import {
  base64OfBytes,
  TextDocumentState,
  THREADS_MAP,
  versionDocument,
} from '@livedoc/text-documents';
import { bytesOfBase64 } from '@livedoc/text-documents/base64';
import { apiCreateDocument, apiLoadDocument } from '@/lib/api/documents';
import { createBeside, placementOf } from '@/lib/create-beside';
import { createIdsFor } from '@/lib/new-document/create-failure';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { newTextDocumentTab } from './text-document-tab';

/** The copy's name to start with: "Copy of <title>" (Google's). */
export const versionCopyName = (title: string): string => `Copy of ${title}`;

/** What a failed copy says in the dialog (default copy). */
export const VERSION_COPY_FAILED = "The copy couldn't be made. Try again.";

export type VersionCopyApi = {
  loadDocument: typeof apiLoadDocument;
  create: (ownerId: string, request: Parameters<typeof apiCreateDocument>[1]) => Promise<unknown>;
};

const VERSION_COPY_API: VersionCopyApi = {
  loadDocument: apiLoadDocument,
  create: apiCreateDocument,
};

export type VersionCopyRequest = {
  ownerId: string;
  /** The document whose version it is: the copy is filed beside it. */
  documentId: string;
  format: TextDocumentFormat;
  /** The room's state, which holds every item the version names. */
  state: Uint8Array;
  /** The version's snapshot, as the api sends it. */
  snapshot: string;
  name: string;
};

/** The version as a fresh state of its own: its writing, no comment threads, no history. */
export function versionCopyState(
  state: Uint8Array,
  snapshot: Uint8Array,
  format: TextDocumentFormat,
): Uint8Array {
  const doc = versionDocument([state], snapshot);
  try {
    doc.getMap(THREADS_MAP).clear();
    return TextDocumentState.fromDocument(TextDocumentState.document(doc, format));
  } finally {
    doc.destroy();
  }
}

/** Makes and stores the copy; the new document's id, or null when it could not be made. */
export async function makeVersionCopy(
  request: VersionCopyRequest,
  api: VersionCopyApi = VERSION_COPY_API,
): Promise<string | null> {
  const started = performance.now();
  const { documentId, tabId } = createIdsFor(null);
  try {
    const snapshot = bytesOfBase64(request.snapshot);
    if (!snapshot) throw new Error('version snapshot: not base64');
    const state = base64OfBytes(versionCopyState(request.state, snapshot, request.format));
    const name = request.name.trim();
    await createBeside(
      (place) =>
        api.create(request.ownerId, {
          id: documentId,
          name,
          tabs: [newTextDocumentTab(tabId, name, request.format)],
          teamId: place.teamId,
          folderId: place.folderId,
          textDocuments: [{ tabId, state }],
        }),
      await placementOf(api.loadDocument, request.ownerId, request.documentId),
    );
  } catch (error) {
    debugLog('[text-document] version copy failed', { error: String(error) });
    return null;
  }
  debugLog('[text-document] version copied', { ms: Math.round(performance.now() - started) });
  track('Document', 'Duplicated', 'TextDocumentVersionCopy');
  return documentId;
}
