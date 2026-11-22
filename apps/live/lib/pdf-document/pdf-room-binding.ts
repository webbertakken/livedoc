// Binds a PDF document's live changes to the room (docs/specs/035-pdf-documents/live-editing-and-storage.md
// "Storage", "Offline and This Browser", "Limits"): the binding every live tab kind has (docs/specs/006-document/
// kinds-outside-the-canvas.md "Live state"), with what the PDF document declares of its own. The surface reads the
// state before it opens the stored file, so the binding catches up as it binds; a change the room refuses is taken
// back.
import { PDF_FRAME_CHARS, PDF_LOCAL_SAVE_MS, PdfLiveChanges } from '@livedoc/pdf-documents';
import { apiLoadPdfState, apiPostPdfUpdate, type PdfDocumentScope } from '@/lib/api/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { LiveTabRoom } from '@/lib/live-tab/live-tab-bus';
import { liveTabCopies, type LiveTabCopyStore } from '@/lib/live-tab/live-tab-copies';
import {
  openLiveTabRoom,
  type LiveTabClientKind,
  type LiveTabFrame,
  type LiveTabStateSince,
} from '@/lib/live-tab/live-tab-room-binding';
import { liveTabSaveStatusSource } from '@/lib/live-tab/live-tab-save-status';
import { PdfDocumentBus } from './pdf-document-bus';
import type { BindPdfLiveChanges } from './pdf-live-binding';
import { unconfirmedPdfChanges } from './pdf-unconfirmed-changes';

export type PdfFrame = LiveTabFrame<'pdf'>;

const TAG = '[pdf]';

/** This browser's copies of PDF changes the room has not confirmed: a database of their own. */
export const PDF_DOCUMENT_COPIES_DB = 'livedoc-pdf-documents';

const PDF_LIVE_TAB: LiveTabClientKind<'pdf'> = {
  frame: 'pdf',
  tag: TAG,
  frameChars: PDF_FRAME_CHARS,
  localSaveMs: PDF_LOCAL_SAVE_MS,
  bus: PdfDocumentBus,
  load: (updates) => PdfLiveChanges.load(updates),
};

const CONNECTION = {
  get: () => LiveTabRoom.isConnected(),
  subscribe: (listener: () => void) => LiveTabRoom.onConnection(() => listener()),
};

export type PdfRoomBindingDeps = {
  scope: PdfDocumentScope;
  // Whether this session may change the PDF; a Viewer's surface never sends.
  readonly canChange: boolean;
  // One frame to the room; true once the room has stored it.
  sequence: (op: PdfFrame) => Promise<boolean>;
  // The doors and the copies, the browser's own unless a test hands others.
  post?: (update: Uint8Array) => Promise<void>;
  loadSince?: (stateVector: Uint8Array) => Promise<LiveTabStateSince>;
  copies?: LiveTabCopyStore;
  saveDelayMs?: number;
};

/** The binding of one PDF tab's surface to its document's room. */
export const pdfRoomBinding =
  (deps: PdfRoomBindingDeps): BindPdfLiveChanges =>
  async (read) => {
    const { scope } = deps;
    const { tabId } = scope;
    const binding = await openLiveTabRoom(PDF_LIVE_TAB, {
      documentId: scope.documentId,
      tabId,
      get canEdit() {
        return deps.canChange;
      },
      sequence: deps.sequence,
      post: deps.post ?? ((update) => apiPostPdfUpdate(scope, update)),
      loadState: async () => read.update,
      stateReadEarlier: true,
      loadSince: deps.loadSince ?? ((vector) => apiLoadPdfState(scope, vector)),
      copies: deps.copies ?? liveTabCopies(PDF_DOCUMENT_COPIES_DB),
      ...(deps.saveDelayMs === undefined ? {} : { saveDelayMs: deps.saveDelayMs }),
    });
    const { doc, saveFacts } = binding;
    const unconfirmed = unconfirmedPdfChanges(doc);
    const offFacts = saveFacts.subscribe(() => {
      if (!saveFacts.get().pending) unconfirmed.confirmed();
    });
    const listeners = new Set<() => void>();
    const offRefused = PdfDocumentBus.onRefused(tabId, (limit) => {
      const undone = unconfirmed.undoNewest();
      debugLog(`${TAG} change-undone`, { tabId, limit, undone });
      for (const listener of listeners) listener();
    });
    return {
      doc,
      saveStatus: liveTabSaveStatusSource(TAG, saveFacts, false, CONNECTION, debugLog),
      onRefused: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close: () => {
        offRefused();
        offFacts();
        unconfirmed.close();
        listeners.clear();
        binding.close();
      },
    };
  };
