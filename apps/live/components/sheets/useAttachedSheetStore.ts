'use client';

// The document's sheet store, reached by the room through the bridge once, whichever view of a sheet draws first (a
// Plan Sheet, a spreadsheet's sheet tab), and kept attached while any draws. Re-renders when the store moves on, and
// says this person's selection again when someone new joins (as a Plan card hold is said again).
import { useEffect, useSyncExternalStore } from 'react';
import { sheetToJson } from '@livedoc/sheets';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { registerSheetSource } from '@/lib/sheet-seeds';
import { sheetStoreOf, type SheetStore } from './sheet-store-client';
import { retitleSheets } from './sheet-rename';
import { sheetPresenceFor } from './sheet-presence-store';

// How many views draw from each store, so the room stays attached while any does.
const ATTACHED = new WeakMap<SheetStore, { count: number; detach: () => void }>();

function release(store: SheetStore): void {
  const held = ATTACHED.get(store);
  if (!held) return;
  if (--held.count > 0) return;
  ATTACHED.delete(store);
  held.detach();
  registerSheetSource(null);
}

export function useAttachedSheetStore(bridge: SheetsBridge): {
  store: SheetStore;
  version: number;
} {
  const store = sheetStoreOf(bridge);
  useEffect(() => {
    const held = ATTACHED.get(store);
    if (held) {
      held.count++;
      return () => release(store);
    }
    const presence = sheetPresenceFor(store);
    presence.connect((op) => bridge.sendPresence(op));
    registerSheetSource((id) => {
      const sheet = store.sheet(id);
      return sheet ? sheetToJson(sheet) : undefined;
    });
    const detach = bridge.attach({
      receive: (op) => store.receive(op),
      title: (id) => store.sheet(id)?.title,
      release: (ids) => store.release(ids),
      retitle: (ids, from, to) => retitleSheets(store, ids, from, to),
      presence: (from, op) => presence.receive(from, op),
      resync: () => store.resync(),
      reannounce: () => presence.reannounce(),
    });
    ATTACHED.set(store, { count: 1, detach });
    return () => release(store);
  }, [store, bridge]);

  const version = useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  const peerIds = bridge.peers.map((p) => p.id).join(',');
  useEffect(() => {
    if (peerIds) sheetPresenceFor(store).reannounce();
  }, [peerIds, store]);
  return { store, version };
}
