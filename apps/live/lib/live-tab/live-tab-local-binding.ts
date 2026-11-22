// Binds a live tab kind's state to This Browser (docs/specs/006-document/kinds-outside-the-canvas.md "Live state";
// docs/specs/035-pdf-documents/live-editing-and-storage.md "A PDF document in This Browser"), the kind declaring
// only what is its own: no room; the state is read from where the kind keeps it and saved there a moment after a
// change, and at once when the page is hidden or the tab closes. Each save sends what changed since the last one,
// which the store merges into what it holds, so another browser tab's saves are never undone. Browser tabs on the
// same tab pass each change to each other on the kind's BroadcastChannel, so both stay live. A failed save is
// written again by itself. A save begun as the page goes is never finished by the browser, so each save "at once"
// is preceded by a parting copy ("A page's last moment"), which the next binding of the tab joins to the store.
import * as Y from 'yjs';
import { debugLog } from '@/lib/debug-log';
import { joinPartingCopies, partingCopy } from './live-tab-parting';
import { partingStorage, type PartingStorage } from './live-tab-parting-keys';
import { liveTabSaveFacts, type SaveFactsSource } from './live-tab-save-status';

/** The origin another browser tab's change is applied with: that tab saves it, so this one never sends it on. */
export const BROWSER_TAB_ORIGIN = Symbol('browser-tab');

/** What a live tab kind declares to its binding in This Browser. */
export type LiveTabLocalKind = {
  /** Its log tag, as the room's: `[pdf]`. */
  readonly tag: string;
  /** The BroadcastChannel its browser tabs share. */
  readonly channel: string;
  /** How long a change waits before it is saved. */
  readonly saveMs: number;
  /** How long a failed save waits before it is written again. */
  readonly retryMs: number;
  /** A live document of the kind holding the given updates. */
  readonly load: (updates: readonly Uint8Array[]) => Y.Doc;
};

type ChannelMessage = { documentId: string; tabId: string; update: Uint8Array };
export type LiveTabLocalChannel = Pick<BroadcastChannel, 'postMessage' | 'close'> & {
  onmessage: ((event: MessageEvent) => void) | null;
};

export type LiveTabLocalDeps = {
  documentId: string;
  tabId: string;
  /** Whether this session may change the tab; one that may not never saves. */
  readonly canEdit: boolean;
  /** The stored state, or null when the tab has none yet. Rejects when it cannot be read. */
  load: () => Promise<Uint8Array | null>;
  /** Merges an update into the stored state. */
  save: (update: Uint8Array) => Promise<void>;
  saveDelayMs?: number;
  retryDelayMs?: number;
  /** The channel to the browser's other tabs; none where BroadcastChannel is missing. */
  channel?: () => LiveTabLocalChannel | null;
  /** Where parting copies are written: the browser's synchronous storage unless a test hands another. */
  partingStorage?: PartingStorage | null;
};

export type LiveTabLocalBinding = {
  doc: Y.Doc;
  /** Stop listening and passing on, saving once more what is due. */
  close: () => void;
  /** Settles once every save begun has ended. */
  settled: () => Promise<void>;
  saveFacts: SaveFactsSource;
};

const isMessageFor = (data: unknown, documentId: string, tabId: string): data is ChannelMessage => {
  const message = data as Partial<ChannelMessage> | null;
  return (
    message?.documentId === documentId &&
    message.tabId === tabId &&
    message.update instanceof Uint8Array
  );
};

/** Read the stored state, then keep it saved. Rejects when the state cannot be read. */
export async function openLiveTabLocal(
  kind: LiveTabLocalKind,
  deps: LiveTabLocalDeps,
): Promise<LiveTabLocalBinding> {
  const { documentId, tabId } = deps;
  const { tag } = kind;
  const storage = deps.partingStorage === undefined ? partingStorage() : deps.partingStorage;
  // What a page left behind as it went joins the store before the store is read.
  if (deps.canEdit) await joinPartingCopies(storage, { documentId, tabId, tag }, deps.save);
  const parting = partingCopy(storage, { documentId, tabId, tag });
  const stored = await deps.load();
  const doc = kind.load(stored ? [stored] : []);
  const saveDelay = deps.saveDelayMs ?? kind.saveMs;
  const retryDelay = deps.retryDelayMs ?? kind.retryMs;
  // What the store is known to hold: each save sends what this browser tab has beyond it.
  let saved = stored ? Y.encodeStateVectorFromUpdate(stored) : new Uint8Array([0]);
  let dirty = false;
  // Saves begun and not ended: what they carry is not in the store yet.
  let inFlight = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let closed = false;
  const facts = liveTabSaveFacts(tag, tabId, debugLog);

  const save = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!dirty || !deps.canEdit) return;
    dirty = false;
    inFlight += 1;
    const update = Y.encodeStateAsUpdate(doc, saved);
    const vector = Y.encodeStateVector(doc);
    chain = chain
      .then(() => deps.save(update))
      .then(() => {
        saved = vector;
        inFlight -= 1;
        if (!dirty && inFlight === 0) parting.remove();
        facts.set({ pending: dirty, failed: false });
        debugLog(`${tag} saved in this browser`, { tabId, bytes: update.byteLength });
      })
      .catch((error: unknown) => {
        inFlight -= 1;
        dirty = true;
        facts.set({ pending: true, failed: true });
        // Written again by itself, so a failure clears without another change.
        if (!closed && timer === null) timer = setTimeout(save, retryDelay);
        debugLog(`${tag} save in this browser failed`, { tabId, error: String(error) });
      });
  };

  const defaultChannel = (): LiveTabLocalChannel | null =>
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(kind.channel);
  const channel = (deps.channel ?? defaultChannel)();
  if (channel)
    channel.onmessage = (event: MessageEvent) => {
      if (isMessageFor(event.data, documentId, tabId))
        Y.applyUpdate(doc, event.data.update, BROWSER_TAB_ORIGIN);
    };

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === BROWSER_TAB_ORIGIN || !deps.canEdit) return;
    channel?.postMessage({ documentId, tabId, update } satisfies ChannelMessage);
    dirty = true;
    facts.set({ pending: true });
    timer ??= setTimeout(save, saveDelay);
  };
  doc.on('update', onUpdate);

  // The page may be gone before the save ends: what the store lacks is written synchronously first.
  const saveAtOnce = () => {
    if (deps.canEdit && (dirty || inFlight > 0)) parting.write(Y.encodeStateAsUpdate(doc, saved));
    save();
  };
  const onHide = () => {
    if (document.visibilityState === 'hidden') saveAtOnce();
  };
  window.addEventListener('pagehide', saveAtOnce);
  document.addEventListener('visibilitychange', onHide);

  return {
    doc,
    close: () => {
      closed = true;
      doc.off('update', onUpdate);
      window.removeEventListener('pagehide', saveAtOnce);
      document.removeEventListener('visibilitychange', onHide);
      channel?.close();
      saveAtOnce();
    },
    settled: () => chain,
    saveFacts: { get: facts.get, subscribe: facts.subscribe },
  };
}
