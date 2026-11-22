// Binds a PDF document's live changes to This Browser (docs/specs/035-pdf-documents/live-editing-and-storage.md "A
// PDF document in This Browser"): the binding every live tab kind has there, with what the PDF document declares of
// its own. There is no room, so nothing is refused, nothing waits to be confirmed, and the stored file is never
// replaced under the surface: the changes are saved into the document's offline record, and the save status says so.
import { PDF_LOCAL_SAVE_MS, PDF_LOCAL_SAVE_RETRY_MS, PdfLiveChanges } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import {
  openLiveTabLocal,
  type LiveTabLocalDeps,
  type LiveTabLocalKind,
} from '@/lib/live-tab/live-tab-local-binding';
import { liveTabSaveStatusSource } from '@/lib/live-tab/live-tab-save-status';
import { offlinePdfStateRead, offlineSavePdfState } from '@/lib/offline/offline-pdf-documents';
import type { BindPdfLiveChanges } from './pdf-live-binding';

const TAG = '[pdf]';

/** The channel a PDF document's browser tabs pass each change on. */
export const PDF_DOCUMENT_CHANNEL = 'livedoc-pdf-document';

const PDF_LOCAL_TAB: LiveTabLocalKind = {
  tag: TAG,
  channel: PDF_DOCUMENT_CHANNEL,
  saveMs: PDF_LOCAL_SAVE_MS,
  retryMs: PDF_LOCAL_SAVE_RETRY_MS,
  load: (updates) => PdfLiveChanges.load(updates),
};

// This Browser has no connection to lose.
const ALWAYS_THERE = { get: () => true, subscribe: () => () => {} };
const never = () => () => {};

export type PdfLocalBindingDeps = {
  documentId: string;
  tabId: string;
  // The record's own doors, the channel and the delays, unless a test hands others.
  load?: LiveTabLocalDeps['load'];
  save?: LiveTabLocalDeps['save'];
  channel?: LiveTabLocalDeps['channel'];
  saveDelayMs?: number;
  retryDelayMs?: number;
};

/** The binding of one PDF tab's surface to its document's offline record. */
export const pdfLocalBinding =
  (deps: PdfLocalBindingDeps): BindPdfLiveChanges =>
  async () => {
    const { documentId, tabId } = deps;
    const binding = await openLiveTabLocal(PDF_LOCAL_TAB, {
      documentId,
      tabId,
      // A This Browser document has one person, its owner.
      canEdit: true,
      // Read again as it binds: another browser tab may have saved since the surface read the state.
      load: deps.load ?? (async () => (await offlinePdfStateRead(documentId, tabId)).update),
      save: deps.save ?? ((update) => offlineSavePdfState(documentId, tabId, update)),
      ...(deps.channel ? { channel: deps.channel } : {}),
      ...(deps.saveDelayMs === undefined ? {} : { saveDelayMs: deps.saveDelayMs }),
      ...(deps.retryDelayMs === undefined ? {} : { retryDelayMs: deps.retryDelayMs }),
    });
    const { saveFacts } = binding;
    const close = async () => {
      binding.close();
      await binding.settled();
    };
    return {
      doc: binding.doc,
      saveStatus: liveTabSaveStatusSource(TAG, saveFacts, true, ALWAYS_THERE, debugLog),
      onRefused: never,
      onMoved: never,
      isSaved: () => {
        const facts = saveFacts.get();
        return !facts.pending && !facts.failed;
      },
      unconfirmed: () => [],
      left: [],
      close: () => void close(),
      discard: close,
    };
  };
