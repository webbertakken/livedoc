// A text document in This Browser (docs/specs/034-text-documents/live-editing-and-storage.md "A text document in This
// Browser"): no room; its state is read from its offline record, and saved there TEXT_DOCUMENT_LOCAL_SAVE_MS after an
// edit and at once when the page is hidden or the tab closes. Each save sends what changed since the last one, which
// the store merges into what it holds. Browser tabs on the same text document pass each edit to each other on a
// BroadcastChannel, so both stay live.
import * as Y from 'yjs';
import { TEXT_DOCUMENT_LOCAL_SAVE_MS, TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { RoomYjsBinding } from './room-yjs-provider';

export const TEXT_DOCUMENT_CHANNEL = 'livedoc-text-document';

/** The origin another browser tab's edit is applied with: that tab saves it, so this one never sends it on. */
export const CHANNEL_ORIGIN = Symbol('browser-tab');

type ChannelMessage = { documentId: string; tabId: string; update: Uint8Array };
type Channel = Pick<BroadcastChannel, 'postMessage' | 'close'> & {
  onmessage: ((event: MessageEvent) => void) | null;
};

export type LocalYjsDeps = {
  documentId: string;
  tabId: string;
  readonly canEdit: boolean;
  load: () => Promise<Uint8Array | null>;
  save: (update: Uint8Array) => Promise<void>;
  saveDelayMs?: number;
  // The channel to the browser's other tabs; none where BroadcastChannel is missing.
  channel?: () => Channel | null;
};

const defaultChannel = (): Channel | null =>
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TEXT_DOCUMENT_CHANNEL);

const isMessageFor = (data: unknown, documentId: string, tabId: string): data is ChannelMessage => {
  const message = data as Partial<ChannelMessage> | null;
  return (
    message?.documentId === documentId &&
    message.tabId === tabId &&
    message.update instanceof Uint8Array
  );
};

/** Read the stored state, then keep it saved. Rejects when the record cannot be read. */
export async function openLocalYjs(deps: LocalYjsDeps): Promise<RoomYjsBinding> {
  const { documentId, tabId } = deps;
  const stored = await deps.load();
  const doc = TextDocumentState.load(stored ? [stored] : []);
  const saveDelay = deps.saveDelayMs ?? TEXT_DOCUMENT_LOCAL_SAVE_MS;
  // What the store is known to hold: each save sends what this browser tab has beyond it.
  let saved = stored ? TextDocumentState.stateVectorOf(stored) : new Uint8Array([0]);
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();

  const save = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!dirty || !deps.canEdit) return;
    dirty = false;
    const update = Y.encodeStateAsUpdate(doc, saved);
    const vector = Y.encodeStateVector(doc);
    chain = chain
      .then(() => deps.save(update))
      .then(() => {
        saved = vector;
        debugLog('[text-document] saved in this browser', { tabId, bytes: update.byteLength });
      })
      .catch((error: unknown) => {
        dirty = true;
        debugLog('[text-document] save in this browser failed', { tabId, error: String(error) });
      });
  };

  const channel = (deps.channel ?? defaultChannel)();
  if (channel)
    channel.onmessage = (event: MessageEvent) => {
      if (isMessageFor(event.data, documentId, tabId))
        Y.applyUpdate(doc, event.data.update, CHANNEL_ORIGIN);
    };

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === CHANNEL_ORIGIN || !deps.canEdit) return;
    channel?.postMessage({ documentId, tabId, update } satisfies ChannelMessage);
    dirty = true;
    if (timer === null) timer = setTimeout(save, saveDelay);
  };
  doc.on('update', onUpdate);

  const onHide = () => {
    if (document.visibilityState === 'hidden') save();
  };
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', onHide);

  return {
    doc,
    close: () => {
      doc.off('update', onUpdate);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHide);
      channel?.close();
      save();
    },
    settled: () => chain,
  };
}
