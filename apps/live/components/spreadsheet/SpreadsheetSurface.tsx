'use client';

// A spreadsheet's surface (docs/specs/029-sheets/surface.md; docs/specs/006-document/kinds-outside-the-canvas.md
// "The surface"): the title row, the formula bar, the grid of the open sheet tab and the sheet bar at the foot. The
// grid is the sheet engine's own (components/sheets), on the document's sheet store, live through the room. Loaded as
// its own chunk, with the engine, only when a spreadsheet opens.
import { useEffect, useMemo, useRef, useState } from 'react';
import { planPalette } from '@livedoc/document';
import type { WorkbookRecord } from '@livedoc/sheets';
import { Button } from '@livedoc/ui';
import { useCanvasSurface } from '@/components/canvas/CanvasSurfaceContext';
import { useEditorLines } from '@/components/chrome/lines/editor-lines-context';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import type { OfficeCatalogue } from '@/lib/office/office-catalogue';
import {
  SheetControllerProvider,
  useSheetController,
  useSheetControllerState,
} from '@/components/sheets/sheet-controller';
import { SheetFormulaBar } from '@/components/sheets/SheetFormulaBar';
import { SheetGrid } from '@/components/sheets/SheetGrid';
import { SheetMenus } from '@/components/sheets/SheetMenus';
import type { SheetStore } from '@/components/sheets/sheet-store-client';
import { useAttachedSheetStore } from '@/components/sheets/useAttachedSheetStore';
import { useFormulaInput } from '@/components/sheets/useFormulaInput';
import { useFormulaPointing } from '@/components/sheets/useFormulaPointing';
import { useSheetActions } from '@/components/sheets/useSheetActions';
import { SheetImagesContext, useSheetImageLoader } from '@/components/sheets/sheet-images-context';
import { useSheetsBridgeContext, type SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import type { WorkbookScope } from '@/lib/api/workbook';
import { apiDownloadWorkbook } from '@/lib/api/workbook';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import { openSpreadsheetFile } from '@/lib/spreadsheet/open-spreadsheet-file';
import { UNTITLED_SPREADSHEET } from '@/lib/spreadsheet/spreadsheet-name';
import { track } from '@/lib/telemetry';
import { ImportAccessBar, type ImportSync } from './ImportAccessBar';
import { RangeAccessBar } from './RangeAccessBar';
import { SheetBar, type SheetBarTab } from './SheetBar';
import { useSheetBarPeers } from './useSheetBarPeers';

export type SpreadsheetSurfaceState = 'loading' | 'ready' | 'failed' | 'gone';

const FORMAT_PILL = { ods: '.ODS', fods: '.FODS', xlsx: '.XLSX' } as const;
const FORMAT_TITLE = {
  ods: 'OpenDocument format',
  fods: 'OpenDocument format, flat',
  xlsx: 'Excel format',
} as const;
const DOWNLOAD_LABEL = {
  ods: 'Download as OpenDocument (.ods)',
  fods: 'Download as Flat OpenDocument (.fods)',
  xlsx: 'Download as Microsoft Excel (.xlsx)',
} as const;
const TELEMETRY_FORMAT = { ods: 'Ods', fods: 'Fods', xlsx: 'Xlsx' } as const;
const OPEN_ACCEPT = [
  '.ods',
  '.fods',
  '.xlsx',
  '.xlsm',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

// The spreadsheet's menus in the office shell (docs/specs/004-interface-design/office-shell.md "Menus as data"): File
// with Open and the download of the format it is held in, until plan 0020 declares the rest.
const spreadsheetMenus = (format: keyof typeof DOWNLOAD_LABEL): OfficeCatalogue => [
  {
    id: 'file',
    label: 'File',
    entries: [
      { kind: 'item', id: 'open', label: 'Open', level: 'view', status: 'built' },
      {
        kind: 'item',
        id: 'download',
        label: DOWNLOAD_LABEL[format],
        level: 'view',
        status: 'built',
      },
    ],
  },
];

export function SpreadsheetSurface({
  scope,
  tabId,
  tabs,
  documentName,
  workbook,
  onSelectTab,
  sync,
  onWorkbook,
}: {
  scope: WorkbookScope;
  tabId: string;
  tabs: readonly SheetBarTab[];
  documentName: string;
  workbook: WorkbookRecord;
  onSelectTab: (tabId: string) => void;
  // The document's Sync Document, for a spreadsheet in This Browser (imports.md "A spreadsheet in This Browser").
  sync?: ImportSync;
  // A workbook record this page saved (Allow Access), applied without waiting for the room.
  onWorkbook?: (workbook: WorkbookRecord) => void;
}) {
  const bridge = useSheetsBridgeContext();
  const sheetBarPeers = useSheetBarPeers(bridge);
  // The document's own parts in the shell's title row (office-shell.md "Title row").
  const office = useEditorLines()?.office ?? null;
  const [problem, setProblem] = useState<string | null>(null);
  const format = workbook.format;
  const root = useRef<HTMLElement | null>(null);
  const catalogue = useMemo(() => spreadsheetMenus(format), [format]);
  const download = async () => {
    setProblem(null);
    try {
      const { blob, fileName } = await apiDownloadWorkbook(scope, format);
      downloadBlob(blob, fileName);
      track('Spreadsheet', 'Exported', TELEMETRY_FORMAT[format]);
    } catch (error) {
      setProblem('The file could not be downloaded. Try again.');
      debugLog('[workbook] download failed', { error: String(error) });
    }
  };
  const open = async (file: File) => {
    setProblem(null);
    const opened = await openSpreadsheetFile(scope.ownerId, file);
    if (!opened.ok) return setProblem(opened.message);
    track('Spreadsheet', 'Created', 'Import');
    track('Spreadsheet', 'Imported', TELEMETRY_FORMAT[opened.format]);
    window.location.assign(`/document/${opened.documentId}`);
  };
  return (
    <section
      ref={root}
      aria-label="Spreadsheet"
      className="office-shell absolute inset-0 flex flex-col bg-white dark:bg-slate-950"
    >
      <OfficeTitleRow
        name={documentName || UNTITLED_SPREADSHEET}
        format={FORMAT_PILL[format]}
        formatTitle={FORMAT_TITLE[format]}
        problem={problem}
        catalogue={catalogue}
        level="view"
        actions={{ download: { run: () => void download() } }}
        shortcuts={[]}
        keyScope={root}
        opening={{ accept: OPEN_ACCEPT, onFile: (file) => void open(file) }}
        chrome={office}
        tabId={tabId}
      />
      {bridge ? (
        <OpenSheet bridge={bridge} tabId={tabId} sync={sync} onWorkbook={onWorkbook} />
      ) : (
        <Status state="loading" />
      )}
      <SheetBar tabs={tabs} activeId={tabId} onSelect={onSelectTab} peers={sheetBarPeers} />
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
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm text-slate-600 dark:text-slate-300"
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
  sync,
  onWorkbook,
}: {
  bridge: SheetsBridge;
  tabId: string;
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
  sync,
  onWorkbook,
}: {
  store: SheetStore;
  sheetId: string;
  tabId: string;
  version: number;
  bridge: SheetsBridge;
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
  return (
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
          <SheetParts bridge={bridge} />
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </div>
      </SheetImagesContext.Provider>
    </SheetControllerProvider>
  );
}

function SheetParts({ bridge }: { bridge: SheetsBridge }) {
  const actions = useSheetActions();
  const input = useFormulaInput(actions);
  const c = useSheetController();
  const pointRef = useFormulaPointing(c, input);
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
      <SheetFormulaBar actions={actions} input={input} />
      <SheetGrid
        elementId={`sheet-${c.sheet.id}`}
        actions={actions}
        input={input}
        pointRef={pointRef}
        peers={bridge.peers}
        zoom={1}
      />
      <SheetMenus actions={actions} />
    </div>
  );
}
