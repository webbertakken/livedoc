// Binds a PDF document's live changes to the room (docs/specs/035-pdf-documents/live-editing-and-storage.md
// "Storage", "Offline and This Browser", "Limits"): the binding every live tab kind has (docs/specs/006-document/
// kinds-outside-the-canvas.md "Live state"), with what the PDF document declares of its own. The surface reads the
// state before it opens the stored file, so the binding catches up as it binds; a change the room refuses is told
// to the surface, which discards this binding and binds the state again; and so is the stored file's replacement,
// however it is learnt: the room's op, a change refused for it, or a catch-up that reads another file's state. What
// the room has not confirmed is read entry by entry ("A change carried across a replacement"), from the binding and
// from a local copy left behind on another stored file, for the surface to make again on the new one.
import type { BlobKey } from '@livedoc/document';
import {
  PDF_FRAME_CHARS,
  PDF_LOCAL_SAVE_MS,
  PdfLiveChanges,
  PdfUnconfirmed,
} from '@livedoc/pdf-documents';
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
import { PdfDocumentBus, PdfStoredFiles, type PdfDocumentRefusal } from './pdf-document-bus';
import type { BindPdfLiveChanges } from './pdf-live-binding';

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
  loadSince?: (stateVector: Uint8Array) => Promise<LiveTabStateSince & { storedFile?: BlobKey }>;
  copies?: LiveTabCopyStore;
  saveDelayMs?: number;
};

/** The binding of one PDF tab's surface to its document's room. */
export const pdfRoomBinding =
  (deps: PdfRoomBindingDeps): BindPdfLiveChanges =>
  async (read) => {
    const { scope } = deps;
    const { tabId } = scope;
    const movedListeners = new Set<() => void>();
    // Told once: every way of learning it ends in the surface opening the new file.
    const moved = () => {
      const hearing = [...movedListeners];
      movedListeners.clear();
      if (hearing.length > 0) debugLog(`${TAG} stored-file-moved`, { tabId });
      for (const listener of hearing) listener();
    };
    const binding = await openLiveTabRoom(PDF_LIVE_TAB, {
      documentId: scope.documentId,
      tabId,
      get canEdit() {
        return deps.canChange;
      },
      sequence: deps.sequence,
      on: read.storedFile,
      post: deps.post ?? ((update) => apiPostPdfUpdate(scope, update, read.storedFile)),
      loadState: async () => read.update,
      stateReadEarlier: true,
      loadSince: async (vector) => {
        const since = await (deps.loadSince ?? ((v) => apiLoadPdfState(scope, v)))(vector);
        // A replacement this editor never heard of: what was read is another file's changes, and none of it is
        // merged into these.
        if (since.storedFile !== undefined && since.storedFile !== read.storedFile) {
          moved();
          throw new Error('the stored file was replaced');
        }
        return since;
      },
      beyond: (room, live) => PdfUnconfirmed.read(room, live),
      copies: deps.copies ?? liveTabCopies(PDF_DOCUMENT_COPIES_DB),
      ...(deps.saveDelayMs === undefined ? {} : { saveDelayMs: deps.saveDelayMs }),
    });
    const { doc, saveFacts } = binding;
    const listeners = new Set<(refusal: PdfDocumentRefusal) => void>();
    const offRefused = PdfDocumentBus.onRefused(tabId, (refusal) => {
      debugLog(`${TAG} change-refused`, { tabId, refusal });
      // Refused for the file it was made on: the file was replaced, which is told as that.
      if (refusal === 'stored_file_changed') moved();
      else for (const listener of [...listeners]) listener(refusal);
    });
    const offReplaced = PdfStoredFiles.onReplaced(tabId, moved);
    const stop = () => {
      offRefused();
      offReplaced();
      listeners.clear();
      movedListeners.clear();
    };
    return {
      doc,
      saveStatus: liveTabSaveStatusSource(TAG, saveFacts, false, CONNECTION, debugLog),
      onRefused: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onMoved: (listener) => {
        movedListeners.add(listener);
        return () => movedListeners.delete(listener);
      },
      isSaved: () => {
        const facts = saveFacts.get();
        return !facts.pending && !facts.failed && LiveTabRoom.isConnected();
      },
      // A Viewer's surface sends nothing, so it has nothing to carry.
      unconfirmed: () => (deps.canChange ? PdfUnconfirmed.parse(binding.beyond()) : []),
      left: PdfUnconfirmed.parse(binding.left),
      close: () => {
        stop();
        binding.close();
      },
      discard: () => {
        stop();
        return binding.discard();
      },
    };
  };
