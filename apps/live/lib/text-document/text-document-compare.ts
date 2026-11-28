// Tools > Compare documents (docs/specs/034-text-documents/review.md "Compare documents"): the selected document read
// as the person, each side with its own suggestions left out, the comparison made by the package's engine and stored as
// the person's own new text document beside the primary. Every refusal is named, nothing made.
import type * as Y from 'yjs';
import { tabKindOf, type TextDocumentFormat } from '@livedoc/document';
import type { LiveDoc } from '@livedoc/api-schema';
import {
  LiveSuggestions,
  SUGGESTION_AUTHOR_NAME_MAX,
  TextDocumentComparison,
  TextDocumentState,
  base64OfBytes,
  versionDocument,
  type TextDocument,
} from '@livedoc/text-documents';
import { apiCreateDocument, apiLoadDocument } from '@/lib/api/documents';
import { apiLoadTextDocumentState } from '@/lib/api/text-documents';
import { apiReadTextDocumentVersion } from '@/lib/api/text-document-versions';
import { bytesOfBase64 } from '@livedoc/office-packages';
import { ApiError } from '@/lib/api/core';
import { createBeside, placementOf } from '@/lib/create-beside';
import { createIdsFor } from '@/lib/new-document/create-failure';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { newTextDocumentTab } from './text-document-tab';

/** Why no comparison was made. */
export type CompareRefusal = 'not-copyable' | 'unreadable' | 'too-long' | 'too-many' | 'not-stored';

/** What each refusal says in the dialog (review.md "The dialog", (default) copy); the selected's name where it names it. */
export const COMPARE_REFUSAL_COPY: Record<CompareRefusal, (selected: string) => string> = {
  'not-copyable': (selected) => `You can't copy ${selected}, so it can't be compared.`,
  unreadable: () => "That document couldn't be read. Try again.",
  'too-long': () => 'These documents are too long to compare.',
  'too-many': () => 'These documents differ in too many places to compare.',
  'not-stored': () => "The comparison couldn't be made. Try again.",
};

/** The name a blank attribution field compares as (review.md "The dialog", (default)). */
export const COMPARE_GUEST_NAME = 'Guest';

export type CompareOutcome =
  | { ok: true; documentId: string; suggestions: number; leftOut: number }
  | { ok: false; refusal: CompareRefusal };

/** The api a comparison reads and stores through; the real one unless a test gives its own. */
export type CompareApi = {
  loadDocument: (ownerId: string, id: string) => Promise<LiveDoc | null>;
  loadState: (scope: {
    ownerId: string;
    documentId: string;
    tabId: string;
    shareCode: null;
  }) => Promise<Uint8Array>;
  create: (ownerId: string, request: Parameters<typeof apiCreateDocument>[1]) => Promise<unknown>;
  /** One of the primary's versions, whose snapshot the room's state is read at. */
  readVersion: typeof apiReadTextDocumentVersion;
};

const COMPARE_API: CompareApi = {
  loadDocument: apiLoadDocument,
  loadState: apiLoadTextDocumentState,
  create: apiCreateDocument,
  readVersion: apiReadTextDocumentVersion,
};

export type CompareRequest = {
  /** Who compares: the comparison is theirs. */
  ownerId: string;
  /** The document open here, its writing as it is now. */
  primary: {
    documentId: string;
    tabId: string;
    name: string;
    format: TextDocumentFormat;
    doc: Y.Doc;
  };
  /** The person's own text document it is compared against, or one of the primary's versions (by its id). */
  selected: { id: string; name: string; version?: true };
  /** Who the differences are attributed to, as the field holds it. */
  name: string;
  /** Whether the selected document's comments come with it. */
  comments: boolean;
  /** When it is made (ms). */
  at: number;
};

/** "Comparison of <primary> and <selected>" (review.md "The dialog", Google's name). */
export const comparisonName = (primary: string, selected: string): string =>
  `Comparison of ${primary} and ${selected}`;

/** The attribution as given, trimmed and within a suggestion author's limit; a blank one a guest. */
export const attribution = (field: string): string =>
  field.trim().slice(0, SUGGESTION_AUTHOR_NAME_MAX).trim() || COMPARE_GUEST_NAME;

/** A refusal the person may not read past: signed out, not theirs to read, or gone. */
const refusedRead = (error: unknown): boolean =>
  error instanceof ApiError && [401, 403, 404].includes(error.status);

/** The writing as written: its own suggestions left out (review.md "What is compared"). */
const asWritten = (doc: Y.Doc, format: TextDocumentFormat): TextDocument =>
  TextDocumentState.document(LiveSuggestions.settledCopy(doc, false), format);

type Read<T> = { ok: true; value: T } | { ok: false; refusal: CompareRefusal };

/** One of the primary's versions as it read (review.md "The dialog", Versions); any failure unreadable. */
async function readVersion(request: CompareRequest, api: CompareApi): Promise<Read<TextDocument>> {
  const { ownerId, primary, selected } = request;
  const scope = { ownerId, documentId: primary.documentId, tabId: primary.tabId, shareCode: null };
  try {
    const [read, state] = await Promise.all([
      api.readVersion(scope, selected.id),
      api.loadState(scope),
    ]);
    const snapshot = bytesOfBase64(read.snapshot);
    if (!snapshot) return { ok: false, refusal: 'unreadable' };
    return { ok: true, value: asWritten(versionDocument([state], snapshot), primary.format) };
  } catch {
    return { ok: false, refusal: 'unreadable' };
  }
}

/** The selected document's writing, read as the person. */
async function readSelected(request: CompareRequest, api: CompareApi): Promise<Read<TextDocument>> {
  const { ownerId, selected } = request;
  if (selected.version) return readVersion(request, api);
  try {
    const document = await api.loadDocument(ownerId, selected.id);
    if (!document) return { ok: false, refusal: 'not-copyable' };
    const tab = document.tabs.find((t) => tabKindOf(t) === 'text-document');
    if (!tab) return { ok: false, refusal: 'unreadable' };
    const state = await api.loadState({
      ownerId,
      documentId: selected.id,
      tabId: tab.id,
      shareCode: null,
    });
    const format = (tab as { format?: TextDocumentFormat }).format ?? request.primary.format;
    return { ok: true, value: asWritten(TextDocumentState.load([state]), format) };
  } catch (error) {
    return { ok: false, refusal: refusedRead(error) ? 'not-copyable' : 'unreadable' };
  }
}

const refused = (refusal: CompareRefusal): CompareOutcome => {
  debugLog(`[text-document] compare refused reason=${refusal}`);
  return { ok: false, refusal };
};

/** Makes and stores a comparison of the primary against the selected document. */
export async function makeComparison(
  request: CompareRequest,
  api: CompareApi = COMPARE_API,
): Promise<CompareOutcome> {
  const started = performance.now();
  const selected = await readSelected(request, api);
  if (!selected.ok) return refused(selected.refusal);
  const { primary } = request;
  const result = TextDocumentComparison.compare(
    asWritten(primary.doc, primary.format),
    selected.value,
    {
      name: attribution(request.name),
      at: request.at,
      comments: request.comments,
    },
  );
  if (!result.ok) return refused(result.refusal);
  const { documentId, tabId } = createIdsFor(null);
  const name = comparisonName(primary.name, request.selected.name);
  const state = base64OfBytes(TextDocumentState.fromDocument(result.document));
  try {
    await createBeside(
      (place) =>
        api.create(request.ownerId, {
          id: documentId,
          name,
          tabs: [newTextDocumentTab(tabId, name, primary.format)],
          teamId: place.teamId,
          folderId: place.folderId,
          textDocuments: [{ tabId, state }],
        }),
      await placementOf(api.loadDocument, request.ownerId, primary.documentId),
    );
  } catch (error) {
    debugLog('[text-document] compare store failed', { error: String(error) });
    return refused('not-stored');
  }
  const ms = Math.round(performance.now() - started);
  debugLog(
    `[text-document] compared suggestions=${result.suggestions} leftOut=${result.leftOut} ms=${ms}`,
  );
  track('Document', 'Created', 'TextDocumentCompare');
  return { ok: true, documentId, suggestions: result.suggestions, leftOut: result.leftOut };
}
