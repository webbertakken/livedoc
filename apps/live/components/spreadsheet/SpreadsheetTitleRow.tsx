'use client';

// The spreadsheet's title row (docs/specs/029-sheets/surface.md "Layout", "Menu bar"; files-and-print.md): the office
// shell's, filled with the spreadsheet's menus. File's items are bound here (Open, Download, Convert); Undo and Redo
// to the person's timeline; the grid's items come up from the open sheet through the bindings channel.
import { useMemo, useState, type RefObject } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import { WorkbookRecord, type WorkbookFormat } from '@livedoc/sheets';
import { convertedFormat } from '@livedoc/sheets/files';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import { useEditorLines } from '@/components/chrome/lines/editor-lines-context';
import { OfficeTitleRow } from '@/components/office/OfficeTitleRow';
import type { OfficeZoom } from '@/components/office/OfficeZoomField';
import type { ShowFormulas } from '@/components/sheets/show-formulas';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { WorkbookScope } from '@/lib/api/workbook';
import { apiDownloadWorkbook, type DownloadFormat } from '@/lib/api/workbook';
import { debugLog } from '@/lib/debug-log';
import { downloadBlob } from '@/lib/download-blob';
import {
  nameFromFile,
  openingNotice,
  openSpreadsheetFile,
} from '@/lib/spreadsheet/open-spreadsheet-file';
import { UNTITLED_SPREADSHEET } from '@/lib/spreadsheet/spreadsheet-name';
import {
  CONVERT_ITEM_ID,
  DOWNLOAD_ITEMS,
  SHEET_DOWNLOAD_ITEMS,
  spreadsheetMenus,
} from '@/lib/spreadsheet/spreadsheet-menus';
import {
  historyBindings,
  type SpreadsheetHistory,
} from '@/lib/spreadsheet/spreadsheet-menu-bindings';
import { spreadsheetChoices } from '@/lib/spreadsheet/spreadsheet-choices';
import { bordersChoice } from './borders-choice';
import { SPREADSHEET_SHORTCUTS } from '@/lib/spreadsheet/spreadsheet-shortcuts';
import { SPREADSHEET_TOOLBAR } from '@/lib/spreadsheet/spreadsheet-toolbar';
import { zoomBindings } from '@/lib/spreadsheet/spreadsheet-zoom';
import { track } from '@/lib/telemetry';
import { ConversionDialog } from './ConversionDialog';
import { useChannelBindings, type OfficeBindingsChannel } from './office-bindings-channel';
import { useWorkbookConversion } from './useWorkbookConversion';

const FORMAT_PILL = { ods: '.ODS', fods: '.FODS', xlsx: '.XLSX' } as const;
const FORMAT_TITLE = {
  ods: 'OpenDocument format',
  fods: 'OpenDocument format, flat',
  xlsx: 'Excel format',
} as const;
const TELEMETRY_FORMAT = {
  ods: 'Ods',
  fods: 'Fods',
  xlsx: 'Xlsx',
  csv: 'Csv',
  tsv: 'Tsv',
} as const;
const OPEN_ACCEPT = [
  '.ods',
  '.fods',
  '.xlsx',
  '.xlsm',
  '.csv',
  '.tsv',
  '.txt',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/tab-separated-values',
  'text/plain',
].join(',');

/** The session's level from the sheet's two permissions: a Participant writes cells, an Editor shapes the sheet. */
export function spreadsheetLevel(canWrite: boolean, canShape: boolean): AccessLevel {
  if (!canWrite) return 'view';
  return canShape ? 'edit' : 'participate';
}

export function SpreadsheetTitleRow({
  scope,
  tabId,
  format,
  locale,
  documentName,
  level,
  history,
  channel,
  zoom,
  formulas,
  onFullScreen,
  keyScope,
  onWorkbook,
  pushUndo,
}: {
  scope: WorkbookScope;
  tabId: string;
  format: WorkbookFormat;
  // The workbook's locale: the Number menu's examples are drawn in it.
  locale: string;
  documentName: string;
  level: AccessLevel;
  // The person's one timeline; null before the editor has one.
  history: SpreadsheetHistory | null;
  channel: OfficeBindingsChannel;
  // The person's zoom on the grid (surface.md "Grid"): the toolbar's field and View › Zoom.
  zoom: OfficeZoom;
  // View › Show › Formulas (grid-and-editing.md "Formulas").
  formulas: ShowFormulas;
  // View › Full Screen (surface.md "Layout").
  onFullScreen: () => void;
  keyScope: RefObject<HTMLElement | null>;
  onWorkbook: ((workbook: WorkbookRecord) => void) | undefined;
  pushUndo: (step: ItemUndoStep) => void;
}) {
  // The document's own parts in the shell's title row (office-shell.md "Title row").
  const chrome = useEditorLines()?.office ?? null;
  const [problem, setProblem] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const grid = useChannelBindings(channel);
  const catalogue = useMemo(
    () => spreadsheetMenus(format, locale, grid.recentCodes),
    [format, locale, grid.recentCodes],
  );
  const fontSize = useMemo(
    () => (grid.fontSize === null ? null : { read: () => grid.fontSize, set: grid.setFontSize }),
    [grid],
  );
  const fontFamily = useMemo(
    () =>
      grid.fontFamily === null
        ? null
        : { read: () => grid.fontFamily, set: grid.setFontFamily, telemetryKind: 'Spreadsheet' },
    [grid],
  );
  const download = async (asked: DownloadFormat) => {
    setProblem(null);
    try {
      const { blob, fileName } = await apiDownloadWorkbook(scope, asked, tabId);
      downloadBlob(blob, fileName);
      track('Spreadsheet', 'Exported', TELEMETRY_FORMAT[asked]);
    } catch (error) {
      setProblem('The file could not be downloaded. Try again.');
      debugLog('[workbook] download failed', { format: asked, error: String(error) });
    }
  };
  const conversion = useWorkbookConversion({
    scope,
    format,
    onWorkbook,
    pushUndo,
    download,
    setProblem,
  });
  const actions: OfficeActions = {
    ...grid.actions,
    ...historyBindings(history, level !== 'view'),
    ...zoomBindings(zoom),
    'show-formulas': { run: formulas.toggle, checked: formulas.shown },
    'full-screen': { run: onFullScreen },
    ...Object.fromEntries(
      DOWNLOAD_ITEMS.map((item) => [
        item.id,
        {
          // The other standard is a converted copy, its losses listed first (files-and-print.md "Download").
          run: () =>
            WorkbookRecord.sameStandard(item.format, format)
              ? void download(item.format)
              : conversion.open('download', item.format),
        },
      ]),
    ),
    // The open sheet as CSV or TSV: no conversion, its values as shown (files-and-print.md "Download").
    ...Object.fromEntries(
      SHEET_DOWNLOAD_ITEMS.map((item) => [item.id, { run: () => void download(item.format) }]),
    ),
    // Convert is an Editor's (files-and-print.md "Who may do what"): bound only for one, so no one else sees it.
    ...(level === 'edit'
      ? { [CONVERT_ITEM_ID]: { run: () => conversion.open('convert', convertedFormat(format)) } }
      : {}),
  }; // The menus' choices, and the Borders panel for an Editor (formatting.md "Borders").
  const choices = {
    ...spreadsheetChoices(catalogue, actions),
    ...(grid.borders ? { borders: bordersChoice(grid.borders) } : {}),
  };

  const open = async (file: File) => {
    setProblem(null);
    const name = nameFromFile(file.name);
    setOpening(openingNotice(name, 0));
    const opened = await openSpreadsheetFile(scope.ownerId, file, (share) =>
      setOpening(openingNotice(name, share)),
    );
    setOpening(null);
    if (!opened.ok) return setProblem(opened.message);
    track('Spreadsheet', 'Created', 'Import');
    track('Spreadsheet', 'Imported', TELEMETRY_FORMAT[opened.imported]);
    window.location.assign(`/document/${opened.documentId}`);
  };
  return (
    <>
      <OfficeTitleRow
        name={documentName || UNTITLED_SPREADSHEET}
        format={FORMAT_PILL[format]}
        formatTitle={FORMAT_TITLE[format]}
        problem={problem}
        notice={opening}
        catalogue={catalogue}
        level={level}
        actions={actions}
        shortcuts={SPREADSHEET_SHORTCUTS}
        keyScope={keyScope}
        opening={{ accept: OPEN_ACCEPT, onFile: (file) => void open(file) }}
        telemetryKind="Spreadsheet"
        chrome={chrome}
        tabId={tabId}
        toolbar={SPREADSHEET_TOOLBAR}
        fontSize={fontSize}
        fontFamily={fontFamily}
        colours={grid.colours}
        zoom={zoom}
        choices={choices}
        refresh={channel.subscribe}
      />
      <ConversionDialog
        state={conversion.state}
        onConfirm={conversion.confirm}
        onRetry={conversion.retry}
        onCancel={conversion.cancel}
      />
    </>
  );
}
