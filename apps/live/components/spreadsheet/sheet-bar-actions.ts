// The sheet bar's changes (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar"): add, duplicate, rename
// and delete a sheet, each one step on the person's one timeline. An add or a duplicate undone deletes the sheet, kept,
// and redone puts it back with its ids; a delete undone puts it back with its ids where it was; a rename is the sheet
// store's own title write. Where a sheet goes back is worked out when it goes back: after the nearest tab that was
// before it and is still there. The changes land through a SheetBarBackend (sheet-bar-backend.ts).
import { SheetName } from '@livedoc/sheets';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import { debugLog } from '@/lib/debug-log';
import {
  duplicateName,
  landingAfter,
  openAfterDelete,
  tabsBefore,
} from '@/lib/spreadsheet/sheet-bar-places';
import { track } from '@/lib/telemetry';
import type { SheetStore } from '@/components/sheets/sheet-store-client';
import { sheetRefusalMessage } from '@/components/sheets/sheet-refusals';
import type { SheetBarBackend } from './sheet-bar-backend';

export type SheetBarTabRef = { id: string; name: string };

// Where Add Sheet puts a sheet: after the last one, or (Insert › Sheet, Shift+F11) after the open one (D170).
export type SheetPlace = 'end' | 'afterOpen';

export type SheetBarChanges = {
  add: (place: SheetPlace) => void;
  duplicate: (tabId: string) => void;
  // Whether the sheet now has the name (true for an unchanged one); a refused name says why.
  rename: (tabId: string, name: string) => boolean;
  // Asks first; never the last sheet.
  remove: (tabId: string) => void;
};

export type SheetBarDeps = {
  tabs: () => readonly SheetBarTabRef[];
  openTabId: () => string;
  backend: () => SheetBarBackend;
  store: () => Pick<SheetStore, 'sheetsOn' | 'write'> | null;
  pushUndo: (step: ItemUndoStep) => void;
  toast: (message: string) => void;
  confirm: (ask: { title: string; message: string; confirmLabel: string }) => Promise<boolean>;
  // Open a tab once it is in the tab list (a sheet added on LiveDoc arrives through the room).
  open: (tabId: string) => void;
  newIds: () => { tabId: string; sheetId: string };
};

// A sheet tab as the sheet bar put it in or took it out, and the tabs that were before it.
type Placed = { tabId: string; sheetId: string; name: string; earlier: string[]; copyOf?: string };

function codeOf(e: unknown): string | null {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

export function sheetBarChanges(deps: SheetBarDeps): SheetBarChanges {
  const refused = (change: string, e: unknown) => {
    const code = codeOf(e);
    debugLog(`[workbook] sheet bar refused ${code ?? 'unknown'}`, { change });
    deps.toast(sheetRefusalMessage(code, true));
  };
  const put = async (p: Placed, restore: boolean) => {
    await deps.backend().put({
      tabId: p.tabId,
      sheetId: p.sheetId,
      name: p.name,
      after: landingAfter(deps.tabs(), p.earlier),
      ...(p.copyOf && !restore ? { copyOf: p.copyOf } : {}),
      ...(restore ? { restore: true as const } : {}),
    });
  };
  const take = (p: Placed) => deps.backend().take({ tabId: p.tabId, sheetId: p.sheetId });
  // An undo or a redo: said when refused, never a step of its own.
  const replay = (change: string, run: () => Promise<void>) => {
    run().then(
      () => debugLog(`[workbook] sheet bar ${change}`, {}),
      (e: unknown) => refused(change, e),
    );
  };
  const sheetOf = (tabId: string) => deps.store()?.sheetsOn(tabId)[0];

  const placeNew = (p: Placed, kind: 'AddSheet' | 'DuplicateSheet') => {
    put(p, false).then(
      () => {
        debugLog(`[workbook] sheet bar ${kind}`, { tabId: p.tabId, sheetId: p.sheetId });
        track('Sheet', 'Changed', kind);
        deps.open(p.tabId);
        deps.pushUndo({
          undo: () => replay('undo add', () => take(p)),
          redo: () => replay('redo add', () => put(p, true)),
        });
      },
      (e: unknown) => refused(kind, e),
    );
  };

  return {
    add: (place) => {
      const tabs = deps.tabs();
      const open = tabs.findIndex((t) => t.id === deps.openTabId());
      const upTo = place === 'end' || open < 0 ? tabs.length : open + 1;
      placeNew(
        {
          ...deps.newIds(),
          name: SheetName.next(tabs.map((t) => t.name)),
          earlier: tabs.slice(0, upTo).map((t) => t.id),
        },
        'AddSheet',
      );
    },
    duplicate: (tabId) => {
      const tabs = deps.tabs();
      const at = tabs.findIndex((t) => t.id === tabId);
      const sheet = sheetOf(tabId);
      if (at < 0 || !sheet) {
        deps.toast(sheetRefusalMessage('sheet_loading'));
        return;
      }
      placeNew(
        {
          ...deps.newIds(),
          name: duplicateName(
            tabs[at]!.name,
            tabs.map((t) => t.name),
          ),
          earlier: tabs.slice(0, at + 1).map((t) => t.id),
          copyOf: sheet.id,
        },
        'DuplicateSheet',
      );
    },
    rename: (tabId, name) => {
      const tabs = deps.tabs();
      const tab = tabs.find((t) => t.id === tabId);
      const sheet = sheetOf(tabId);
      if (!tab || !sheet) {
        deps.toast(sheetRefusalMessage('sheet_loading'));
        return false;
      }
      if (name.trim() === tab.name) return true;
      const named = SheetName.check(
        name,
        tabs.filter((t) => t.id !== tabId).map((t) => t.name),
      );
      if (!named.ok) {
        refused('rename', { code: named.refusal });
        return false;
      }
      // The store's title write names the tab too, and is its own undo step.
      if (deps.store()!.write(sheet.id, { kind: 'title', title: named.name })) return false;
      debugLog('[workbook] sheet bar Title', { tabId });
      track('Sheet', 'Changed', 'Title');
      return true;
    },
    remove: (tabId) => {
      const tabs = deps.tabs();
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tabs.length <= 1) {
        refused('delete', { code: 'sheet_last_visible' });
        return;
      }
      const sheet = sheetOf(tabId);
      if (!sheet) {
        deps.toast(sheetRefusalMessage('sheet_loading'));
        return;
      }
      const p: Placed = {
        tabId,
        sheetId: sheet.id,
        name: tab.name,
        earlier: tabsBefore(tabs, tabId),
      };
      void deps
        .confirm({
          title: `Delete ${tab.name}?`,
          message: 'Every reference to it becomes #REF!. Undo puts it back.',
          confirmLabel: 'Delete',
        })
        .then(async (yes) => {
          if (!yes) return;
          if (deps.openTabId() === tabId) {
            const next = openAfterDelete(deps.tabs(), tabId);
            if (next) deps.open(next);
          }
          try {
            await take(p);
          } catch (e) {
            refused('DeleteSheet', e);
            return;
          }
          debugLog('[workbook] sheet bar DeleteSheet', { tabId, sheetId: sheet.id });
          track('Sheet', 'Changed', 'DeleteSheet');
          deps.pushUndo({
            undo: () => replay('undo delete', () => put(p, true)),
            redo: () => replay('redo delete', () => take(p)),
          });
        });
    },
  };
}
