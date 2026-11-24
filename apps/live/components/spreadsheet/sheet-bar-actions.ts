// The sheet bar's changes (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar"): add, duplicate, rename,
// delete, move, colour, hide and show a sheet, each one step on the person's one timeline. An add or a duplicate undone deletes the sheet, kept,
// and redone puts it back with its ids; a delete undone puts it back with its ids where it was; a move undone goes back
// after the sheet it followed; a rename is the sheet store's own title write, and a colour, a hide or a show its own
// layout write (D177). Where a sheet goes back is worked out when it goes back: after the nearest tab that was
// before it and is still there. The changes land through a SheetBarBackend (sheet-bar-backend.ts).
import { SheetName } from '@livedoc/sheets';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import { debugLog } from '@/lib/debug-log';
import {
  duplicateName,
  landingAfter,
  moveByAfter,
  openInstead,
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
  // After the tab `after` names (null: first), or one place right or left (Move Right, Move Left).
  move: (tabId: string, after: string | null) => void;
  moveBy: (tabId: string, step: -1 | 1) => void;
  // A tab's colour (lower-case #rrggbb), null to reset it.
  colour: (tabId: string, colour: string | null) => void;
  // Hide never the last sheet shown; show then opens it.
  hide: (tabId: string) => void;
  show: (tabId: string) => void;
};

// The sheet's look the sheet bar writes: its tab's colour and whether it is hidden.
type TabLook = { tabColour?: string | null; hidden?: boolean };

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
  // The tabs whose sheets are hidden, as the store holds them now.
  const hiddenTabs = () =>
    new Set(
      deps
        .tabs()
        .filter((t) => sheetOf(t.id)?.layout.hidden === true)
        .map((t) => t.id),
    );
  // Whether a tab other than `tabId` is shown: the last one shown is never hidden or deleted.
  const othersShown = (tabId: string) => {
    const hidden = hiddenTabs();
    return deps.tabs().some((t) => t.id !== tabId && !hidden.has(t.id));
  };
  // A look written through the store, its own undo step; false when the sheet is not loaded or the store refuses.
  const writeLook = (
    tabId: string,
    look: TabLook,
    kind: 'SheetColour' | 'HideSheet' | 'ShowSheet',
  ) => {
    const sheet = sheetOf(tabId);
    if (!sheet) {
      deps.toast(sheetRefusalMessage('sheet_loading'));
      return false;
    }
    if (deps.store()!.write(sheet.id, { kind: 'layout', changes: [{ k: 'options', ...look }] }))
      return false;
    debugLog(`[workbook] sheet bar ${kind}`, { tabId });
    track('Sheet', 'Changed', kind);
    return true;
  };

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

  // A tab moved after the nearest still there of the tabs `earlier` names (moved, and moved back by its undo).
  const moveTo = (tabId: string, sheetId: string, earlier: readonly string[]) =>
    deps.backend().move({ tabId, sheetId, after: landingAfter(deps.tabs(), earlier) });

  const move = (tabId: string, after: string | null) => {
    const tabs = deps.tabs();
    const at = tabs.findIndex((t) => t.id === tabId);
    const sheet = sheetOf(tabId);
    if (at < 0 || !sheet) {
      deps.toast(sheetRefusalMessage('sheet_loading'));
      return;
    }
    const others = tabs.filter((t) => t.id !== tabId).map((t) => t.id);
    const to = after === null ? [] : others.slice(0, others.indexOf(after) + 1);
    const from = tabsBefore(tabs, tabId);
    // Where it already is: nothing to do, no step.
    if (landingAfter(tabs, to) === (from.at(-1) ?? null)) return;
    moveTo(tabId, sheet.id, to).then(
      () => {
        debugLog('[workbook] sheet bar MoveSheet', { tabId, after });
        track('Sheet', 'Changed', 'MoveSheet');
        deps.pushUndo({
          undo: () => replay('undo move', () => moveTo(tabId, sheet.id, from)),
          redo: () => replay('redo move', () => moveTo(tabId, sheet.id, to)),
        });
      },
      (e: unknown) => refused('MoveSheet', e),
    );
  };

  return {
    move,
    moveBy: (tabId, step) => {
      const to = moveByAfter(deps.tabs(), hiddenTabs(), tabId, step);
      if (to) move(tabId, to.after);
    },
    colour: (tabId, colour) => {
      if ((sheetOf(tabId)?.layout.tabColour ?? null) === colour) return;
      writeLook(tabId, { tabColour: colour }, 'SheetColour');
    },
    hide: (tabId) => {
      if (!othersShown(tabId)) {
        refused('hide', { code: 'sheet_last_visible' });
        return;
      }
      const next =
        deps.openTabId() === tabId ? openInstead(deps.tabs(), hiddenTabs(), tabId) : null;
      if (writeLook(tabId, { hidden: true }, 'HideSheet') && next) deps.open(next);
    },
    show: (tabId) => {
      if (
        sheetOf(tabId)?.layout.hidden !== true ||
        writeLook(tabId, { hidden: false }, 'ShowSheet')
      )
        deps.open(tabId);
    },
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
      if (!othersShown(tabId)) {
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
            const next = openInstead(deps.tabs(), hiddenTabs(), tabId);
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
