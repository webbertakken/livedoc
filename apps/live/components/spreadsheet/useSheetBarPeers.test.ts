// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SheetPresenceOp } from '@livedoc/api-schema';
import { sheetPresenceFor } from '@/components/sheets/sheet-presence-store';
import { sheetStoreOf } from '@/components/sheets/sheet-store-client';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { useSheetBarPeers } from './useSheetBarPeers';

// docs/specs/029-sheets/sheet-store.md "Live for everyone": the sheet bar's faces are the peers the room knows, by the
// tab their selection is on; one who has left shows no more.

const ann = { id: 'ann', name: 'Ann', color: '#e11d48' };
const op = (tabId: string): SheetPresenceOp => ({
  kind: 'sheet-presence',
  tabId,
  sheetId: `sheet_${tabId}`,
  ranges: [{ r1: 'r1', c1: 'c1', r2: 'r1', c2: 'c1' }],
  editing: false,
});

function bridgeWith(peers: SheetsBridge['peers']): SheetsBridge {
  return {
    scope: { documentId: 'bar-doc', ownerId: 'o', shareCode: null, tabId: null },
    oneWorkbook: true,
    self: null,
    locale: 'en-GB',
    peers,
    pushUndo: () => {},
    toast: () => {},
  } as unknown as SheetsBridge;
}

describe('useSheetBarPeers', () => {
  it('follows the room: a peer by the tab they are on, gone once they have left', () => {
    let bridge = bridgeWith([ann]);
    const { result, rerender } = renderHook(() => useSheetBarPeers(bridge));
    const presence = sheetPresenceFor(sheetStoreOf(bridge));
    expect(result.current).toEqual({});
    act(() => presence.receive('ann', op('t2')));
    expect(result.current).toEqual({ t2: [ann] });
    act(() => presence.receive('ghost', op('t1')));
    expect(result.current).toEqual({ t2: [ann] });
    bridge = bridgeWith([]);
    rerender();
    expect(result.current).toEqual({});
  });

  it('shows nobody without a bridge', () => {
    const { result } = renderHook(() => useSheetBarPeers(null));
    expect(result.current).toEqual({});
  });
});
