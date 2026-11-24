'use client';

// Each sheet tab's look for the sheet bar (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar", D177): its
// colour and whether it is hidden, read from its sheet as the store holds it, and read again as the store moves on,
// whoever changed it.
import { useMemo, useSyncExternalStore } from 'react';
import { sheetStoreOf } from '@/components/sheets/sheet-store-client';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';

export type SheetTabLook = { colour?: string; hidden?: true };
// By tab id; a tab with neither is absent.
export type SheetTabLooks = Readonly<Record<string, SheetTabLook>>;

export function useSheetTabLooks(
  bridge: SheetsBridge | null,
  tabs: readonly { id: string }[],
): SheetTabLooks {
  const store = bridge ? sheetStoreOf(bridge) : null;
  const snapshot = () => store?.getVersion() ?? 0;
  const version = useSyncExternalStore(store ? store.subscribe : NO_SUBSCRIBE, snapshot, snapshot);
  return useMemo(() => {
    void version;
    const looks: Record<string, SheetTabLook> = {};
    if (!store) return looks;
    for (const tab of tabs) {
      const layout = store.sheetsOn(tab.id)[0]?.layout;
      const look: SheetTabLook = {
        ...(layout?.tabColour ? { colour: layout.tabColour } : {}),
        ...(layout?.hidden ? { hidden: true as const } : {}),
      };
      if (look.colour || look.hidden) looks[tab.id] = look;
    }
    return looks;
  }, [store, tabs, version]);
}

/** The tabs whose sheets are hidden. */
export function hiddenTabIds(looks: SheetTabLooks): ReadonlySet<string> {
  return new Set(Object.keys(looks).filter((id) => looks[id]!.hidden));
}

const NO_SUBSCRIBE = () => () => {};
