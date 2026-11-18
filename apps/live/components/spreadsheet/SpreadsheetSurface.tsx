'use client';

// A spreadsheet's surface (docs/specs/029-sheets/surface.md; docs/specs/006-document/kinds-outside-the-canvas.md
// "The surface"): the title row, the formula bar, the grid of the open sheet tab and the sheet bar at the foot. The
// grid is the sheet engine's own (components/sheets), on the document's sheet store, live through the room. Loaded as
// its own chunk, with the engine, only when a spreadsheet opens.
import { useEffect, useState } from 'react';
import { planPalette } from '@livedoc/document';
import type { WorkbookRecord } from '@livedoc/sheets';
import { Button } from '@livedoc/ui';
import { useCanvasSurface } from '@/components/canvas/CanvasSurfaceContext';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import { SheetControllerProvider, useSheetController, useSheetControllerState } from '@/components/sheets/sheet-controller';
import { SheetFormulaBar } from '@/components/sheets/SheetFormulaBar';
import { SheetGrid } from '@/components/sheets/SheetGrid';
import { SheetMenus } from '@/components/sheets/SheetMenus';
import type { SheetStore } from '@/components/sheets/sheet-store-client';
import { useAttachedSheetStore } from '@/components/sheets/useAttachedSheetStore';
import { useFormulaInput } from '@/components/sheets/useFormulaInput';
import { useFormulaPointing } from '@/components/sheets/useFormulaPointing';
import { useSheetActions } from '@/components/sheets/useSheetActions';
import { useSheetsBridgeContext, type SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import type { WorkbookScope } from '@/lib/api/workbook';
import { apiDownloadWorkbook } from '@/lib/api/workbook';
import { debugLog } from '@/lib/debug-log';
import { openSpreadsheetFile } from '@/lib/spreadsheet/open-spreadsheet-file';
import { track } from '@/lib/telemetry';
import { SheetBar, type SheetBarTab } from './SheetBar';

export type SpreadsheetSurfaceState = 'loading' | 'ready' | 'failed' | 'gone';

const FORMAT_PILL = { ods: '.ODS', fods: '.FODS', xlsx: '.XLSX' } as const;
const FORMAT_TITLE = { ods: 'OpenDocument format', fods: 'OpenDocument format, flat', xlsx: 'Excel format' } as const;
const DOWNLOAD_LABEL = {
  ods: 'Download as OpenDocument (.ods)',
  fods: 'Download as Flat OpenDocument (.fods)',
  xlsx: 'Download as Microsoft Excel (.xlsx)',
} as const;
const TELEMETRY_FORMAT = { ods: 'Ods', fods: 'Fods', xlsx: 'Xlsx' } as const;

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function SpreadsheetSurface({
  scope,
  tabId,
  tabs,
  documentName,
  workbook,
  onSelectTab,
}: {
  scope: WorkbookScope;
  tabId: string;
  tabs: readonly SheetBarTab[];
  documentName: string;
  workbook: WorkbookRecord;
  onSelectTab: (tabId: string) => void;
}) {
  const bridge = useSheetsBridgeContext();
  const [problem, setProblem] = useState<string | null>(null);
  const format = workbook.format;
  const download = async () => {
    setProblem(null);
    try {
      const { blob, fileName } = await apiDownloadWorkbook(scope, format);
      saveBlob(blob, fileName);
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
    window.location.assign(`/document/${opened.documentId}`);
  };
  return (
    <section aria-label="Spreadsheet" className="absolute inset-0 flex flex-col bg-white dark:bg-slate-950">
      <OfficeTitleRow
        name={documentName || 'Untitled spreadsheet'}
        format={FORMAT_PILL[format]}
        formatTitle={FORMAT_TITLE[format]}
        openAccept=".ods,.fods,application/vnd.oasis.opendocument.spreadsheet"
        onOpenFile={(file) => void open(file)}
        items={[{ label: DOWNLOAD_LABEL[format], run: download }]}
        problem={problem}
      />
      {bridge ? <OpenSheet bridge={bridge} tabId={tabId} /> : <Status state="loading" />}
      <SheetBar tabs={tabs} activeId={tabId} onSelect={onSelectTab} />
    </section>
  );
}

function Status({ state, retry }: { state: Exclude<SpreadsheetSurfaceState, 'ready'>; retry?: () => void }) {
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

function OpenSheet({ bridge, tabId }: { bridge: SheetsBridge; tabId: string }) {
  const { store, version } = useAttachedSheetStore(bridge);
  const status = store.status(tabId);
  useEffect(() => {
    void store.loadTab(tabId);
  }, [store, tabId]);
  const sheet = store.sheetsOn(tabId)[0];
  const state: SpreadsheetSurfaceState =
    status === 'error' ? 'failed' : sheet ? 'ready' : status === 'ready' ? 'gone' : 'loading';
  useEffect(() => {
    debugLog(`[workbook] surface ${state}`, { tabId });
  }, [state, tabId]);
  if (state === 'failed') return <Status state="failed" retry={() => void store.loadTab(tabId, true)} />;
  if (!sheet) return <Status state={state === 'gone' ? 'gone' : 'loading'} />;
  return <SheetWorkspace key={sheet.id} store={store} sheetId={sheet.id} tabId={tabId} version={version} bridge={bridge} />;
}

function SheetWorkspace({
  store,
  sheetId,
  tabId,
  version,
  bridge,
}: {
  store: SheetStore;
  sheetId: string;
  tabId: string;
  version: number;
  bridge: SheetsBridge;
}) {
  const palette = planPalette(useCanvasSurface());
  const [announcement, setAnnouncement] = useState('');
  const c = useSheetControllerState({
    store,
    sheet: store.sheet(sheetId)!,
    workbook: store.workbook(tabId),
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
  return (
    <SheetControllerProvider value={c}>
      <div
        data-spreadsheet-surface="ready"
        className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{ backgroundColor: palette.surface, color: palette.text }}
      >
        <SheetParts bridge={bridge} />
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
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
        if (next instanceof Element && (e.currentTarget.contains(next) || next.closest('[data-menu-surface]')))
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
