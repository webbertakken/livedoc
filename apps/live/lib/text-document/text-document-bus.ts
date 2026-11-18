// Where a text document's updates from the room meet its surface (docs/specs/034-text-documents/
// live-editing-and-storage.md "The live model"): the room connection delivers every `text-document` op here, and the
// surface of that tab, when one is open, takes it. A surface opened later loads the stored state, which holds every
// update the room relayed, so nothing that arrives with no surface open is lost.
// The subpath: every editor loads the bus, and none of the model's code may come with it.
import { bytesOfBase64 } from '@livedoc/text-documents/base64';
import { debugLog } from '@/lib/debug-log';

type UpdateListener = (update: Uint8Array) => void;
type ResyncListener = () => void;

const updates = new Map<string, Set<UpdateListener>>();
const resyncs = new Set<ResyncListener>();

export const TextDocumentBus = {
  /** Listen for a tab's updates from the room; answers the unsubscribe. */
  onUpdate(tabId: string, listener: UpdateListener): () => void {
    const set = updates.get(tabId) ?? new Set();
    set.add(listener);
    updates.set(tabId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) updates.delete(tabId);
    };
  },
  /** One `text-document` op from the room. */
  deliver(op: { tabId: string; update: string }): void {
    const update = bytesOfBase64(op.update);
    if (!update) {
      debugLog('[text-document] update dropped: not base64');
      return;
    }
    for (const listener of updates.get(op.tabId) ?? []) listener(update);
  },
  /** Listen for the room telling this editor it missed ops it can no longer replay. */
  onResync(listener: ResyncListener): () => void {
    resyncs.add(listener);
    return () => resyncs.delete(listener);
  },
  resync(): void {
    for (const listener of resyncs) listener();
  },
} as const;
