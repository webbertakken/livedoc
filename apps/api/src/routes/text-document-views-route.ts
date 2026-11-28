// A text document's views (docs/specs/034-text-documents/agents-and-sync.md "Reading"): its tab holds writing, not
// elements, so `outline`, `text` and `structure` read its live state, a Viewer's through their copy (no comments, no
// authors), and the element views are refused. Answered after the tab GET's gate and scope, as every view is.
import { tabEtag, TEXT_DOCUMENT_STATE_VECTOR_HEADER } from '@livedoc/api-schema';
import {
  documentTabOf,
  ELEMENT_VIEW_ON_TEXT_DOCUMENT,
  NO_SUCH_DOCUMENT_TAB,
  textDocumentOutlineView,
  textDocumentStructureView,
  textDocumentTextView,
  type ViewRequest,
} from '@livedoc/document-views';
import {
  base64OfBytes,
  ParagraphRefs,
  TextDocumentState,
  type TextDocument,
} from '@livedoc/text-documents';
import { readLiveTabState } from '../live-tabs/live-tab-store';
import { json, textPlain } from '../responses';
import { viewerStateOf } from '../text-documents/room-viewer-copies';
import { TEXT_DOCUMENT_LIVE_TAB } from '../text-documents/text-document-live-tab';
import { storedTextDocumentTab } from '../text-documents/text-document-store';
import type { DocumentDTO, DocumentEnv, TabDTO } from '../types';

export type TextDocumentViewAnswer = {
  response: Response;
  view: 'outline' | 'text' | 'structure';
} | null;

const refused = (view: TextDocumentViewName, message: string): TextDocumentViewAnswer => {
  console.info('[views] text-document refused', { view, message });
  return { response: json({ error: 'invalid_value', message }, { status: 400 }), view };
};

type TextDocumentViewName = 'outline' | 'text' | 'structure';
const isTextDocumentView = (view: string): view is TextDocumentViewName =>
  view === 'outline' || view === 'text' || view === 'structure';

const unreadable = (
  where: Record<string, unknown>,
  view: TextDocumentViewName,
): TextDocumentViewAnswer => {
  console.warn('[views] text-document unreadable', where);
  return {
    response: json({ error: 'text_document_unreadable' }, { status: 503 }),
    view,
  };
};

/** A text document tab's model as it stands, a Viewer's through their copy; null when it cannot be read. */
export async function readTextDocumentModel(
  env: DocumentEnv,
  documentId: string,
  tabId: string,
  viewer: boolean,
): Promise<{ document: TextDocument; stateVector: Uint8Array } | null> {
  const stored = await storedTextDocumentTab(env, documentId, tabId);
  if (!stored) return null;
  const state = await readLiveTabState(env, TEXT_DOCUMENT_LIVE_TAB, tabId);
  const read = viewer ? viewerStateOf(state, { documentId, tabId }) : state;
  if (!read) return null;
  return {
    document: TextDocumentState.document(TextDocumentState.load([read]), stored.format),
    // The state read (a Viewer's, their copy), which a changeset gives back as its base (agents-and-sync.md "Reading").
    stateVector: TextDocumentState.stateVectorOf(read),
  };
}

// The view of a text document's tab, or null when the tab is none (the tab's own views answer).
export async function answerTextDocumentView(
  env: DocumentEnv,
  request: ViewRequest,
  asJson: boolean,
  document: DocumentDTO,
  tab: TabDTO,
  viewer: boolean,
): Promise<TextDocumentViewAnswer> {
  if (tab.kind !== 'text-document') return null;
  const view = request.view;
  if (!isTextDocumentView(view))
    return refused('outline', `${view} ${ELEMENT_VIEW_ON_TEXT_DOCUMENT}`);
  const started = Date.now();
  let read: Awaited<ReturnType<typeof readTextDocumentModel>>;
  try {
    read = await readTextDocumentModel(env, document.id, tab.id, viewer);
  } catch (error) {
    return unreadable({ doc: document.id, tab: tab.id, error: String(error) }, view);
  }
  if (!read) return unreadable({ doc: document.id, tab: tab.id, viewer }, view);
  const doc = read.document;
  const documentTab = documentTabOf(doc, request.only);
  if (!documentTab) return refused(view, NO_SUCH_DOCUMENT_TAB);
  const opts = { budget: request.budget, door: request.door };
  let rendered: { text: string; json: unknown };
  if (view === 'outline')
    rendered = textDocumentOutlineView(
      { name: document.name, document: doc, current: documentTab.id },
      opts,
    );
  else if (view === 'structure')
    rendered = textDocumentStructureView({ document: doc, tab: documentTab }, opts);
  else {
    const read = textDocumentTextView(
      { document: doc, tab: documentTab, range: request.range, lines: request.lines },
      { ...opts, only: request.only },
    );
    if (!read.ok) return refused(view, read.message);
    rendered = read;
  }
  const { text, json: body } = rendered;
  console.info(`[views] text-document ${view}`, {
    doc: document.id,
    tab: tab.id,
    paragraphs: ParagraphRefs.of(documentTab.body).length,
    chars: text.length,
    ms: Date.now() - started,
  });
  const headers = {
    ETag: tabEtag(tab.rev),
    [TEXT_DOCUMENT_STATE_VECTOR_HEADER]: base64OfBytes(read.stateVector),
  };
  return {
    response: asJson ? json(body, { headers }) : textPlain(text, { headers }),
    view,
  };
}
