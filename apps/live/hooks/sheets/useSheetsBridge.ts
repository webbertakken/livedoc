'use client';

// The editor's side of the sheet store: the one piece of the Sheet that
// lives in the main bundle. It hands the lazily loaded sheet chunk what it needs from the editor (who is writing,
// the document's scope, undo, toasts, presence) and routes the room's `sheets` and `sheet-presence` ops to the
// chunk once it has attached. Before any Sheet is drawn nothing attaches and every op is dropped: the store
// fetches what it needs when it loads.
import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { RoomOp, SheetPresenceOp, SheetsRoomOp } from '@livedoc/api-schema';
import type {
  FileMeaning,
  ImportAccess,
  Iteration,
  NamedFunction,
  SheetPerson,
  WorkbookRecalc,
} from '@livedoc/sheets';
import type { BoxedElement, Element } from '@livedoc/document';
import type { SheetsScope } from '@/lib/api/sheets';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import { useLatest } from '@/hooks/ui/useLatest';
import type { FunctionsChange } from '@/components/sheets/functions-shrink';

export type SheetPeer = { id: string; name: string; color: string };

export type SheetsHandlers = {
  receive: (op: SheetsRoomOp) => void;
  // A loaded sheet's title (the delete dialog names it).
  title: (sheetId: string) => string | undefined;
  // Delete sheets with their elements, kept for Undo (sheet-store.md "Deleting a sheet").
  release: (sheetIds: readonly string[]) => void;
  // Renames each of `sheetIds` still titled `from` to `to` (a tab renamed from its default name).
  retitle: (sheetIds: readonly string[], from: string, to: string) => void;
  presence: (from: string, op: SheetPresenceOp) => void;
  resync: () => void;
  reannounce: () => void;
};

export type SheetsBridge = {
  scope: SheetsScope;
  // The document is a spreadsheet: its sheet tabs' sheets are one workbook (docs/specs/029-sheets/spreadsheet.md).
  oneWorkbook: boolean;
  // A spreadsheet's iterative calculation (docs/specs/029-sheets/settings.md "Calculation"); absent, off.
  iteration?: Iteration;
  // A spreadsheet's named functions (formulas.md "Named functions"); absent, none.
  functions?: readonly NamedFunction[];
  // Saves the named functions a layout change of this person's rewrites (D301): a deletion's shrink, undo and redo.
  changeFunctions?: (change: FunctionsChange) => void;
  // A spreadsheet's Recalculation (settings.md "Calculation"); absent, on change.
  recalc?: WorkbookRecalc;
  // Whether a spreadsheet's imports may fetch (imports.md "Allow access", "A spreadsheet in This Browser"); absent
  // for a Plan document.
  importAccess?: ImportAccess;
  // The spreadsheets its IMPORTRANGEs may read (formulas.md "Connecting two spreadsheets"); absent, none.
  rangeSources?: readonly string[];
  // The tab open now: where a placed Sheet's sheet is made.
  activeTabId: string;
  self: SheetPerson | null;
  // Cells (Editor and Participant), and the Sheet's shape (Editor), docs/specs/013-workspace/share-roles.md.
  canEdit: boolean;
  canShape: boolean;
  // The document is this person's own: what Only the Owner protections admit (data-tools.md "Protected ranges");
  // absent, not.
  isOwner?: boolean;
  // How numbers, dates and formulas read and show (formulas.md "Locale"): a spreadsheet's own, else this browser's.
  locale: string;
  // A spreadsheet's time zone (formulas.md "Locale"): the wall clock NOW and TODAY read; absent, this browser's.
  timeZone?: string;
  // A spreadsheet's meaning (formulas.md, the file's meaning): a standard's for one opened from a file; absent, Google's.
  meaning?: FileMeaning;
  peers: readonly SheetPeer[];
  pushUndo: (step: ItemUndoStep) => void;
  // A refusal or failure (error toast), and plain news ("Replaced 3 cells").
  toast: (message: string) => void;
  notify: (message: string) => void;
  sendPresence: (op: SheetPresenceOp) => void;
  // Change the open tab's elements (a Sheet dropping its copy mark once its copy is made), as an edit.
  commitElements: (map: (els: Element[]) => Element[]) => void;
  // Change the open tab's elements quietly: saved and sent, but no undo step (a chart keeping its last read).
  tickElements: (map: (els: Element[]) => Element[]) => void;
  // Place a new element centred on a canvas point, styled by the theme and selected (unless `select` is false), as a
  // palette drop is (a chart made from a sheet's cells, selected in its Sheet instead). One undo step.
  placeElement: (
    at: { x: number; y: number },
    make: (x: number, y: number) => BoxedElement,
    opts?: { select?: boolean },
  ) => void;
  // Select an element on the canvas (Escape out of a Sheet's grid selects the Sheet).
  selectElement: (id: string) => void;
  // A sheet's title changed (renamed here, by a collaborator, an agent or an undo): a Sheet tab it fills takes the
  // same name (docs/specs/026-plan/plan-tabs.md "Names").
  sheetRetitled: (sheetId: string, title: string) => void;
  // The sheet chunk attaches its handlers; the returned function detaches them.
  attach: (handlers: SheetsHandlers) => () => void;
};

function browserLocale(): string {
  return typeof navigator === 'undefined' ? 'en-GB' : navigator.language || 'en-GB';
}

export const SheetsBridgeContext = createContext<SheetsBridge | null>(null);

export function useSheetsBridgeContext(): SheetsBridge | null {
  return useContext(SheetsBridgeContext);
}

export function useSheetsBridge(opts: {
  documentId: string;
  ownerId: string;
  shareCode: string | null;
  tabScope: string | null;
  oneWorkbook: boolean;
  iteration?: Iteration;
  functions?: readonly NamedFunction[];
  changeFunctions?: (change: FunctionsChange) => void;
  recalc?: WorkbookRecalc;
  importAccess?: ImportAccess;
  rangeSources?: readonly string[];
  // A spreadsheet's locale and time zone; absent, this browser's.
  locale?: string;
  timeZone?: string;
  meaning?: FileMeaning;
  self: SheetPerson | null;
  canEdit: boolean;
  // Absent: as canEdit.
  canShape?: boolean;
  // Absent: not the owner.
  isOwner?: boolean;
  peers: readonly SheetPeer[];
  pushUndo: (step: ItemUndoStep) => void;
  toast: (message: string) => void;
  notify: (message: string) => void;
  send: (op: RoomOp) => void;
  activeTabId: string;
  commitElements: (map: (els: Element[]) => Element[]) => void;
  placeElement: SheetsBridge['placeElement'];
  tickElements: (map: (els: Element[]) => Element[]) => void;
  selectElement: (id: string) => void;
  sheetRetitled: (sheetId: string, title: string) => void;
}) {
  const handlers = useRef<SheetsHandlers | null>(null);
  const pushUndo = useLatest(opts.pushUndo);
  const toast = useLatest(opts.toast);
  const notify = useLatest(opts.notify);
  const send = useLatest(opts.send);
  const commitElements = useLatest(opts.commitElements);
  const placeElement = useLatest(opts.placeElement);
  const tickElements = useLatest(opts.tickElements);
  const selectElement = useLatest(opts.selectElement);
  const sheetRetitled = useLatest(opts.sheetRetitled);
  const attach = useCallback((h: SheetsHandlers) => {
    handlers.current = h;
    return () => {
      if (handlers.current === h) handlers.current = null;
    };
  }, []);
  const {
    documentId,
    ownerId,
    shareCode,
    tabScope,
    oneWorkbook,
    iteration,
    functions,
    changeFunctions,
    recalc,
    importAccess,
    rangeSources,
    locale,
    timeZone,
    meaning,
    self,
    canEdit,
    peers,
    activeTabId,
  } = opts;
  const canShape = opts.canShape ?? canEdit;
  const isOwner = opts.isOwner ?? false;
  const bridge = useMemo<SheetsBridge>(
    () => ({
      scope: { documentId, ownerId, shareCode, tabId: tabScope },
      oneWorkbook,
      ...(iteration ? { iteration } : {}),
      ...(functions ? { functions } : {}),
      ...(changeFunctions ? { changeFunctions } : {}),
      ...(recalc ? { recalc } : {}),
      ...(importAccess !== undefined ? { importAccess } : {}),
      ...(rangeSources ? { rangeSources } : {}),
      activeTabId,
      self,
      canEdit,
      canShape,
      isOwner,
      locale: locale ?? browserLocale(),
      ...(timeZone ? { timeZone } : {}),
      ...(meaning ? { meaning } : {}),
      peers,
      pushUndo: (step) => pushUndo.current(step),
      toast: (m) => toast.current(m),
      notify: (m) => notify.current(m),
      sendPresence: (op) => send.current(op),
      commitElements: (map) => commitElements.current(map),
      placeElement: (at, make, opts) => placeElement.current(at, make, opts),
      tickElements: (map) => tickElements.current(map),
      selectElement: (id) => selectElement.current(id),
      sheetRetitled: (sheetId, title) => sheetRetitled.current(sheetId, title),
      attach,
    }),
    [
      documentId,
      ownerId,
      shareCode,
      tabScope,
      oneWorkbook,
      iteration,
      functions,
      changeFunctions,
      recalc,
      importAccess,
      rangeSources,
      locale,
      timeZone,
      meaning,
      activeTabId,
      self,
      canEdit,
      canShape,
      isOwner,
      peers,
      pushUndo,
      toast,
      notify,
      send,
      commitElements,
      placeElement,
      tickElements,
      selectElement,
      sheetRetitled,
      attach,
    ],
  );
  return {
    bridge,
    receiveSheets: useCallback((op: SheetsRoomOp) => handlers.current?.receive(op), []),
    receiveSheetPresence: useCallback(
      (from: string, op: SheetPresenceOp) => handlers.current?.presence(from, op),
      [],
    ),
    resync: useCallback(() => handlers.current?.resync(), []),
    // Before a Sheet has drawn nothing is attached: no title, and nothing to release (the sheet is kept, as a Cut's).
    sheetTitle: useCallback((id: string) => handlers.current?.title(id), []),
    releaseSheets: useCallback((ids: readonly string[]) => {
      if (!handlers.current) return false;
      handlers.current.release(ids);
      return true;
    }, []),
    sheetsAttached: useCallback(() => handlers.current !== null, []),
    // Before a Sheet has drawn nothing is loaded to rename.
    retitleSheets: useCallback(
      (ids: readonly string[], from: string, to: string) =>
        handlers.current?.retitle(ids, from, to),
      [],
    ),
    reannounce: useCallback(() => handlers.current?.reannounce(), []),
  };
}
