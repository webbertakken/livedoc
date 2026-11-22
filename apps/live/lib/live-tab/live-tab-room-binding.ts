// Binds a live tab kind's state to the room (docs/specs/006-document/kinds-outside-the-canvas.md "Live state";
// docs/specs/034-text-documents/live-editing-and-storage.md "Sending", "Reconnecting", "The local copy"), the kind
// declaring only what is its own:
// - the room's updates are taken from before the state is read, held until it is, so none fall between the two; a
//   state read earlier than that is caught up at once;
// - every change made here goes out as one op of the kind while the room is open, or by the door when too large
//   for a frame; while the room is closed nothing goes out, and the next open catches up;
// - a catch-up reads what the room holds beyond this browser and sends what the room lacks; Yjs makes both harmless
//   to repeat, so nothing is lost or doubled;
// - an edit the room has not confirmed in time is kept in this browser's local copy, deleted once the room holds it,
//   and a copy left behind is merged and sent when the tab is opened again;
// - a binding closed or discarded never sends again, whatever answer arrives late; a discarded one keeps no local
//   copy, so a change the room refused is gone from this browser.
import * as Y from 'yjs';
import { base64OfBytes } from '@livedoc/text-documents/base64';
import { debugLog } from '@/lib/debug-log';
import { CopyLedger } from './copy-ledger';
import type { LiveTabBus } from './live-tab-bus';
import type { LiveTabCopy, LiveTabCopyStore } from './live-tab-copies';
import { liveTabSaveFacts, type SaveFactsSource } from './live-tab-save-status';

/** The origin a room update is applied with, so the provider never echoes it. */
export const ROOM_ORIGIN = Symbol('room');
/** The origin a local copy left behind is merged with: sent by the catch-up, never as an edit of its own. */
export const COPY_ORIGIN = Symbol('local-copy');

// An update with no structs and no deletions: two zero counts.
const EMPTY_UPDATE_BYTES = 2;

/** What a live tab kind declares to its binding. */
export type LiveTabClientKind<Frame extends string> = {
  /** The op kind of its frames. */
  readonly frame: Frame;
  /** Its log tag, as the room's: `[text-document]`, `[pdf]`. */
  readonly tag: string;
  /** The most base64 one frame carries; a larger update goes by the door. */
  readonly frameChars: number;
  /** How long a change the room has not confirmed waits before this browser keeps it. */
  readonly localSaveMs: number;
  readonly bus: Pick<LiveTabBus<string>, 'isConnected' | 'onUpdate' | 'onConnection' | 'onResync'>;
  /** A live document of the kind holding the given updates. */
  readonly load: (updates: readonly Uint8Array[]) => Y.Doc;
};

export type LiveTabFrame<Frame extends string> = { kind: Frame; tabId: string; update: string };

/** What a read of the state beyond a state vector answers: the update, and the state's own vector. */
export type LiveTabStateSince = { update: Uint8Array; stateVector: Uint8Array };

export type LiveTabRoomDeps<Frame extends string> = {
  documentId: string;
  tabId: string;
  // Whether this session may change the writing; a viewer's document never sends.
  readonly canEdit: boolean;
  // One frame to the room; true once the room has stored it.
  sequence: (op: LiveTabFrame<Frame>) => Promise<boolean>;
  // One update by the door; resolves once the room has stored it.
  post: (update: Uint8Array) => Promise<void>;
  loadState: () => Promise<Uint8Array>;
  // The state was read before this binding could hear the room (the surface had work to do in between): what the
  // room relayed since is read at once.
  readonly stateReadEarlier?: boolean;
  loadSince: (stateVector: Uint8Array) => Promise<LiveTabStateSince>;
  copies: LiveTabCopyStore;
  saveDelayMs?: number;
};

export type LiveTabRoomBinding = {
  doc: Y.Doc;
  /** Stop listening; an edit the room has not confirmed is kept in the local copy first. */
  close: () => void;
  /** Settles once every local copy write and removal asked so far has. */
  settled: () => Promise<void>;
  /** What the save status reads (editing-surface.md "The title row"). */
  saveFacts: SaveFactsSource;
};

/** A binding to the room, which alone can refuse a change: it can be discarded. */
export type LiveTabOpenRoomBinding = LiveTabRoomBinding & {
  /**
   * Stop for good and keep nothing: the local copy is removed, with whatever the room has not confirmed. For a
   * surface whose change the room refused, which then binds the state again as the room holds it.
   */
  discard: () => Promise<void>;
};

const isEmpty = (update: Uint8Array) => update.byteLength <= EMPTY_UPDATE_BYTES;

async function readCopy(
  tag: string,
  deps: Pick<LiveTabRoomDeps<string>, 'copies' | 'documentId' | 'tabId'>,
): Promise<LiveTabCopy | null> {
  try {
    return await deps.copies.read({ documentId: deps.documentId, tabId: deps.tabId });
  } catch (error: unknown) {
    debugLog(`${tag} local-copy-failed`, { tabId: deps.tabId, error: String(error) });
    return null;
  }
}

/** Read the state (and any local copy left behind), then bind it to the room. Rejects when the state cannot be read. */
export async function openLiveTabRoom<Frame extends string>(
  kind: LiveTabClientKind<Frame>,
  deps: LiveTabRoomDeps<Frame>,
): Promise<LiveTabOpenRoomBinding> {
  const { documentId, tabId } = deps;
  const { tag, bus } = kind;
  const key = { documentId, tabId };
  const saveDelay = deps.saveDelayMs ?? kind.localSaveMs;
  let doc: Y.Doc | null = null;
  const early: Uint8Array[] = [];
  // Whether the room may have relayed something this surface never heard: it read the state with the room closed,
  // or the room closed since. The next open catches up.
  let missed = !bus.isConnected() || deps.stateReadEarlier === true;
  let resyncAsked = false;
  const offUpdate = bus.onUpdate(tabId, (update) => {
    if (doc) Y.applyUpdate(doc, update, ROOM_ORIGIN);
    else early.push(update);
  });
  const offConnection = bus.onConnection((open) => {
    if (!open) missed = true;
    else if (missed && doc) {
      missed = false;
      void catchUp();
    }
  });
  const offResync = bus.onResync((which) => {
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
  let left: LiveTabCopy | null;
  try {
    [state, left] = await Promise.all([deps.loadState(), readCopy(tag, deps)]);
  } catch (error) {
    stopListening();
    throw error;
  }

  const live = kind.load([state]);
  doc = live;
  // What the room is known to hold: the local copy is what this browser has beyond it.
  let base = Y.encodeStateVectorFromUpdate(state);
  let ledger = CopyLedger.empty();
  let copyStored = left !== null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let catching = false;
  let catchAgain = false;
  // Closed or discarded: nothing is sent or kept from here on, whatever answer arrives late.
  let stopped = false;
  // Failed: the door refused an update, or this browser could not keep its copy; both last until the room holds
  // everything here (or, for the copy, until a write succeeds).
  const facts = liveTabSaveFacts(tag, tabId, debugLog);
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
        debugLog(`${tag} local-copy saved`, { tabId, bytes: update.byteLength });
      })
      .catch((error: unknown) => {
        copyFailed = true;
        syncFacts();
        debugLog(`${tag} local-copy-failed`, { tabId, error: String(error) });
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
        debugLog(`${tag} local-copy cleared`, { tabId });
      })
      .catch((error: unknown) =>
        debugLog(`${tag} local-copy-failed`, { tabId, error: String(error) }),
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
    const framed = encoded.length <= kind.frameChars;
    try {
      if (framed) stored = await deps.sequence({ kind: kind.frame, tabId, update: encoded });
      else {
        await deps.post(update);
        stored = true;
        debugLog(`${tag} sent-by-door`, { tabId, bytes: update.byteLength });
      }
    } catch (error: unknown) {
      refused = true;
      debugLog(`${tag} sent-by-door refused`, { tabId, error: String(error) });
    }
    ledger = CopyLedger.settled(ledger, stored);
    ledgerChanged();
    if (!stored && framed && edit && bus.isConnected()) void catchUp();
    return stored;
  };

  async function catchUp(): Promise<void> {
    if (stopped) return;
    if (catching) {
      catchAgain = true;
      return;
    }
    catching = true;
    const generation = ledger.generation;
    try {
      const since = await deps.loadSince(Y.encodeStateVector(live));
      if (stopped) return;
      Y.applyUpdate(live, since.update, ROOM_ORIGIN);
      const missing = Y.encodeStateAsUpdate(live, since.stateVector);
      const stored = !deps.canEdit || isEmpty(missing) || (await send(missing, false));
      if (stored) {
        ledger = CopyLedger.caughtUp(ledger, generation);
        ledgerChanged();
      }
      debugLog(`${tag} caught-up`, {
        tabId,
        read: since.update.byteLength,
        sent: deps.canEdit && !isEmpty(missing) ? missing.byteLength : 0,
      });
    } catch (error: unknown) {
      debugLog(`${tag} catch-up failed`, { tabId, error: String(error) });
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
    if (bus.isConnected()) void send(update, true);
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
    const missing = Y.diffUpdate(left.update, base);
    debugLog(`${tag} merge-offline`, { tabId, bytes: left.update.byteLength });
    if (isEmpty(missing)) ledgerChanged();
    else if (deps.canEdit) {
      ledger = CopyLedger.held(ledger);
      missed = true;
    }
  }

  if ((missed || resyncAsked) && bus.isConnected()) {
    missed = false;
    void catchUp();
  }

  // Leaving the page with an edit the room has not confirmed: kept now, not after the delay.
  const onHide = () => {
    if (document.visibilityState === 'hidden') writeCopy();
  };
  window.addEventListener('pagehide', writeCopy);
  document.addEventListener('visibilitychange', onHide);

  const stop = () => {
    stopped = true;
    stopListening();
    live.off('update', onLocal);
    window.removeEventListener('pagehide', writeCopy);
    document.removeEventListener('visibilitychange', onHide);
  };
  return {
    doc: live,
    close: () => {
      if (stopped) return;
      stop();
      writeCopy();
    },
    discard: () => {
      stop();
      if (timer !== null) clearTimeout(timer);
      timer = null;
      chain = chain
        .then(async () => {
          await deps.copies.remove(key);
          copyStored = false;
          debugLog(`${tag} local-copy discarded`, { tabId });
        })
        .catch((error: unknown) =>
          debugLog(`${tag} local-copy-failed`, { tabId, error: String(error) }),
        );
      return chain;
    },
    settled: () => chain,
    saveFacts: { get: facts.get, subscribe: facts.subscribe },
  };
}
