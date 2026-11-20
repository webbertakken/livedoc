// Where a text document's updates from the room meet its surface (docs/specs/034-text-documents/
// live-editing-and-storage.md "The live model", "Sending", "Reconnecting"): the room connection delivers every
// `text-document` op here, says when the room opens and closes, and asks for a catch-up when it cannot replay what a
// surface missed. The surface of that tab, when one is open, takes each. A surface opened later loads the stored state,
// which holds every update the room relayed, so nothing that arrives with no surface open is lost.
// The subpath: every editor loads the bus, and none of the model's code may come with it.
import { bytesOfBase64 } from '@livedoc/text-documents/base64';
import { debugLog } from '@/lib/debug-log';

type UpdateListener = (update: Uint8Array) => void;
// `tabId`: the one tab to catch up (its `stale` op), or null for every tab (the room's re-hydrate).
type ResyncListener = (tabId: string | null) => void;
type ConnectionListener = (connected: boolean) => void;
/** The limit an edit passed ("Refused edits"). */
export type TextDocumentLimit = 'characters' | 'state';
type RefusedListener = (limit: TextDocumentLimit) => void;

const updates = new Map<string, Set<UpdateListener>>();
const resyncs = new Set<ResyncListener>();
const connections = new Set<ConnectionListener>();
const refusals = new Map<string, Set<RefusedListener>>();
let connected = false;

/** What a `text-document` op from the room carries: an update, or that the tab's state must be read again. */
export type TextDocumentDelivery =
  { tabId: string; update: string } | { tabId: string; stale: true };

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
  deliver(op: TextDocumentDelivery): void {
    if ('stale' in op) {
      debugLog('[text-document] stale', { tabId: op.tabId });
      TextDocumentBus.resync(op.tabId);
      return;
    }
    const update = bytesOfBase64(op.update);
    if (!update) {
      debugLog('[text-document] update dropped: not base64');
      return;
    }
    for (const listener of updates.get(op.tabId) ?? []) listener(update);
  },
  /** Listen for a catch-up: the room could not replay what this editor missed, or a tab's state went stale. */
  onResync(listener: ResyncListener): () => void {
    resyncs.add(listener);
    return () => resyncs.delete(listener);
  },
  resync(tabId: string | null): void {
    for (const listener of resyncs) listener(tabId);
  },
  /** Listen for the room refusing one of this editor's edits to a tab. */
  onRefused(tabId: string, listener: RefusedListener): () => void {
    const set = refusals.get(tabId) ?? new Set();
    set.add(listener);
    refusals.set(tabId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) refusals.delete(tabId);
    };
  },
  refused(tabId: string, limit: TextDocumentLimit): void {
    debugLog('[text-document] edit-refused', { tabId, limit });
    for (const listener of refusals.get(tabId) ?? []) listener(limit);
  },
  /** Whether the room is open now: a surface sends only then. */
  isConnected(): boolean {
    return connected;
  },
  /** Listen for the room opening and closing. */
  onConnection(listener: ConnectionListener): () => void {
    connections.add(listener);
    return () => connections.delete(listener);
  },
  connected(): void {
    connected = true;
    for (const listener of connections) listener(true);
  },
  disconnected(): void {
    if (!connected) return;
    connected = false;
    for (const listener of connections) listener(false);
  },
} as const;
