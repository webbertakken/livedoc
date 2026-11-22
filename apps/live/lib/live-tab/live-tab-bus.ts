// Where a live tab kind's updates from the room meet its surface (docs/specs/006-document/
// kinds-outside-the-canvas.md "Live state"; docs/specs/034-text-documents/live-editing-and-storage.md "The live
// model", "Sending", "Reconnecting"): the room connection delivers every op of the kind to its bus, says when the room
// opens and closes, and asks for a catch-up when it cannot replay what a surface missed. The surface of that tab, when
// one is open, takes each. A surface opened later loads the stored state, which holds every update the room relayed,
// so nothing that arrives with no surface open is lost.
// The subpath: every editor loads the buses, and none of a model's code may come with them.
import { bytesOfBase64 } from '@livedoc/text-documents/base64';
import { debugLog } from '@/lib/debug-log';

type UpdateListener = (update: Uint8Array) => void;
// `tabId`: the one tab to catch up (its `stale` op), or null for every tab (the room's re-hydrate).
type ResyncListener = (tabId: string | null) => void;
type ConnectionListener = (connected: boolean) => void;

/** What a live tab kind's op from the room carries: an update, or that the tab's state must be read again. */
export type LiveTabDelivery = { tabId: string; update: string } | { tabId: string; stale: true };

const connections = new Set<ConnectionListener>();
const rehydrates = new Set<() => void>();
let connected = false;

/** The room as every live tab kind hears it: one connection, and one re-hydrate. */
export const LiveTabRoom = {
  /** Whether the room is open now: a surface sends only then. */
  isConnected: (): boolean => connected,
  /** Listen for the room opening and closing. */
  onConnection: (listener: ConnectionListener): (() => void) => {
    connections.add(listener);
    return () => connections.delete(listener);
  },
  connected: (): void => {
    connected = true;
    for (const listener of connections) listener(true);
  },
  disconnected: (): void => {
    if (!connected) return;
    connected = false;
    for (const listener of connections) listener(false);
  },
  /** The room could not replay what this editor missed: every kind's open surfaces catch up. */
  resyncAll: (): void => {
    for (const rehydrate of rehydrates) rehydrate();
  },
} as const;

export type LiveTabBus<Limit extends string> = {
  /** Listen for a tab's updates from the room; answers the unsubscribe. */
  onUpdate: (tabId: string, listener: UpdateListener) => () => void;
  /** One op of the kind from the room. */
  deliver: (op: LiveTabDelivery) => void;
  /** Listen for a catch-up: the room could not replay what this editor missed, or a tab's state went stale. */
  onResync: (listener: ResyncListener) => () => void;
  resync: (tabId: string | null) => void;
  /** Listen for the room refusing one of this editor's changes to a tab. */
  onRefused: (tabId: string, listener: (limit: Limit) => void) => () => void;
  refused: (tabId: string, limit: Limit) => void;
} & Pick<typeof LiveTabRoom, 'isConnected' | 'onConnection' | 'connected' | 'disconnected'>;

/** A kind's bus, logging under the kind's tag. `Limit`: the limits its room names when it refuses a change. */
export function liveTabBus<Limit extends string>(tag: string): LiveTabBus<Limit> {
  const updates = new Map<string, Set<UpdateListener>>();
  const resyncs = new Set<ResyncListener>();
  const refusals = new Map<string, Set<(limit: Limit) => void>>();
  const resync = (tabId: string | null) => {
    for (const listener of resyncs) listener(tabId);
  };
  rehydrates.add(() => resync(null));
  return {
    isConnected: LiveTabRoom.isConnected,
    onConnection: LiveTabRoom.onConnection,
    connected: LiveTabRoom.connected,
    disconnected: LiveTabRoom.disconnected,
    onUpdate(tabId, listener) {
      const set = updates.get(tabId) ?? new Set();
      set.add(listener);
      updates.set(tabId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) updates.delete(tabId);
      };
    },
    deliver(op) {
      if ('stale' in op) {
        debugLog(`${tag} stale`, { tabId: op.tabId });
        resync(op.tabId);
        return;
      }
      const update = bytesOfBase64(op.update);
      if (!update) {
        debugLog(`${tag} update dropped: not base64`);
        return;
      }
      for (const listener of updates.get(op.tabId) ?? []) listener(update);
    },
    onResync(listener) {
      resyncs.add(listener);
      return () => resyncs.delete(listener);
    },
    resync,
    onRefused(tabId, listener) {
      const set = refusals.get(tabId) ?? new Set();
      set.add(listener);
      refusals.set(tabId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) refusals.delete(tabId);
      };
    },
    refused(tabId, limit) {
      debugLog(`${tag} edit-refused`, { tabId, limit });
      for (const listener of refusals.get(tabId) ?? []) listener(limit);
    },
  };
}
