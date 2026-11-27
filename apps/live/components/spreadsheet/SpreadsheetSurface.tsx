'use client';

// A spreadsheet's surface (docs/specs/029-sheets/surface.md; docs/specs/006-document/kinds-outside-the-canvas.md
// "The surface"): the title row, the formula bar, the grid of the open sheet tab and the sheet bar at the foot. The
// grid is the sheet engine's own (components/sheets), on the document's sheet store, live through the room. Loaded as
// its own chunk, with the engine, only when a spreadsheet opens.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { planPalette, type Tab } from '@livedoc/document';
import type { GridRange, WorkbookRecord } from '@livedoc/sheets';
import { Button } from '@livedoc/ui';
import { useCanvasSurface } from '@/components/canvas/CanvasSurfaceContext';
import {
  arriveAt,
  SheetControllerProvider,
  useSheetControllerState,
} from '@/components/sheets/sheet-controller';
import { SheetNavigationContext } from '@/components/sheets/sheet-navigation';
import type { SheetStore } from '@/components/sheets/sheet-store-client';
import { useAttachedSheetStore } from '@/components/sheets/useAttachedSheetStore';
import { ShowFormulasContext, useShowFormulas } from '@/components/sheets/show-formulas';
import { SheetImagesContext, useSheetImageLoader } from '@/components/sheets/sheet-images-context';
import { useSheetsBridgeContext, type SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import type { WorkbookScope } from '@/lib/api/workbook';
import { debugLog } from '@/lib/debug-log';
import { shownTabs } from '@/lib/spreadsheet/sheet-bar-places';
// The served document fonts' faces, which a cell's family draws in (formatting.md "Font").
import '@/app/document-fonts.css';
import type { SpreadsheetHistory } from '@/lib/spreadsheet/spreadsheet-menu-bindings';
import { ImportReportDialog } from './ImportReportDialog';
import { ImportAccessBar, type ImportSync } from './ImportAccessBar';
import { RangeAccessBar } from './RangeAccessBar';
import { SheetBar, type SheetBarTab } from './SheetBar';
import { SummarySlotContext } from './summary-slot';
import { createOfficeBindingsChannel, OfficeBindingsContext } from './office-bindings-channel';
import { BorderLineContext, useBorderLineState } from './border-line-context';
import { SpreadsheetTitleRow, spreadsheetLevel } from './SpreadsheetTitleRow';
import { SpreadsheetFullScreenProvider, useSpreadsheetFullScreen } from './spreadsheet-full-screen';
import { SpreadsheetSheetParts } from './SpreadsheetSheetParts';
import { SpreadsheetZoomProvider, useSpreadsheetZoom } from './spreadsheet-zoom';
import { useSheetBarPeers } from './useSheetBarPeers';
import { useSheetCopyTo } from './useSheetCopyTo';
import { hiddenTabIds, useSheetTabLooks } from './useSheetTabLooks';
import { SheetBarActionsContext, useSheetBarActions } from './useSheetBarActions';
import { SheetStepContext, SurfaceRedoContext, useSheetStep } from './spreadsheet-surface-keys';

export type SpreadsheetSurfaceState = 'loading' | 'ready' | 'failed' | 'gone';
import {
  SpreadsheetThemeProvider,
  useSpreadsheetTheme,
  useSpreadsheetThemeState,
} from './spreadsheet-theme-context';
import { NamedFunctionsProvider, useNamedFunctionsState } from './named-functions-state';

export function SpreadsheetSurface({
  scope,
  tabId,
  tabs,
  documentName,
  workbook,
  onSelectTab,
  editTabs,
  sync,
  onWorkbook,
  history = null,
}: {
  scope: WorkbookScope;
  tabId: string;
  tabs: readonly SheetBarTab[];
  documentName: string;
  workbook: WorkbookRecord;
  onSelectTab: (tabId: string) => void;
  // The editor's tabs changed quietly, for the sheet bar of a spreadsheet in This Browser.
  editTabs: (map: (tabs: Tab[]) => Tab[]) => void;
  // The document's Sync Document, for a spreadsheet in This Browser (imports.md "A spreadsheet in This Browser").
  sync?: ImportSync;
  // A workbook record this page saved (Allow Access), applied without waiting for the room.
  onWorkbook?: (workbook: WorkbookRecord) => void;
  // The person's one timeline, for Edit › Undo and Redo (grid-and-editing.md "Undo").
  history?: SpreadsheetHistory | null;
}) {
  const bridge = useSheetsBridgeContext();
  const sheetBarPeers = useSheetBarPeers(bridge);
  const root = useRef<HTMLElement | null>(null);
  // The open sheet's menu bindings, published up to the title row (surface.md "Menu bar").
  const [channel] = useState(createOfficeBindingsChannel);
  // The colour and line its borders draw in, kept as sheets are switched (formatting.md "Borders", D209).
  const borderLine = useBorderLineState();
  // The sheet bar's room for the summary, filled from inside the open sheet (surface.md "Sheet bar").
  const [summarySlot, setSummarySlot] = useState<HTMLElement | null>(null);
  // The person's zoom on the grid, kept as sheets are switched (surface.md "Grid", D133).
  const { zoom, scale } = useSpreadsheetZoom();
  // View › Show › Formulas, the person's own across the sheets (grid-and-editing.md "Formulas", D141).
  const formulas = useShowFormulas();
  // View › Full Screen, the person's own for the page (surface.md "Layout", D188).
  const fullScreen = useSpreadsheetFullScreen();
  // Each tab's colour and whether it is hidden, from its sheet (spreadsheet.md "Sheets in the sheet bar", D177).
  const looks = useSheetTabLooks(bridge, tabs);
  const hidden = useMemo(() => hiddenTabIds(looks), [looks]);
  const shown = useMemo(() => shownTabs(tabs, hidden, tabId), [tabs, hidden, tabId]);
  // Alt+Up and Alt+Down in the grid: the previous and next sheet shown, none past either end (D181).
  const stepSheet = useSheetStep(shown, tabId, onSelectTab);
  // The sheet bar's changes, from the sheet bar, its tabs' menus and the menus (spreadsheet.md).
  // Copy To, everyone's who may read the sheets (spreadsheet.md D186).
  const copyTo = useSheetCopyTo(bridge, workbook);
  // The workbook's theme, which its cells' theme colours draw in (formatting.md "Themes").
  const theme = useSpreadsheetThemeState(scope, workbook, onWorkbook);
  // The workbook's named functions (data-tools.md "Named ranges and named functions").
  const namedFunctions = useNamedFunctionsState(scope, workbook, onWorkbook, bridge);
  const sheetBar = useSheetBarActions({
    bridge,
    scope,
    tabs,
    tabId,
    onSelectTab,
    editTabs,
    hiddenCount: hidden.size,
  });
  return (
    <section
      ref={root}
      aria-label="Spreadsheet"
      className="office-shell absolute inset-0 flex flex-col bg-white dark:bg-slate-950"
    >
      {/* Full Screen hides the title row, menus and toolbar, keeping them mounted: their keys and dialogs go on. */}
      <div className={fullScreen.on ? 'hidden' : 'contents'}>
        <SpreadsheetTitleRow
          scope={scope}
          tabId={tabId}
          format={workbook.format}
          locale={workbook.settings.locale}
          documentName={documentName}
          level={
            bridge ? spreadsheetLevel(bridge.canEdit, bridge.canEdit && bridge.canShape) : 'view'
          }
          history={history}
          channel={channel}
          zoom={zoom}
          formulas={formulas}
          onFullScreen={fullScreen.enter}
          keyScope={root}
          onWorkbook={onWorkbook}
          pushUndo={(step) => bridge?.pushUndo(step)}
        />
      </div>
      <SpreadsheetThemeProvider value={theme}>
        <NamedFunctionsProvider value={namedFunctions}>
          <SheetBarActionsContext.Provider value={sheetBar}>
            <OfficeBindingsContext.Provider value={channel}>
              <BorderLineContext.Provider value={borderLine}>
                <SummarySlotContext.Provider value={summarySlot}>
                  <SpreadsheetZoomProvider value={scale}>
                    <SheetStepContext.Provider value={stepSheet}>
                      <SurfaceRedoContext.Provider value={history?.redo ?? null}>
                        <ShowFormulasContext.Provider value={formulas.shown}>
                          <SpreadsheetFullScreenProvider value={fullScreen}>
                            {bridge ? (
                              <OpenSheet
                                bridge={bridge}
                                tabId={tabId}
                                onSelectTab={onSelectTab}
                                sync={sync}
                                onWorkbook={onWorkbook}
                              />
                            ) : (
                              <Status state="loading" />
                            )}
                          </SpreadsheetFullScreenProvider>
                        </ShowFormulasContext.Provider>
                      </SurfaceRedoContext.Provider>
                    </SheetStepContext.Provider>
                  </SpreadsheetZoomProvider>
                </SummarySlotContext.Provider>
              </BorderLineContext.Provider>
            </OfficeBindingsContext.Provider>
            <SheetBar
              tabs={tabs}
              activeId={tabId}
              onSelect={onSelectTab}
              peers={sheetBarPeers}
              summarySlot={setSummarySlot}
              actions={bridge ? sheetBar : null}
              looks={looks}
              copyTo={copyTo}
            />
          </SheetBarActionsContext.Provider>
        </NamedFunctionsProvider>
      </SpreadsheetThemeProvider>
      <ImportReportDialog documentId={scope.documentId} />
    </section>
  );
}

function Status({
  state,
  retry,
}: {
  state: Exclude<SpreadsheetSurfaceState, 'ready'>;
  retry?: () => void;
}) {
  const copy = {
    loading: 'Opening the sheet…',
    failed: "This sheet couldn't be opened.",
    gone: 'This sheet is no longer in this spreadsheet.',
  }[state];
  return (
    <div
      data-spreadsheet-surface={state}
      role={state === 'loading' ? 'status' : 'alert'}
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-body text-slate-600 dark:text-slate-300"
    >
      <p>{copy}</p>
      {retry ? (
        <Button variant="primary" size="xs" onClick={retry}>
          Try Again
        </Button>
      ) : null}
    </div>
  );
}

function OpenSheet({
  bridge,
  tabId,
  onSelectTab,
  sync,
  onWorkbook,
}: {
  bridge: SheetsBridge;
  tabId: string;
  onSelectTab: (tabId: string) => void;
  sync: ImportSync | undefined;
  onWorkbook: ((workbook: WorkbookRecord) => void) | undefined;
}) {
  const { store, version } = useAttachedSheetStore(bridge);
  useEffect(() => {
    void store.loadTab(tabId);
  }, [store, tabId]);
  // The store is mutable: what it holds is read again whenever it moves on (`version`), never memoised past it.
  const { status, sheet } = useMemo(
    () => ({ status: store.status(tabId), sheet: store.sheetsOn(tabId)[0] }),
    [store, tabId, version], // oxlint-disable-line react/exhaustive-deps
  );
  const state: SpreadsheetSurfaceState =
    status === 'error' ? 'failed' : sheet ? 'ready' : status === 'ready' ? 'gone' : 'loading';
  useEffect(() => {
    debugLog(`[workbook] surface ${state}`, { tabId });
  }, [state, tabId]);
  if (state === 'failed')
    return <Status state="failed" retry={() => void store.loadTab(tabId, true)} />;
  if (!sheet) return <Status state={state === 'gone' ? 'gone' : 'loading'} />;
  return (
    <SheetWorkspace
      key={sheet.id}
      store={store}
      sheetId={sheet.id}
      tabId={tabId}
      version={version}
      bridge={bridge}
      onSelectTab={onSelectTab}
      sync={sync}
      onWorkbook={onWorkbook}
    />
  );
}

function SheetWorkspace({
  store,
  sheetId,
  tabId,
  version,
  bridge,
  onSelectTab,
  sync,
  onWorkbook,
}: {
  store: SheetStore;
  sheetId: string;
  tabId: string;
  version: number;
  bridge: SheetsBridge;
  onSelectTab: (tabId: string) => void;
  sync: ImportSync | undefined;
  onWorkbook: ((workbook: WorkbookRecord) => void) | undefined;
}) {
  const palette = planPalette(useCanvasSurface());
  const [announcement, setAnnouncement] = useState('');
  const images = useSheetImageLoader(bridge.scope, bridge.importAccess === 'allowed');
  const { sheet, workbook } = useMemo(
    () => ({ sheet: store.sheet(sheetId)!, workbook: store.workbook(tabId) }),
    [store, sheetId, tabId, version], // oxlint-disable-line react/exhaustive-deps
  );
  // The engine draws in the workbook's theme, set before the grid paints; the store draws it again.
  const { theme } = useSpreadsheetTheme();
  useLayoutEffect(() => store.setTheme(tabId, theme), [store, tabId, theme]);
  const c = useSheetControllerState({
    store,
    sheet,
    workbook,
    version,
    palette,
    interactive: true,
    canEdit: bridge.canEdit,
    canShape: bridge.canEdit && bridge.canShape,
    // The grid fills the surface, as a Sheet filling its tab lays out.
    maximised: true,
    // A cell with no font of its own is measured and drawn in the theme's (formatting.md "Themes"; Arial, D201).
    font: theme.font,
    locale: bridge.locale,
    announce: setAnnouncement,
    toast: bridge.toast,
    notify: bridge.notify,
  });
  // The web's bar: Sync Document in This Browser (where IMPORTRANGE waits too), else Allow Access until allowed.
  const importBar =
    bridge.importAccess === 'offline'
      ? store.usesImports() || store.usesRangeImports()
      : bridge.importAccess === 'blocked' && store.usesImports();
  // IMPORTRANGE's sources waiting to be connected (formulas.md "Connecting two spreadsheets").
  const waiting = store.rangeSourcesWaiting();
  // A named range on another sheet: that sheet opens on it (data-tools.md "Named ranges and named functions").
  const openSheetAt = useCallback(
    (id: string, range: GridRange) => {
      const to = store.sheet(id)?.tabId;
      if (!to) return;
      arriveAt(id, range);
      onSelectTab(to);
    },
    [store, onSelectTab],
  );
  return (
    <SheetNavigationContext.Provider value={openSheetAt}>
      <SheetControllerProvider value={c}>
        <SheetImagesContext.Provider value={images}>
          <div
            data-spreadsheet-surface="ready"
            className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden"
            style={{ backgroundColor: palette.surface, color: palette.text }}
          >
            {importBar ? (
              <ImportAccessBar
                scope={bridge.scope}
                canAllow={bridge.canEdit && bridge.canShape}
                offline={bridge.importAccess === 'offline'}
                sync={sync}
                onAllowed={onWorkbook}
              />
            ) : null}
            {waiting.length > 0 ? (
              <RangeAccessBar
                scope={bridge.scope}
                sources={waiting}
                canAllow={bridge.canEdit && bridge.canShape}
                onAllowed={onWorkbook}
              />
            ) : null}
            <SpreadsheetSheetParts bridge={bridge} />
            <p aria-live="polite" className="sr-only">
              {announcement}
            </p>
          </div>
        </SheetImagesContext.Provider>
      </SheetControllerProvider>
    </SheetNavigationContext.Provider>
  );
}
