'use client';

// Who is on which sheet, for the sheet bar's faces (docs/specs/029-sheets/sheet-store.md "Live for everyone"): the
// peers whose selection the room last told of, by tab, each with the name and colour the room knows them by. A peer
// who has left is in the room's list no longer, so their face goes with them.
import { useMemo, useSyncExternalStore } from 'react';
import { sheetPresenceFor } from '@/components/sheets/sheet-presence-store';
import { sheetStoreOf } from '@/components/sheets/sheet-store-client';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import type { SheetBarPeer } from './SheetBar';

export function useSheetBarPeers(
  bridge: SheetsBridge | null,
): Readonly<Record<string, readonly SheetBarPeer[]>> {
  const presence = bridge ? sheetPresenceFor(sheetStoreOf(bridge)) : null;
  const subscribe = presence ? presence.subscribe : NO_SUBSCRIBE;
  const version = useSyncExternalStore(
    subscribe,
    () => presence?.getVersion() ?? 0,
    () => 0,
  );
  const peers = bridge?.peers;
  return useMemo(() => {
    void version;
    if (!presence || !peers) return {};
    const byId = new Map(peers.map((p) => [p.id, p]));
    const out: Record<string, SheetBarPeer[]> = {};
    for (const [tabId, ids] of presence.byTab()) {
      const known = ids.map((id) => byId.get(id)).filter((p): p is SheetBarPeer => !!p);
      if (known.length) out[tabId] = known;
    }
    return out;
  }, [presence, peers, version]);
}

const NO_SUBSCRIBE = () => () => {};
