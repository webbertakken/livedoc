'use client';

// The open sheet's parts (docs/specs/029-sheets/surface.md): the formula bar, the grid, the right side panel beside them
// (office-shell.md "Side panels"), the grid's menus and dialogs and the sheet bar's summary, all on the open sheet's
// controller.
import { readWorkbook } from '@/components/sheets/read-workbook';
import { FilterMenuContext } from '@/components/sheets/useFilterMenuShortcut';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DocumentFonts } from '@livedoc/document';
import { tableAt } from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { SheetGrid } from '@/components/sheets/SheetGrid';
import { useFormulaInput } from '@/components/sheets/useFormulaInput';
import { useFormulaPointing } from '@/components/sheets/useFormulaPointing';
import { useSheetActions } from '@/components/sheets/useSheetActions';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { useOfficePanels } from '@/lib/office/useOfficePanels';
import {
  CHART_EDITOR_PANEL,
  SLICER_PANEL,
  DATA_VALIDATION_PANEL,
  NAMED_RANGES_PANEL,
  PIVOT_EDITOR_PANEL,
  PROTECTION_PANEL,
  SPREADSHEET_PANELS,
  TABLE_SETTINGS_PANEL,
  withBandingOnOpen,
  withTablePanel,
  withNamedRangesPanel,
  withProtectionPanel,
  withValidationPanel,
} from '@/lib/spreadsheet/spreadsheet-panels';
import { SheetBarSummary } from './SheetBarSummary';
import { SpreadsheetGridMenus } from './SpreadsheetContextMenu';
import { SpreadsheetFormulaBarRow } from './SpreadsheetFormulaBarRow';
import { SpreadsheetRightPanel } from './SpreadsheetRightPanel';
import type { ProtectionStart } from './ProtectionForm';
import { ProtectSheetContext } from './protect-sheet-channel';
import { useSpreadsheetSurfaceKeys } from './spreadsheet-surface-keys';
import { useSpreadsheetZoomScale } from './spreadsheet-zoom';
import { useSpreadsheetTheme } from './spreadsheet-theme-context';
import { useCellGoogleFonts } from './useCellGoogleFonts';
import { useCustomAngleDialog } from './useCustomAngleDialog';
import { useGridMenuBindings } from './useGridMenuBindings';
import { useMergeDialog } from './useMergeDialog';
import { useNumberFormatDialogs } from './useNumberFormatDialogs';
import { useSortRangeDialog } from './useSortRangeDialog';
import { useCleanUpTools } from './useCleanUpTools';
import { useSplitText } from './useSplitText';
import { SplitChipContext } from '@/components/sheets/sheet-split-chip-context';
import { SheetFindBar } from '@/components/sheets/SheetFindBar';
import { SheetFilterViewBar } from '@/components/sheets/SheetFilterViewBar';
import { useFilterViewActions } from '@/components/sheets/useFilterViewActions';
import { useFilterViewAddress } from '@/components/sheets/useFilterViewAddress';
import { filterViewMenuActions } from '@/components/sheets/filter-view-menu';
import { useLatest } from '@/hooks/ui/useLatest';
import { FindReplaceDialog } from './FindReplaceDialog';
import { useFindReplace } from './find-replace-state';
import { SheetChartsContext } from '@/components/sheets/sheet-charts-context';
import {
  TableColumnMenuContext,
  TableSettingsContext,
} from '@/components/sheets/tables/table-settings-context';
import { useSpreadsheetCharts } from './charts/useSpreadsheetCharts';
import { useSpreadsheetSlicers } from './slicers/useSpreadsheetSlicers';
import { SheetSlicersContext } from '@/components/sheets/slicers/slicers-context';
import { SheetImagesOverCellsContext } from '@/components/sheets/sheet-images-over-cells-context';
import { SheetPictureAccessContext } from '@/components/sheets/sheet-picture-access-context';
import { useSpreadsheetImages } from './images/useSpreadsheetImages';
import { useSpreadsheetCellPictures } from './images/useSpreadsheetCellPictures';
import { useSpreadsheetEmoji } from './useSpreadsheetEmoji';
import { useSpreadsheetLinks } from './useSpreadsheetLinks';
import { useSpreadsheetNotes } from './useSpreadsheetNotes';
import { SheetNoteOpenContext } from '@/components/sheets/sheet-note-open-context';
import { SheetThreadMarksContext } from '@/components/sheets/sheet-thread-marks-context';
import { useSpreadsheetComments } from './useSpreadsheetComments';
import { useCellLinkLanding } from './useCellLinkLanding';
import { useLinkDocuments } from './link-documents-context';
import { useSheetNavigation } from '@/components/sheets/sheet-navigation';
import {
  SheetLinkFollowContext,
  type FollowSheetLink,
} from '@/components/sheets/sheet-link-follow-context';
import { rangeOnSheet, SHEET_GONE } from '@/lib/spreadsheet/sheet-links';
import {
  SheetPivotDetailsContext,
  SheetPivotsContext,
} from '@/components/sheets/pivots/sheet-pivots';
import { useSpreadsheetPivots } from './pivots/useSpreadsheetPivots';
import { usePivotGrouping } from './pivots/usePivotGrouping';
import { useSheetBarActionsContext } from './useSheetBarActions';

export function SpreadsheetSheetParts({ bridge }: { bridge: SheetsBridge }) {
  const actions = useSheetActions();
  // Cells setting no font draw in the theme's (formatting.md "Themes").
  const { theme } = useSpreadsheetTheme();
  const input = useFormulaInput(actions);
  const c = useSheetController();
  const pointRef = useFormulaPointing(c, input);
  const zoom = useSpreadsheetZoomScale();
  const surfaceKeys = useSpreadsheetSurfaceKeys();
  const formatDialogs = useNumberFormatDialogs(actions);
  const mergeDialog = useMergeDialog(actions);
  const angleDialog = useCustomAngleDialog(actions);
  const sortDialog = useSortRangeDialog(actions);
  const cleanUp = useCleanUpTools();
  const splitText = useSplitText();
  const cleanUpActions = cleanUp.actions;
  const splitActions = splitText.actions;
  // Filter views (data-tools.md "Filters, filter views and slicers"): the view bar's and Data's items.
  const viewActions = useFilterViewActions(c);
  useFilterViewAddress(c);
  const latestViewActions = useLatest(viewActions);
  const inTable = !!tableAt(c.sheet.layout, c.selection.active.r, c.selection.active.c);
  const filterViewMenu = useMemo(
    () =>
      filterViewMenuActions({
        layout: c.sheet.layout,
        open: c.filterViews.open,
        canShape: c.canShape,
        inTable,
        run: () => latestViewActions.current,
      }),
    [c.sheet.layout, c.filterViews.open, c.canShape, inTable, latestViewActions],
  );
  const findReplace = useFindReplace();
  const panels = useOfficePanels({
    kind: 'Spreadsheet',
    panels: SPREADSHEET_PANELS,
    onFocusDocument: c.focusGrid,
    writes: c.canEdit && c.canShape,
  });
  const { actions: panelActions } = panels;
  // The chart the Chart Editor is open on (charts.md "Chart Editor").
  const [editingChart, setEditingChart] = useState<string | null>(null);
  const { reveal } = panels;
  const editChart = useCallback(
    (id: string) => {
      setEditingChart(id);
      reveal(CHART_EDITOR_PANEL);
    },
    [reveal],
  );
  // The pivot table the Pivot Table Editor is open on (pivot-tables.md "Pivot Table Editor").
  const [editingPivot, setEditingPivot] = useState<string | null>(null);
  const editPivot = useCallback(
    (id: string) => {
      setEditingPivot(id);
      reveal(PIVOT_EDITOR_PANEL);
    },
    [reveal],
  );
  const pivots = useSpreadsheetPivots(c, useSheetBarActionsContext(), editPivot);
  const grouping = usePivotGrouping(c, pivots.change);
  const { openCreate: insertPivot } = pivots;
  // How Data Validation Rules was last opened (SpreadsheetRightPanel).
  const [validation, setValidation] = useState({ nonce: 0, startNew: false });
  // How Named Ranges was last opened (SpreadsheetRightPanel).
  const [named, setNamed] = useState({ nonce: 0, startAdding: false });
  // How Protected Sheets and Ranges was last opened (SpreadsheetRightPanel).
  const [protection, setProtection] = useState<{ nonce: number; start: ProtectionStart | null }>({
    nonce: 0,
    start: null,
  });
  // A sheet tab's Protect Sheet: the panel on a new protection of that tab's sheet.
  const protectSheet = useContext(ProtectSheetContext);
  useEffect(() => {
    if (!protectSheet || !c.canShape) return;
    protectSheet.listen((tabId) => {
      const sheet = c.workbook.sheetList().find((s) => s.tabId === tabId);
      if (!sheet) return;
      setProtection((v) => ({ nonce: v.nonce + 1, start: { what: 'sheet', sheetId: sheet.id } }));
      reveal(PROTECTION_PANEL);
    });
    return () => protectSheet.listen(null);
  }, [protectSheet, c.canShape, c.workbook, reveal]);
  // A table's chip on the grid opens Table Settings on it (data-tools.md "Tables").
  const openTableSettings = useCallback(() => reveal(TABLE_SETTINGS_PANEL), [reveal]);
  // Ctrl+Alt+\ opens the active cell's table column menu, which the grid's tables layer draws (data-tools.md "Tables").
  const columnMenu = useRef<(() => void) | null>(null);
  // Ctrl+Alt+R opens the active cell's filter menu, which the grid's tables layer opens (data-tools.md, D504).
  const filterMenu = useRef<(() => void) | null>(null);
  const charts = useSpreadsheetCharts(c, c.canShape ? editChart : undefined);
  const { insertChart } = charts;
  // Data › Add a Slicer and the Slicer panel (data-tools.md "Slicers").
  const panelsNow = useLatest(panels);
  const slicers = useSpreadsheetSlicers(
    c,
    useCallback(() => reveal(SLICER_PANEL), [reveal]),
    useCallback(() => (panelsNow.current.open.right ? 0 : panelsNow.current.width), [panelsNow]),
  );
  const { addSlicer } = slicers;
  // Images over cells (inserted-objects.md "Images over cells"): Insert Image over Cells and each image's menu.
  const { ownerId, documentId, shareCode } = bridge.scope;
  const imageAccess = useMemo(
    () => ({ ownerId, documentId, shareCode }),
    [ownerId, documentId, shareCode],
  );
  const images = useSpreadsheetImages(c, imageAccess);
  // Pictures in cells (inserted-objects.md "Images in a cell"): Insert Image in Cell and a picture cell's items.
  const cellPictures = useSpreadsheetCellPictures(c, imageAccess, images.placing);
  // Insert › Emoji (inserted-objects.md "Tick boxes, dropdowns and emoji"): into the open edit, or the active cell's.
  const emoji = useSpreadsheetEmoji(c, input);
  // Links (inserted-objects.md "Links"): Insert Link, the link card, Open Link and Get Link to This Cell.
  const openSheetAt = useSheetNavigation();
  const { goTo } = actions;
  const followSheet = useCallback<FollowSheetLink>(
    (to) => {
      const sheet = c.workbook.sheet(to.sheetId);
      if (!sheet) return c.toast(SHEET_GONE);
      const range = rangeOnSheet(
        to.range ?? { r1: 0, c1: 0, r2: 0, c2: 0 },
        sheet.layout.rows.length,
        sheet.layout.cols.length,
      ) ?? { r1: 0, c1: 0, r2: 0, c2: 0 };
      if (to.sheetId === c.sheet.id) goTo(range);
      else openSheetAt?.(to.sheetId, range);
    },
    [c, goTo, openSheetAt],
  );
  useCellLinkLanding(c, goTo);
  const links = useSpreadsheetLinks(c, { documentId, documents: useLinkDocuments(), followSheet });
  // Notes (review.md "Notes"): the note box, Delete Notes; the markers and hover card are the grid's.
  const notes = useSpreadsheetNotes(c);
  // Comment threads (review.md "In the grid"): the markers, the hover card's thread, the card and Insert › Comment.
  const comments = useSpreadsheetComments(c, { scope: bridge.scope, goTo });
  const canInsertChart = c.canShape;
  const bandingActions = useMemo(
    () => ({
      ...withTablePanel(
        withProtectionPanel(
          withNamedRangesPanel(
            withValidationPanel(
              withBandingOnOpen(panelActions, () => actions.addBanding()),
              {
                addCheckbox: () => actions.addCheckbox(),
                opened: (startNew) => setValidation((v) => ({ nonce: v.nonce + 1, startNew })),
                reveal: () => reveal(DATA_VALIDATION_PANEL),
              },
            ),
            {
              opened: (startAdding) => setNamed((v) => ({ nonce: v.nonce + 1, startAdding })),
              reveal: () => reveal(NAMED_RANGES_PANEL),
              canShape: c.canShape,
            },
          ),
          {
            opened: (start) =>
              setProtection((v) => ({ nonce: v.nonce + 1, start: start ? { what: start } : null })),
            reveal: () => reveal(PROTECTION_PANEL),
            canShape: c.canShape,
          },
        ),
        {
          convert: () => actions.convertToTable() !== null,
          reveal: () => reveal(TABLE_SETTINGS_PANEL),
          canShape: c.canShape,
        },
      ),
      ...cleanUpActions,
      ...splitActions,
      ...filterViewMenu,
      'table-column-menu': { run: () => columnMenu.current?.() },
      'open-filter-dropdown': { run: () => filterMenu.current?.() },
      // Insert › Chart and the toolbar's (charts.md "Inserting"): an Editor's.
      ...(canInsertChart ? { 'insert-chart': { run: insertChart } } : {}),
      // Insert › Pivot Table (pivot-tables.md "Making one"): an Editor's.
      ...(c.canShape ? { 'insert-pivot-table': { run: insertPivot } } : {}),
      // Data › Add a Slicer (data-tools.md "Slicers"): an Editor's.
      ...(c.canShape ? { 'add-a-slicer': { run: addSlicer } } : {}),
    }),
    [
      panelActions,
      actions,
      canInsertChart,
      insertChart,
      insertPivot,
      addSlicer,
      reveal,
      c.canShape,
      cleanUpActions,
      splitActions,
      filterViewMenu,
    ],
  );
  // Show Details on a pivot table's value, in its cell's context menu (pivot-tables.md "Details"): anyone's, a
  // Participant's and a Viewer's as a read-only dialog.
  const { active } = c.selection;
  const detailsHere = readWorkbook(c.version, () =>
    c.workbook.pivotValueCellAt(c.sheet.id, active.r, active.c),
  );
  const office = useGridMenuBindings(
    actions,
    {
      ...formatDialogs,
      merge: mergeDialog.merge,
      openCustomAngle: angleDialog.openCustomAngle,
      openSortRange: sortDialog.openSortRange,
    },
    {
      ...bandingActions,
      // Grouping a pivot table's items from its cells (pivot-tables.md "Grouping in the grid"): an Editor's.
      ...grouping.actions,
      ...images.actions,
      ...cellPictures.actions,
      ...emoji.actions,
      ...links.actions,
      ...notes.actions,
      ...comments.actions,
      ...(detailsHere
        ? { 'show-pivot-details': { run: () => void pivots.showDetails(active.r, active.c) } }
        : {}),
    },
  );
  useCellGoogleFonts(c.sheet);
  const { focusGrid, canEdit } = c;
  // Opening a sheet puts the keys in its grid, A1 selected, ready to type (spreadsheet.md "Making a spreadsheet").
  useEffect(() => {
    if (!canEdit) return;
    const frame = requestAnimationFrame(() => focusGrid());
    return () => cancelAnimationFrame(frame);
  }, [canEdit, focusGrid]);
  return (
    <div
      className="contents"
      onFocus={() => c.setFocused(true)}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (
          next instanceof Element &&
          (e.currentTarget.contains(next) || next.closest('[data-menu-surface]'))
        )
          return;
        c.setFocused(false);
      }}
    >
      {/* The surface's areas, for F6 and Ctrl+Alt+. (grid-and-editing.md "Moving around"). */}
      {/* The right side panel sits beside the formula bar and the grid (office-shell.md "Side panels"). */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <SpreadsheetFormulaBarRow actions={actions} input={input} />
          <div data-region="document" className="relative flex min-h-0 flex-1 flex-col">
            <SheetFilterViewBar actions={viewActions} />
            <SplitChipContext.Provider value={splitText.chip}>
              <TableSettingsContext.Provider value={openTableSettings}>
                <TableColumnMenuContext.Provider value={columnMenu}>
                  <FilterMenuContext.Provider value={filterMenu}>
                    <SheetChartsContext.Provider value={charts.value}>
                      <SheetSlicersContext.Provider value={slicers.writes}>
                        <SheetImagesOverCellsContext.Provider value={images.value}>
                          <SheetPictureAccessContext.Provider value={imageAccess}>
                            <SheetPivotsContext.Provider value={c.canShape ? editPivot : null}>
                              <SheetPivotDetailsContext.Provider value={pivots.showDetails}>
                                <SheetLinkFollowContext.Provider value={followSheet}>
                                  <SheetNoteOpenContext.Provider value={notes.open}>
                                    <SheetThreadMarksContext.Provider value={comments.marks}>
                                      <SheetGrid
                                        elementId={`sheet-${c.sheet.id}`}
                                        actions={actions}
                                        input={input}
                                        pointRef={pointRef}
                                        peers={bridge.peers}
                                        zoom={zoom}
                                        surfaceKeys={surfaceKeys}
                                        fontFamily={DocumentFonts.stack(theme.font)}
                                      />
                                    </SheetThreadMarksContext.Provider>
                                  </SheetNoteOpenContext.Provider>
                                </SheetLinkFollowContext.Provider>
                              </SheetPivotDetailsContext.Provider>
                            </SheetPivotsContext.Provider>
                          </SheetPictureAccessContext.Provider>
                        </SheetImagesOverCellsContext.Provider>
                      </SheetSlicersContext.Provider>
                    </SheetChartsContext.Provider>
                  </FilterMenuContext.Provider>
                </TableColumnMenuContext.Provider>
              </TableSettingsContext.Provider>
            </SplitChipContext.Provider>
            {c.findOpen ? <SheetFindBar onMoreOptions={findReplace?.openWith} /> : null}
          </div>
        </div>
        <SpreadsheetRightPanel
          panels={panels}
          actions={actions}
          chart={{ id: editingChart, change: charts.change }}
          pivot={{ id: editingPivot, change: pivots.change }}
          slicer={{
            id: slicers.editing,
            change: (next, what) => slicers.writes?.change(next, what) ?? false,
          }}
          validation={validation}
          named={named}
          protection={protection}
        />
      </div>
      <SpreadsheetGridMenus actions={actions} bound={office.actions} />
      {formatDialogs.dialog}
      {angleDialog.dialog}
      {mergeDialog.dialog}
      {sortDialog.dialog}
      {cleanUp.dialog}
      {splitText.dialog}
      {pivots.dialog}
      {grouping.dialog}
      {images.dialogs}
      {cellPictures.dialogs}
      {emoji.dialog}
      {links.editor}
      {links.card}
      {notes.box}
      {comments.card}
      {findReplace?.open ? <FindReplaceDialog state={findReplace} /> : null}
      <SheetBarSummary />
    </div>
  );
}
