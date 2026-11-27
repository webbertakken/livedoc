'use client';

// The sheet bar's changes on the open spreadsheet (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar"),
// for the sheet bar, its tabs' menus and the menu bar's Insert › Sheet and View › Hidden Sheets: an Editor's alone
// (D174). Which tab is being renamed in place, and whether All Sheets is open, are held here, so the keys, the menus
// and the bar reach the same field and list.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { Tab } from '@livedoc/document';
import { makeSheetId } from '@livedoc/sheets';
import { sheetStoreOf } from '@/components/sheets/sheet-store-client';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { useConfirm } from '@/hooks/ui/useConfirm';
import { useLatest } from '@/hooks/ui/useLatest';
import type { WorkbookScope } from '@/lib/api/workbook';
import { isOfflineIdSync } from '@/lib/offline/offline-store';
import {
  sheetBarChanges,
  type SheetBarChanges,
  type SheetBarDeps,
  type SheetBarTabRef,
} from './sheet-bar-actions';
import { cloudSheetBar, offlineSheetBar } from './sheet-bar-backend';

export type SheetBarActions = SheetBarChanges & {
  canChange: boolean;
  renaming: string | null;
  startRename: (tabId: string | null) => void;
  // The open sheet's name as a field, for an Editor (Alt+1).
  renameOpen: () => void;
  // All Sheets open (☰, Alt+Shift+K, View › Hidden Sheets), and how many sheets are hidden (D180).
  listing: boolean;
  listSheets: (open: boolean) => void;
  hiddenCount: number;
};

export const SheetBarActionsContext = createContext<SheetBarActions | null>(null);

export function useSheetBarActionsContext(): SheetBarActions | null {
  return useContext(SheetBarActionsContext);
}

type Latest = {
  bridge: SheetsBridge | null;
  scope: WorkbookScope;
  tabs: readonly SheetBarTabRef[];
  tabId: string;
  onSelectTab: (tabId: string) => void;
  editTabs: (map: (tabs: Tab[]) => Tab[]) => void;
  confirm: SheetBarDeps['confirm'];
};

// The changes' view of the surface, read at their newest when a change runs, never during render.
function depsOf(latest: RefObject<Latest>, pending: RefObject<string | null>): SheetBarDeps {
  return {
    tabs: () => latest.current.tabs,
    openTabId: () => latest.current.tabId,
    backend: () => {
      const { bridge: b, scope: s, editTabs: edit } = latest.current;
      return isOfflineIdSync(s.documentId) && b
        ? offlineSheetBar(sheetStoreOf(b), edit)
        : cloudSheetBar(s, async () => {
            if (b) await sheetStoreOf(b).settle();
          });
    },
    store: () => (latest.current.bridge ? sheetStoreOf(latest.current.bridge) : null),
    pushUndo: (step) => latest.current.bridge?.pushUndo(step),
    toast: (message) => latest.current.bridge?.toast(message),
    confirm: (ask) => latest.current.confirm(ask),
    open: (id) => {
      if (latest.current.tabs.some((t) => t.id === id)) latest.current.onSelectTab(id);
      else pending.current = id;
    },
    newIds: () => ({ tabId: crypto.randomUUID(), sheetId: makeSheetId() }),
  };
}

export function useSheetBarActions({
  bridge,
  scope,
  tabs,
  tabId,
  onSelectTab,
  editTabs,
  hiddenCount = 0,
}: {
  bridge: SheetsBridge | null;
  scope: WorkbookScope;
  tabs: readonly SheetBarTabRef[];
  tabId: string;
  onSelectTab: (tabId: string) => void;
  // The editor's tabs changed quietly: a spreadsheet in This Browser has no room to send them back.
  editTabs: (map: (tabs: Tab[]) => Tab[]) => void;
  // The sheets hidden now, for View › Hidden Sheets.
  hiddenCount?: number;
}): SheetBarActions {
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [listing, setListing] = useState(false);
  const latest = useLatest<Latest>({ bridge, scope, tabs, tabId, onSelectTab, editTabs, confirm });
  // A tab to open once the tab list holds it.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const id = pending.current;
    if (!id || !tabs.some((t) => t.id === id)) return;
    pending.current = null;
    onSelectTab(id);
  }, [tabs, onSelectTab]);
  // The engine counts the sheets in the tabs' order (SHEET), kept as tabs move here or for anyone else.
  const order = tabs.map((t) => t.id).join('\n');
  useEffect(() => {
    if (bridge) sheetStoreOf(bridge).orderSheets(order.split('\n'));
  }, [bridge, order]);
  const canChange = !!bridge && bridge.canEdit && bridge.canShape;
  // Made on the first change, never during render: the changes read the surface through refs.
  const made = useRef<SheetBarChanges | null>(null);
  const changes = useMemo<SheetBarChanges>(() => {
    const now = () => (made.current ??= sheetBarChanges(depsOf(latest, pending)));
    return {
      add: (place, opts) => now().add(place, opts),
      duplicate: (id) => now().duplicate(id),
      rename: (id, name) => now().rename(id, name),
      remove: (id) => now().remove(id),
      move: (id, after) => now().move(id, after),
      moveBy: (id, step) => now().moveBy(id, step),
      colour: (id, colour) => now().colour(id, colour),
      hide: (id) => now().hide(id),
      show: (id) => now().show(id),
    };
  }, [latest]);
  return useMemo(
    () => ({
      ...changes,
      canChange,
      renaming,
      startRename: setRenaming,
      renameOpen: () => {
        if (canChange) setRenaming(tabId);
      },
      listing,
      listSheets: setListing,
      hiddenCount,
    }),
    [changes, canChange, renaming, tabId, listing, hiddenCount],
  );
}
