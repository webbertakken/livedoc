'use client';

// The open sheet's parts (docs/specs/029-sheets/surface.md): the formula bar, the grid, the right side panel beside them
// (office-shell.md "Side panels"), the grid's menus and dialogs and the sheet bar's summary, all on the open sheet's
// controller.
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DocumentFonts } from '@livedoc/document';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { SheetGrid } from '@/components/sheets/SheetGrid';
import { useFormulaInput } from '@/components/sheets/useFormulaInput';
import { useFormulaPointing } from '@/components/sheets/useFormulaPointing';
import { useSheetActions } from '@/components/sheets/useSheetActions';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { useOfficePanels } from '@/lib/office/useOfficePanels';
import {
  CHART_EDITOR_PANEL,
  DATA_VALIDATION_PANEL,
  NAMED_RANGES_PANEL,
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
import { SheetChartsContext } from '@/components/sheets/sheet-charts-context';
import { TableSettingsContext } from '@/components/sheets/tables/table-settings-context';
import { useSpreadsheetCharts } from './charts/useSpreadsheetCharts';

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
  const charts = useSpreadsheetCharts(c, c.canShape ? editChart : undefined);
  const { insertChart } = charts;
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
      // Insert › Chart and the toolbar's (charts.md "Inserting"): an Editor's.
      ...(canInsertChart ? { 'insert-chart': { run: insertChart } } : {}),
    }),
    [panelActions, actions, canInsertChart, insertChart, reveal, c.canShape],
  );
  const office = useGridMenuBindings(
    actions,
    {
      ...formatDialogs,
      merge: mergeDialog.merge,
      openCustomAngle: angleDialog.openCustomAngle,
      openSortRange: sortDialog.openSortRange,
    },
    bandingActions,
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
            <TableSettingsContext.Provider value={openTableSettings}>
              <SheetChartsContext.Provider value={charts.value}>
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
              </SheetChartsContext.Provider>
            </TableSettingsContext.Provider>
          </div>
        </div>
        <SpreadsheetRightPanel
          panels={panels}
          actions={actions}
          chart={{ id: editingChart, change: charts.change }}
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
      <SheetBarSummary />
    </div>
  );
}
