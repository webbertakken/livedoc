// Binds a text document's live state to the room (docs/specs/034-text-documents/live-editing-and-storage.md "Sending",
// "Reconnecting", "The local copy"):
// - the room's updates are taken from before the state is read, held until it is, so none fall between the two;
// - every change made here goes out as one `text-document` op while the room is open, or by the door when too large
//   for a frame; while the room is closed nothing goes out, and the next open catches up;
// - a catch-up reads what the room holds beyond this browser and sends what the room lacks; Yjs makes both harmless
//   to repeat, so nothing is lost or doubled;
// - an edit the room has not confirmed in time is kept in this browser's local copy, deleted once the room holds it,
//   and a copy left behind is merged and sent when the tab is opened again.
import * as Y from 'yjs';
import {
  base64OfBytes,
  TEXT_DOCUMENT_FRAME_CHARS,
  TEXT_DOCUMENT_LOCAL_SAVE_MS,
  TextDocumentState,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { saveFactsStore, type SaveFactsSource } from './text-document-save-status';
import type { TextDocumentStateSince } from '@/lib/api/text-documents';
import { CopyLedger } from './copy-ledger';
import { TextDocumentBus } from './text-document-bus';
import type { TextDocumentCopy, TextDocumentCopyStore } from './text-document-copies';

/** The origin a room update is applied with, so the provider never echoes it. */
export const ROOM_ORIGIN = Symbol('room');
/** The origin a local copy left behind is merged with: sent by the catch-up, never as an edit of its own. */
export const COPY_ORIGIN = Symbol('local-copy');

// An update with no structs and no deletions: two zero counts.
const EMPTY_UPDATE_BYTES = 2;

export type TextDocumentFrame = { kind: 'text-document'; tabId: string; update: string };

export type RoomYjsDeps = {
  documentId: string;
  tabId: string;
  // Whether this session may change the writing; a viewer's document never sends.
  readonly canEdit: boolean;
  // One frame to the room; true once the room has stored it.
  sequence: (op: TextDocumentFrame) => Promise<boolean>;
  // One update by the door; resolves once the room has stored it.
  post: (update: Uint8Array) => Promise<void>;
  loadState: () => Promise<Uint8Array>;
  loadSince: (stateVector: Uint8Array) => Promise<TextDocumentStateSince>;
  copies: Pick<TextDocumentCopyStore, 'read' | 'write' | 'remove'>;
  saveDelayMs?: number;
};

export type RoomYjsBinding = {
  doc: Y.Doc;
  /** Stop listening; an edit the room has not confirmed is kept in the local copy first. */
  close: () => void;
  /** Settles once every local copy write and removal asked so far has. */
  settled: () => Promise<void>;
  /** What the save status reads (editing-surface.md "The title row"). */
  saveFacts: SaveFactsSource;
};

const isEmpty = (update: Uint8Array) => update.byteLength <= EMPTY_UPDATE_BYTES;

async function readCopy(deps: RoomYjsDeps): Promise<TextDocumentCopy | null> {
  try {
    return await deps.copies.read({ documentId: deps.documentId, tabId: deps.tabId });
  } catch (error: unknown) {
    debugLog('[text-document] local-copy-failed', { tabId: deps.tabId, error: String(error) });
    return null;
  }
}

/** Read the state (and any local copy left behind), then bind it to the room. Rejects when the state cannot be read. */
export async function openRoomYjs(deps: RoomYjsDeps): Promise<RoomYjsBinding> {
  const { documentId, tabId } = deps;
  const key = { documentId, tabId };
  const saveDelay = deps.saveDelayMs ?? TEXT_DOCUMENT_LOCAL_SAVE_MS;
  let doc: Y.Doc | null = null;
  const early: Uint8Array[] = [];
  // Whether the room may have relayed something this surface never heard: it read the state with the room closed,
  // or the room closed since. The next open catches up.
  let missed = !TextDocumentBus.isConnected();
  let resyncAsked = false;
  const offUpdate = TextDocumentBus.onUpdate(tabId, (update) => {
    if (doc) Y.applyUpdate(doc, update, ROOM_ORIGIN);
    else early.push(update);
  });
  const offConnection = TextDocumentBus.onConnection((open) => {
    if (!open) missed = true;
    else if (missed && doc) {
      missed = false;
      void catchUp();
    }
  });
  const offResync = TextDocumentBus.onResync((which) => {
    if (which !== null && which !== tabId) return;
    if (doc) void catchUp();
    else resyncAsked = true;
  });
  const stopListening = () => {
    offUpdate();
    offConnection();
    offResync();
  };

  let state: Uint8Array;
  let left: TextDocumentCopy | null;
  try {
    [state, left] = await Promise.all([deps.loadState(), readCopy(deps)]);
  } catch (error) {
    stopListening();
    throw error;
  }

  const live = TextDocumentState.load([state]);
  doc = live;
  // What the room is known to hold: the local copy is what this browser has beyond it.
  let base = TextDocumentState.stateVectorOf(state);
  let ledger = CopyLedger.empty();
  let copyStored = left !== null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let catching = false;
  let catchAgain = false;
  // Failed: the door refused an update, or this browser could not keep its copy; both last until the room holds
  // everything here (or, for the copy, until a write succeeds).
  const facts = saveFactsStore(tabId, debugLog);
  let refused = false;
  let copyFailed = false;
  const syncFacts = () => {
    if (CopyLedger.isClean(ledger)) refused = copyFailed = false;
    facts.set({ pending: !CopyLedger.isClean(ledger), failed: refused || copyFailed });
  };

  for (const update of early.splice(0)) Y.applyUpdate(live, update, ROOM_ORIGIN);

  const writeCopy = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (CopyLedger.isClean(ledger)) return;
    // Taken now: the document may be gone by the time the write runs.
    const update = Y.encodeStateAsUpdate(live, base);
    chain = chain
      .then(() => deps.copies.write({ ...key, update, savedAt: Date.now() }))
      .then(() => {
        copyStored = true;
        copyFailed = false;
        syncFacts();
        debugLog('[text-document] local-copy saved', { tabId, bytes: update.byteLength });
      })
      .catch((error: unknown) => {
        copyFailed = true;
        syncFacts();
        debugLog('[text-document] local-copy-failed', { tabId, error: String(error) });
      });
  };
  const scheduleCopy = () => {
    if (timer === null) timer = setTimeout(writeCopy, saveDelay);
  };
  // The ledger changed: once clean, the room holds everything here, so the copy goes and the base moves up.
  const ledgerChanged = () => {
    syncFacts();
    if (!CopyLedger.isClean(ledger)) {
      scheduleCopy();
      return;
    }
    if (timer !== null) clearTimeout(timer);
    timer = null;
    base = Y.encodeStateVector(live);
    chain = chain
      .then(async () => {
        // Only a session that may send owns the copy: a viewer (the other pane of a split) never drops unsent edits.
        if (!copyStored || !deps.canEdit || !CopyLedger.isClean(ledger)) return;
        await deps.copies.remove(key);
        copyStored = false;
        debugLog('[text-document] local-copy cleared', { tabId });
      })
      .catch((error: unknown) =>
        debugLog('[text-document] local-copy-failed', { tabId, error: String(error) }),
      );
  };

  // One update to the room, as a frame when it fits one, else by the door; answers whether the room stored it. A
  // frame of an edit the open room did not confirm (no answer in time) is caught up at once; the door's refusal is
  // not retried until the next open, so a refused update never loops.
  const send = async (update: Uint8Array, edit: boolean): Promise<boolean> => {
    ledger = CopyLedger.sent(ledger);
    syncFacts();
    const encoded = base64OfBytes(update);
    let stored = false;
    const framed = encoded.length <= TEXT_DOCUMENT_FRAME_CHARS;
    try {
      if (framed) stored = await deps.sequence({ kind: 'text-document', tabId, update: encoded });
      else {
        await deps.post(update);
        stored = true;
        debugLog('[text-document] sent-by-door', { tabId, bytes: update.byteLength });
      }
    } catch (error: unknown) {
      refused = true;
      debugLog('[text-document] sent-by-door refused', { tabId, error: String(error) });
    }
    ledger = CopyLedger.settled(ledger, stored);
    ledgerChanged();
    if (!stored && framed && edit && TextDocumentBus.isConnected()) void catchUp();
    return stored;
  };

  async function catchUp(): Promise<void> {
    if (catching) {
      catchAgain = true;
      return;
    }
    catching = true;
    const generation = ledger.generation;
    try {
      const since = await deps.loadSince(Y.encodeStateVector(live));
      Y.applyUpdate(live, since.update, ROOM_ORIGIN);
      const missing = Y.encodeStateAsUpdate(live, since.stateVector);
      const stored = !deps.canEdit || isEmpty(missing) || (await send(missing, false));
      if (stored) {
        ledger = CopyLedger.caughtUp(ledger, generation);
        ledgerChanged();
      }
      debugLog('[text-document] caught-up', {
        tabId,
        read: since.update.byteLength,
        sent: deps.canEdit && !isEmpty(missing) ? missing.byteLength : 0,
      });
    } catch (error: unknown) {
      debugLog('[text-document] catch-up failed', { tabId, error: String(error) });
    } finally {
      catching = false;
      if (catchAgain) {
        catchAgain = false;
        void catchUp();
      }
    }
  }

  const onLocal = (update: Uint8Array, origin: unknown) => {
    if (origin === ROOM_ORIGIN || origin === COPY_ORIGIN || !deps.canEdit) return;
    if (TextDocumentBus.isConnected()) void send(update, true);
    else {
      ledger = CopyLedger.held(ledger);
      ledgerChanged();
    }
    scheduleCopy();
  };
  live.on('update', onLocal);

  // A copy left behind (a closed tab, a crash) merges now; what the room lacks of it goes with the catch-up.
  if (left) {
    Y.applyUpdate(live, left.update, COPY_ORIGIN);
    const missing = TextDocumentState.since(left.update, base);
    debugLog('[text-document] merge-offline', { tabId, bytes: left.update.byteLength });
    if (isEmpty(missing)) ledgerChanged();
    else if (deps.canEdit) {
      ledger = CopyLedger.held(ledger);
      missed = true;
    }
  }

  if ((missed || resyncAsked) && TextDocumentBus.isConnected()) {
    missed = false;
    void catchUp();
  }

  // Leaving the page with an edit the room has not confirmed: kept now, not after the delay.
  const onHide = () => {
    if (document.visibilityState === 'hidden') writeCopy();
  };
  window.addEventListener('pagehide', writeCopy);
  document.addEventListener('visibilitychange', onHide);

  return {
    doc: live,
    close: () => {
      stopListening();
      live.off('update', onLocal);
      window.removeEventListener('pagehide', writeCopy);
      document.removeEventListener('visibilitychange', onHide);
      writeCopy();
    },
    settled: () => chain,
    saveFacts: { get: facts.get, subscribe: facts.subscribe },
  };
}
