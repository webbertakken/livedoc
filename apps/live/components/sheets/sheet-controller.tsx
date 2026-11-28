'use client';

// One Sheet's working state (docs/specs/029-sheets/sheet.md "The grid", "Selection", "Editing"), shared by its
// parts through context: the selection, the cell being edited and its draft, the grid's scroll and size, the menu
// open over it, and the write helper every command goes through. Lives inside MaximisableSlot, so maximising and
// restoring keep all of it.
import { slicedPivotsOf, type DrawnPivots } from '@/lib/spreadsheet/pivot-sliced';
import type { ChartPick, PlaceChartOpts } from './sheet-charts';
import type { ChartType, SheetAnchor } from '@livedoc/document';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  filteredOutRows,
  withCollapsedRows,
  viewDrawnOrder,
  rowHeights,
  slicerDrawnFilters,
  type FilterCondition,
  type OwnSlicerFilters,
  single,
  valuesOnly,
  type GridRange,
  type SmartFillOffer,
  type Selection,
  type Sheet,
  type SheetLayout,
  type SheetWrite,
  type Workbook,
  type FoldChange,
} from '@livedoc/sheets';
import { track } from '@/lib/telemetry';
import { useLatest } from '@/hooks/ui/useLatest';
import type { PlanPalette } from '@/components/plan/plan-palette';
import type { SheetStore } from './sheet-store-client';
import { geometryOf, mergeAt, type Geometry } from './sheet-geometry';
import { useFollowLayout } from './useFollowLayout';
import { useSheetFolds } from './useSheetFolds';
import { useFilterViews, type FilterViews } from './useFilterViews';
import { useSheetRulesState, type SheetRulesState } from './rules/useSheetRulesState';
import type { Grid } from '@livedoc/sheets';
import type { SheetChangeKind } from '@livedoc/api-schema';

export type { SheetChangeKind } from '@livedoc/api-schema';

export type Editing = {
  r: number;
  c: number;
  draft: string;
  // Where the edit began: typing over the cell, Enter/F2/double-click in it, or the formula bar.
  origin: 'type' | 'cell' | 'bar';
};

export type OpenMenu =
  | { kind: 'cell'; x: number; y: number }
  | { kind: 'header'; axis: 'r' | 'c'; index: number; x: number; y: number }
  | { kind: 'filter'; colId: string; x: number; y: number }
  | { kind: 'sort' }
  // Ctrl+Alt+= or - over cells: the four inserts or deletes (D157).
  | { kind: 'lines'; op: 'insert' | 'delete'; x: number; y: number }
  // The Resize dialog over lines from..to.
  | { kind: 'resize'; axis: 'r' | 'c'; from: number; to: number }
  // Alt+Shift+→ or ← over cells: the rows and the columns to group or ungroup (D160).
  | { kind: 'group'; op: 'group' | 'ungroup'; x: number; y: number }
  // A right-click on an outline band (grid-and-editing.md "Groups and the outline").
  | { kind: 'outline'; axis: 'r' | 'c'; x: number; y: number }
  | null;

export type SheetController = {
  store: SheetStore;
  sheet: Sheet;
  workbook: Workbook;
  version: number;
  // The tab's font, by id: what a cell with no font of its own is measured in (sheet.md "Row height").
  font: string | undefined;
  geometry: Geometry;
  // The layout as this person sees it: the sheet's, with their own folds over it when they may not shape it (D163).
  viewLayout: SheetLayout;
  // A Participant's or a Viewer's collapse or expand, kept for this session only (useSheetFolds).
  foldForSelf: (changes: readonly FoldChange[]) => void;
  // The filter view open for this person and the filter drawn (useFilterViews).
  filterViews: FilterViews;
  // This person's own slicer filters, in place of each slicer's default, never sent (data-tools.md "Slicers", D485):
  // a condition, null for every row, undefined back to the default.
  ownSlicers: OwnSlicerFilters;
  // The pivot tables this person's slicers filter, drawn in their outputs' place (pivot-tables.md "Sliced", D629).
  drawnPivots: DrawnPivots | null;
  setOwnSlicer: (id: string, cond: FilterCondition | null | undefined) => void;
  grid: Grid;
  palette: PlanPalette;
  interactive: boolean;
  // Writes cells (docs/specs/013-workspace/share-roles.md): an Editor and a Participant.
  canEdit: boolean;
  // Changes the Sheet's shape (rows, columns, settings, title, toolbar): an Editor only.
  canShape: boolean;
  maximised: boolean;
  locale: string;
  selection: Selection;
  setSelection: (s: Selection) => void;
  focused: boolean;
  setFocused: (focused: boolean) => void;
  // The selection as last set, for event handlers: a key pressed in the frame after a drag's last move runs
  // before that move's render, so the render's `selection` can be one step behind.
  selectionNow: () => Selection;
  // Where a run of entries committed with Tab began, so Enter returns to that column on the next row (as Sheets
  // and Excel do). Any other move ends the run.
  tabRun: () => { r: number; c: number } | null;
  setTabRun: (start: { r: number; c: number } | null) => void;
  editing: Editing | null;
  setEditing: (e: Editing | null) => void;
  scroll: { top: number; left: number };
  setScroll: (s: { top: number; left: number }) => void;
  view: { width: number; height: number };
  setView: (v: { width: number; height: number }) => void;
  // The copied (or cut) range's dashed outline.
  // `runs`: the stored ranges copied when they are rows a drawn order put side by side (D494).
  marquee: { range: GridRange; cut: boolean; runs?: GridRange[] } | null;
  setMarquee: (m: { range: GridRange; cut: boolean } | null) => void;
  // Smart Fill's offer after a typed text (grid-and-editing.md "Fill and move", D150), until a key, a press or an edit.
  smartFill: SmartFillOffer | null;
  setSmartFill: (offer: SmartFillOffer | null) => void;
  menu: OpenMenu;
  setMenu: (m: OpenMenu) => void;
  findOpen: 'find' | 'replace' | null;
  // Find's matches, highlighted on the grid while it is open.
  findHits: readonly { r: number; c: number }[];
  setFindHits: (hits: readonly { r: number; c: number }[]) => void;
  setFindOpen: (f: 'find' | 'replace' | null) => void;
  // Send a write and count it; false when it was refused (said in a toast).
  // `alongside`: a change outside the sheet made with this write, one undo step with it (sheet-store-client.ts).
  write: (w: SheetWrite, kind: SheetChangeKind, alongside?: ItemUndoStep) => boolean;
  // `unchecked`: stored past the validation rules (an import; data-validation.md "Where values are checked").
  writeAll: (
    edits: readonly { sheetId: string; write: SheetWrite }[],
    kind: SheetChangeKind,
    opts?: { unchecked?: boolean },
  ) => boolean;
  // The grid's focusable frame (held as state through a callback ref), so commands can hand focus back.
  gridEl: HTMLDivElement | null;
  setGridEl: (el: HTMLDivElement | null) => void;
  focusGrid: () => void;
  announce: (message: string) => void;
  toast: (message: string) => void;
  notify: (message: string) => void;
  // Place a chart reading `range` in the Sheet at `anchor` (sheet-charts.ts).
  placeChart?: (
    type: ChartType,
    pick: ChartPick,
    anchor: SheetAnchor,
    opts?: PlaceChartOpts,
  ) => void;
  // Dropdowns, rule panels, a format rule's preview and Paint Format (rules/useSheetRulesState.ts).
  rules: SheetRulesState;
  // Taking the charts anchored in this Sheet off its tab (Clear Sheet): `redo` takes them, `undo` puts them back.
  // Null when it has none, or they are not this tab's to change (a Dashboard slot showing another tab's Sheet).
  chartsRemoval?: () => ItemUndoStep | null;
  // A spreadsheet's Find and Replace dialog (data-tools.md "Find and replace"); a Plan Sheet has none.
  openFindReplace?: () => void;
};

const SheetControllerContext = createContext<SheetController | null>(null);

export const SheetControllerProvider = SheetControllerContext.Provider;

// What a Participant is told when a change to a Sheet's shape is held back (docs/specs/013-workspace/share-roles.md).
export const SHAPE_REFUSED = "Only an editor can change a Sheet's rows, columns or settings.";

export function useSheetController(): SheetController {
  const c = useContext(SheetControllerContext);
  if (!c) throw new Error('useSheetController outside a Sheet');
  return c;
}

// Each sheet's last selection this session, so a remounted Sheet opens where it was.
const KEPT_SELECTIONS = new Map<string, Selection>();
const KEPT_SELECTIONS_MAX = 200;

// The selection a sheet about to be opened opens on: a range gone to from another sheet (a named range's Go To).
export function arriveAt(sheetId: string, range: GridRange): void {
  const at = { r: range.r1, c: range.c1 };
  KEPT_SELECTIONS.set(sheetId, { ranges: [range], active: at, anchor: at });
}

function keptSelection(sheetId: string, layout: SheetLayout): Selection {
  const kept = KEPT_SELECTIONS.get(sheetId);
  if (!kept) return single({ r: 0, c: 0 });
  const rows = layout.rows.length;
  const cols = layout.cols.length;
  const inside =
    kept.ranges.every((g) => g.r2 < rows && g.c2 < cols) &&
    kept.active.r < rows &&
    kept.active.c < cols;
  if (KEPT_SELECTIONS.size > KEPT_SELECTIONS_MAX) KEPT_SELECTIONS.clear();
  return inside ? kept : single({ r: 0, c: 0 });
}

export function useSheetControllerState(opts: {
  store: SheetStore;
  sheet: Sheet;
  workbook: Workbook;
  version: number;
  font?: string | undefined;
  palette: PlanPalette;
  interactive: boolean;
  canEdit: boolean;
  canShape?: boolean;
  maximised: boolean;
  locale: string;
  announce: (message: string) => void;
  toast: (message: string) => void;
  notify: (message: string) => void;
  placeChart?: (
    type: ChartType,
    pick: ChartPick,
    anchor: SheetAnchor,
    opts?: PlaceChartOpts,
  ) => void;
  chartsRemoval?: () => ItemUndoStep | null;
  // After this person's own write to this sheet lands locally (card tables push it to the cards).
  onWrote?: (before: Sheet, write: SheetWrite) => void;
  // A spreadsheet's Find and Replace dialog, which Ctrl+H opens in place of the Find bar's Replace row.
  openFindReplace?: () => void;
}): SheetController {
  const { store, sheet, workbook, version } = opts;
  const onWrote = useLatest(opts.onWrote);
  // The selection outlives the element's tree for the session (a mode switch, maximising, a remount), as a
  // spreadsheet tab keeps its place; within the grid's bounds.
  const [selection, setSelectionState] = useState<Selection>(() =>
    keptSelection(sheet.id, sheet.layout),
  );
  const liveSelection = useRef(selection);
  const sheetId = sheet.id;
  const setSelection = useCallback(
    (s: Selection) => {
      liveSelection.current = s;
      KEPT_SELECTIONS.set(sheetId, s);
      setSelectionState(s);
    },
    [sheetId],
  );
  // Whether the grid (or its editor, formula bar or menus) has the keys: an unfocused Sheet's selection is drawn
  // quieter, so with several on a tab the one being worked in stands out.
  const [focused, setFocused] = useState(false);
  const selectionNow = useCallback(() => liveSelection.current, []);
  const tabStart = useRef<{ r: number; c: number } | null>(null);
  const tabRun = useCallback(() => tabStart.current, []);
  const setTabRun = useCallback((start: { r: number; c: number } | null) => {
    tabStart.current = start;
  }, []);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [view, setView] = useState({ width: 0, height: 0 });
  const [marquee, setMarquee] = useState<{
    range: GridRange;
    cut: boolean;
    runs?: GridRange[];
  } | null>(null);
  const [smartFill, setSmartFill] = useState<SmartFillOffer | null>(null);
  const [menu, setMenu] = useState<OpenMenu>(null);
  const [findOpen, setFindOpen] = useState<'find' | 'replace' | null>(null);
  const [findHits, setFindHits] = useState<readonly { r: number; c: number }[]>([]);
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const rules = useSheetRulesState();
  // A layout change this person made keeps their selection where it is (as a spreadsheet's Insert does); only
  // someone else's moves it.
  const ownLayout = useRef(false);
  const takeOwnLayout = useCallback(() => {
    const own = ownLayout.current;
    ownLayout.current = false;
    return own;
  }, []);
  useFollowLayout({
    layout: sheet.layout,
    editing,
    setEditing,
    selectionNow,
    setSelection,
    toast: opts.toast,
    takeOwnLayout,
  });
  // A Participant writes cells and never the shape (docs/specs/013-workspace/share-roles.md); the server refuses
  // it too, so it is held back here rather than shown and taken away.
  const canShape = opts.canShape ?? opts.canEdit;
  const shapeRefused = useLatest(() => {
    opts.toast(SHAPE_REFUSED);
    return false;
  });
  // And its cells' values, never their formats (sheet.md "Who may do what"): a paste or a fill lands as its values,
  // and a change of formats alone is refused. The api holds a non-Editor's writes to the same (valuesOnly).
  const formatRefused = useLatest(() => {
    opts.toast("Only an editor can format a Sheet's cells.");
    return false;
  });
  const write = useCallback(
    (given: SheetWrite, kind: SheetChangeKind, alongside?: ItemUndoStep) => {
      if (!canShape && given.kind !== 'cells') return shapeRefused.current();
      const w = canShape ? given : valuesOnly(given);
      if (!w) return formatRefused.current();
      const before = store.sheet(sheet.id);
      const refused = store.write(sheet.id, w, alongside ? { alongside } : {});
      if (refused) return false;
      if (w.kind === 'layout') ownLayout.current = true;
      track('Sheet', 'Changed', kind);
      if (before) onWrote.current?.(before, w);
      return true;
    },
    [store, sheet.id, onWrote, canShape, shapeRefused, formatRefused],
  );
  // The filter view this person has open, drawn in the sheet filter's place; its writes are the sheet's.
  const viewWrite = useCallback((w: SheetWrite) => write(w, 'Filter'), [write]);
  const filterViews = useFilterViews({
    sheetId: sheet.id,
    layout: sheet.layout,
    write: viewWrite,
    toast: opts.toast,
    canShape,
  });
  const openView = filterViews.open;
  const [ownSlicers, setOwnSlicers] = useState<OwnSlicerFilters>({});
  const setOwnSlicer = useCallback((id: string, cond: FilterCondition | null | undefined) => {
    setOwnSlicers((all) => {
      const { [id]: _was, ...rest } = all;
      return cond === undefined ? rest : { ...rest, [id]: cond };
    });
  }, []);
  // Rows a filter hides are drawn at no height: the open view's alone, else any the sheet's filter or a table's hides
  // (data-tools.md "A table's filter", D482), and any a slicer hides for this person ("Slicers"); worked out again
  // whenever a value or a filter may have changed.
  const filtered = useMemo(
    () =>
      filteredOutRows(
        workbook,
        sheet.id,
        openView ?? undefined,
        slicerDrawnFilters(sheet.layout, ownSlicers),
      ),
    [workbook, sheet, openView, ownSlicers, version], // oxlint-disable-line react/exhaustive-deps
  );
  // Pivot tables under this person's slicers, worked out again as values or slicers change (D629).
  const drawnPivots = useMemo(
    () => slicedPivotsOf(workbook, sheet, ownSlicers),
    [workbook, sheet, ownSlicers, version], // oxlint-disable-line react/exhaustive-deps
  );
  // How tall each row is drawn: a sized row its size, every other row what its text needs (sheet.md "Row height").
  // Worked out again whenever a value may have changed; the same function while no height did, so the geometry and
  // all that hangs on it stand.
  const heightOf = useMemo(
    () => rowHeights(workbook, sheet.id, opts.font),
    [workbook, sheet, opts.font, version], // oxlint-disable-line react/exhaustive-deps
  );
  // The open view's sort draws the rows in an order of its own, for this person alone (data-tools.md "The drawn
  // order"); worked out again whenever a value may have changed, as the filtered rows are.
  // A group by view's groups lie side by side in it, each counting the rows the view keeps (data-tools.md "Group by
  // view").
  const order = useMemo(
    () => viewDrawnOrder(workbook, sheet.id, openView, filtered),
    [workbook, sheet, openView, filtered, version], // oxlint-disable-line react/exhaustive-deps
  );
  // A collapsed group's rows are drawn at no height for this person, as a filter's (D497).
  const collapsed = filterViews.collapsed;
  const drawnOut = useMemo(
    () => withCollapsedRows(filtered, order, collapsed, sheet.layout.rows),
    [filtered, order, collapsed, sheet.layout.rows],
  );
  const { viewLayout, foldForSelf } = useSheetFolds(sheet.id, sheet.layout, canShape);
  const geometry = useMemo(
    () => geometryOf(viewLayout, drawnOut, heightOf, order),
    [viewLayout, drawnOut, heightOf, order],
  );
  const grid = useMemo<Grid>(() => {
    const ix = { rows: sheet.layout.rows.length, cols: sheet.layout.cols.length };
    return {
      rows: ix.rows,
      cols: ix.cols,
      hiddenRow: geometry.hiddenRow,
      hiddenCol: geometry.hiddenCol,
      filled: (r, c) => {
        const v = workbook.value(sheet.id, r, c);
        return v !== null && v !== '';
      },
      mergeAt: (r, c) => mergeAt(geometry, r, c),
      order: geometry.order,
    };
  }, [sheet.layout, geometry, workbook, sheet.id]);
  // Writes to several sheets as one change, one undo step (Insert Cells, a cut other sheets' formulas follow).
  const writeAll = useCallback(
    (
      given: readonly { sheetId: string; write: SheetWrite }[],
      kind: SheetChangeKind,
      opts?: { unchecked?: boolean },
    ) => {
      if (!canShape && given.some((e) => e.write.kind !== 'cells')) return shapeRefused.current();
      const edits = canShape
        ? given
        : given.flatMap((e) => {
            const write = valuesOnly(e.write);
            return write ? [{ ...e, write }] : [];
          });
      if (!edits.length) return formatRefused.current();
      const before = store.sheet(sheet.id);
      const refused = store.writeAll(edits, opts?.unchecked ? { unchecked: true } : {});
      if (refused) return false;
      if (edits.some((e) => e.write.kind === 'layout' && e.sheetId === sheet.id))
        ownLayout.current = true;
      track('Sheet', 'Changed', kind);
      if (before)
        for (const e of edits) if (e.sheetId === sheet.id) onWrote.current?.(before, e.write);
      return true;
    },
    [store, sheet.id, onWrote, canShape, shapeRefused, formatRefused],
  );
  const focusGrid = useCallback(() => gridEl?.focus({ preventScroll: true }), [gridEl]);
  return {
    ...opts,
    font: opts.font,
    canShape,
    geometry,
    viewLayout,
    foldForSelf,
    filterViews,
    ownSlicers,
    drawnPivots,
    setOwnSlicer,
    grid,
    selection,
    setSelection,
    focused,
    setFocused,
    selectionNow,
    tabRun,
    setTabRun,
    editing,
    setEditing,
    scroll,
    setScroll,
    view,
    setView,
    marquee,
    setMarquee,
    smartFill,
    setSmartFill,
    menu,
    setMenu,
    findOpen,
    findHits,
    setFindHits,
    setFindOpen,
    write,
    writeAll,
    gridEl,
    setGridEl,
    focusGrid,
    rules,
  };
}
