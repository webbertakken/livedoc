'use client';

// The sheet bar's changes on the open spreadsheet (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar"),
// for the sheet bar, its tabs' menus and the menu bar's Insert › Sheet: an Editor's alone (D174). Which tab is being
// renamed in place is held here, so Alt+1 and a tab's menu reach the same field.
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
}: {
  bridge: SheetsBridge | null;
  scope: WorkbookScope;
  tabs: readonly SheetBarTabRef[];
  tabId: string;
  onSelectTab: (tabId: string) => void;
  // The editor's tabs changed quietly: a spreadsheet in This Browser has no room to send them back.
  editTabs: (map: (tabs: Tab[]) => Tab[]) => void;
}): SheetBarActions {
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<string | null>(null);
  const latest = useLatest<Latest>({ bridge, scope, tabs, tabId, onSelectTab, editTabs, confirm });
  // A tab to open once the tab list holds it.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const id = pending.current;
    if (!id || !tabs.some((t) => t.id === id)) return;
    pending.current = null;
    onSelectTab(id);
  }, [tabs, onSelectTab]);
  const canChange = !!bridge && bridge.canEdit && bridge.canShape;
  // Made on the first change, never during render: the changes read the surface through refs.
  const made = useRef<SheetBarChanges | null>(null);
  const changes = useMemo<SheetBarChanges>(() => {
    const now = () => (made.current ??= sheetBarChanges(depsOf(latest, pending)));
    return {
      add: (place) => now().add(place),
      duplicate: (id) => now().duplicate(id),
      rename: (id, name) => now().rename(id, name),
      remove: (id) => now().remove(id),
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
    }),
    [changes, canChange, renaming, tabId],
  );
}
